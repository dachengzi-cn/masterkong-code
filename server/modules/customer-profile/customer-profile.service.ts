import { Injectable, Inject, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { customerProfile } from '@server/database/schema';
import { eq, count, sql, and, or, like } from 'drizzle-orm';
import { DatasetService } from '@server/modules/dataset/dataset.service';
import type {
  CustomerProfile,
  CustomerSummary,
  UploadCustomerResponse,
  GetCustomersResponse,
  DeleteCustomerResponse,
  GetCustomerDimensionsResponse,
  CustomerDimension,
  FieldConfig,
  ClassificationRow,
  GetClassificationResponse,
  StoreFormatItem,
  FilterOptions,
  FormatDrilldownResponse,
  FormatDrilldownPersonnel,
  FormatDrilldownMonthlyRate,
  CustomerUploadRecord,
} from '@shared/api.interface';

export const DEALER_TYPE_TO_FORMAT: Record<string, string> = {};
const FORMAT_MAP: Array<[string[], string]> = [
  [['CA0','CA1','CA2','CA3','CA4','CA5','CA6','CA7','CA8','CA9'], 'CA'],
  [['CB0','CB1','CB2','CB3','CB4'], 'CB'],
  [['MA3','MA4','MA5','MA6','MA7','MA8','MA9'], 'MA'],
  [['餐饮A'], '餐饮'],
  [['厂矿0','厂矿1','厂矿2','厂矿3','厂矿4','厂矿5','厂矿6'], '厂矿'],
  [['大学校园0','大学校园1','大学校园2','大学校园3','大学校园4','大学校园5','大学校园6','大学校园7','大学校园8','大学校园9'], '大学校园'],
  [['电竞酒店'], '电竞酒店'],
  [['火车站0','火车站1','火车站2','火车站3','火车站4','火车站5'], '火车站'],
  [['机构A'], '机构'],
  [['经济酒店'], '经济酒店'],
  [['景点A','景点B'], '景点'],
  [['零食0','零食1','零食2','零食3','零食7'], '零食'],
  [['棋牌室'], '棋牌室'],
  [['汽车站0','汽车站1','汽车站2','汽车站3'], '汽车站'],
  [['前置仓'], '前置仓'],
  [['网吧A'], '网吧'],
  [['休闲/运动A'], '休闲/运动'],
  [['一阶客户自售'], '自售'],
  [['医院0','医院1','医院2'], '医院'],
  [['桌球厅'], '桌球厅'],
];
for (const [keys, val] of FORMAT_MAP) {
  for (const k of keys) DEALER_TYPE_TO_FORMAT[k] = val;
}

interface InMemoryRecord {
  customerCode: string;
  customerName: string;
  region: string;
  tier: string;
  extras: Record<string, unknown>;
  _created_at: Date;
  _updated_at: Date;
  _created_by: string;
  _updated_by: string;
}

/** 分类汇总所需的客户记录（内存/DB 两种模式统一使用） */
interface ClassificationRecord {
  customerCode: string;
  region: string;
  tier: string;
  extras: Record<string, unknown>;
}

@Injectable()
export class CustomerProfileService implements OnModuleInit {
  private readonly logger = new Logger(CustomerProfileService.name);
  private useMemoryStorage = true;
  private memoryStore = new Map<string, InMemoryRecord>();

  // 短时 TTL 缓存：避免一次页面加载中多个 API 重复全表查询
  private unpaginatedCache: { data: Array<{ customerCode: string; customerName: string; region: string; tier: string; extras: Record<string, unknown> }>; expires: number } | null = null;
  private static readonly CACHE_TTL_MS = 10_000;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.verifyDatabase();
    await this.validatePaidAmountConsistency();
  }

  /**
   * 付费金额数据一致性校验。
   *
   * 付费金额唯一来源为费用资料（expense_profile 中 sheetType='ATP费用' 的「计划付费金额」）。
   * 本方法校验费用资料引用数据的可用性与准确性，在服务启动时及客户总览加载（getClassification）
   * 时执行，确保各业务模块展示/计算的付费金额与费用资料保持一致。
   */
  private async validatePaidAmountConsistency(): Promise<void> {
    if (!DatasetService._instance) return;
    try {
      const summary = await DatasetService._instance.getAtpLatestMonthPaidMap();
      if (summary === null) {
        this.logger.warn(
          '[数据一致性校验] 费用资料中未找到 sheetType=ATP费用 的记录，付费金额数据缺失，各模块付费指标统一为 0',
        );
        return;
      }
      let invalidCount = 0;
      const invalidCodes: string[] = [];
      for (const [code, amount] of summary.paidMap) {
        if (!Number.isFinite(amount)) {
          invalidCount++;
          if (invalidCodes.length < 5) invalidCodes.push(code);
        }
      }
      if (invalidCount > 0) {
        this.logger.warn(
          `[数据一致性校验] 费用资料 ATP费用 中存在 ${invalidCount} 条无效付费金额记录（客户编码：${invalidCodes.join('、')}...）`,
        );
      } else {
        this.logger.log(
          `[数据一致性校验] 通过：费用资料 ATP费用 付费金额数据有效，覆盖 ${summary.paidMap.size} 个客户，最新月份 ${summary.month}`,
        );
      }
    } catch (err) {
      this.logger.warn(`[数据一致性校验] 执行失败: ${(err as Error).message}`);
    }
  }

  /**
   * 付费金额相关 extras 键黑名单：客户资料上传时一律过滤。
   * 付费金额唯一来源为费用资料（expense_profile 中 sheetType='ATP费用' 的「计划付费金额」）。
   */
  private static readonly PAID_AMOUNT_EXTRA_KEYS = [
    '付费金额', '付费金额(元)', '付费金额（元）', '付费金额/元', '付费金额元',
  ];

  private sanitizeExtras(extrasObj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extrasObj)) {
      const key = String(k).trim();
      if (CustomerProfileService.PAID_AMOUNT_EXTRA_KEYS.includes(key)) continue;
      if (v === undefined || v === null) sanitized[key] = '';
      else if (v instanceof Date) sanitized[key] = v.toISOString();
      else if (typeof v === 'object') sanitized[key] = JSON.stringify(v);
      else sanitized[key] = String(v);
    }
    return sanitized;
  }

  private async verifyDatabase(): Promise<void> {
    try {
      const [result] = await this.db
        .select({ total: count() })
        .from(customerProfile)
        .limit(1);
      this.useMemoryStorage = false;
      this.logger.log(`数据库正常 (${result?.total ?? 0} 条记录)，使用数据库存储`);
    } catch (err) {
      this.logger.warn(`数据库不可用 (${(err as Error).message})，切换到内存存储`);
      this.useMemoryStorage = true;
    }
  }

  async getSummary(): Promise<CustomerSummary> {
    if (this.useMemoryStorage) {
      const records = Array.from(this.memoryStore.values());
      const regions = Array.from(new Set(records.map((r) => r.region).filter(Boolean))).sort();
      const tiers = Array.from(new Set(records.map((r) => r.tier).filter(Boolean))).sort();
      return { totalCustomers: records.length, regions, tiers };
    }
    try {
      const [totalResult, regionsResult, tiersResult] = await Promise.all([
        this.db.select({ total: count() }).from(customerProfile),
        this.db.execute(
          sql`SELECT DISTINCT region FROM customer_profile WHERE region != '' ORDER BY region`,
        ),
        this.db.execute(
          sql`SELECT DISTINCT tier FROM customer_profile WHERE tier != '' ORDER BY tier`,
        ),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      return {
        totalCustomers: isNaN(total) ? 0 : total,
        regions: (regionsResult as unknown as Array<{ region: string }>).map((r) => r.region),
        tiers: (tiersResult as unknown as Array<{ tier: string }>).map((t) => t.tier),
      };
    } catch (err) {
      this.logger.warn(`getSummary 数据库失败，切换到内存: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getSummary();
    }
  }

  async getLatestUploadRecord(): Promise<CustomerUploadRecord | null> {
    if (this.useMemoryStorage) {
      const records = Array.from(this.memoryStore.values());
      if (records.length === 0) return null;
      const sorted = records.sort((a, b) => b._updated_at.getTime() - a._updated_at.getTime());
      return {
        fileName: '数据模板-客户资料',
        uploadTime: sorted[0]._updated_at.toLocaleString('zh-CN', {
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        rowCount: records.length,
      };
    }
    try {
      const [totalResult, latestResult] = await Promise.all([
        this.db.select({ total: count() }).from(customerProfile),
        this.db.execute(
          sql`SELECT _updated_at FROM customer_profile ORDER BY _updated_at DESC LIMIT 1`,
        ),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      if (isNaN(total) || total === 0) return null;
      const latestRow = (latestResult as unknown as Array<{ _updated_at: string }>)[0];
      const uploadTime = latestRow?._updated_at
        ? new Date(latestRow._updated_at).toLocaleString('zh-CN', {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })
        : new Date().toLocaleString('zh-CN', {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          });
      return { fileName: '数据模板-客户资料', uploadTime, rowCount: total };
    } catch (err) {
      this.logger.warn(`getLatestUploadRecord 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getLatestUploadRecord();
    }
  }

  async findAll(
    page: number = 1,
    pageSize: number = 20,
    keyword?: string,
  ): Promise<GetCustomersResponse> {
    if (this.useMemoryStorage) {
      let records = Array.from(this.memoryStore.values());
      if (keyword) {
        const kw = keyword.toLowerCase();
        records = records.filter(
          (r) => r.customerCode.toLowerCase().includes(kw) || r.customerName.toLowerCase().includes(kw),
        );
      }
      records.sort((a, b) => a.customerCode.localeCompare(b.customerCode));
      const total = records.length;
      const offset = (page - 1) * pageSize;
      const items = records.slice(offset, offset + pageSize).map((r) => ({
        customerCode: r.customerCode,
        customerName: r.customerName,
        region: r.region,
        tier: r.tier,
        extras: r.extras,
      }));
      return { items, total };
    }
    try {
      const offset = (page - 1) * pageSize;
      const conditions = [];
      if (keyword) {
        conditions.push(
          or(
            like(customerProfile.customerCode, `%${keyword}%`),
            like(customerProfile.customerName, `%${keyword}%`),
          ),
        );
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, totalResult] = await Promise.all([
        this.db
          .select({
            customerCode: customerProfile.customerCode,
            customerName: customerProfile.customerName,
            region: customerProfile.region,
            tier: customerProfile.tier,
            extras: customerProfile.extras,
          })
          .from(customerProfile)
          .where(whereClause)
          .orderBy(customerProfile.customerCode)
          .limit(pageSize)
          .offset(offset),
        this.db.select({ total: count() }).from(customerProfile).where(whereClause),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      return {
        items: items.map((item) => ({
          customerCode: item.customerCode,
          customerName: item.customerName,
          region: item.region,
          tier: item.tier,
          extras: (item.extras as Record<string, unknown>) ?? {},
        })),
        total,
      };
    } catch (err) {
      this.logger.warn(`findAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.findAll(page, pageSize, keyword);
    }
  }

  /** 获取全部客户资料（供内存模式下的分析模块使用） */
  getAllProfiles(): Array<{ customerCode: string; customerName: string; region: string; tier: string; extras: Record<string, unknown> }> {
    return Array.from(this.memoryStore.values()).map((r) => ({
      customerCode: r.customerCode,
      customerName: r.customerName,
      region: r.region,
      tier: r.tier,
      extras: r.extras,
    }));
  }

  /** 获取全部客户资料（供分析模块使用） */
  async findAllUnpaginated(): Promise<Array<{ customerCode: string; customerName: string; region: string; tier: string; extras: Record<string, unknown> }>> {
    // 检查缓存是否命中
    if (this.unpaginatedCache && this.unpaginatedCache.expires > Date.now()) {
      return this.unpaginatedCache.data;
    }

    if (this.useMemoryStorage) {
      const data = this.getAllProfiles();
      this.unpaginatedCache = { data, expires: Date.now() + CustomerProfileService.CACHE_TTL_MS };
      return data;
    }
    try {
      const items = await this.db
        .select({
          customerCode: customerProfile.customerCode,
          customerName: customerProfile.customerName,
          region: customerProfile.region,
          tier: customerProfile.tier,
          extras: customerProfile.extras,
        })
        .from(customerProfile)
        .orderBy(customerProfile.customerCode);
      const data = items.map((item) => ({
        customerCode: item.customerCode,
        customerName: item.customerName,
        region: item.region,
        tier: item.tier,
        extras: (item.extras as Record<string, unknown>) ?? {},
      }));
      this.unpaginatedCache = { data, expires: Date.now() + CustomerProfileService.CACHE_TTL_MS };
      return data;
    } catch (err) {
      this.logger.warn(`findAllUnpaginated 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.findAllUnpaginated();
    }
  }

  invalidateUnpaginatedCache(): void {
    this.unpaginatedCache = null;
  }

  async upsertBatch(
    customers: CustomerProfile[],
    userId: string,
  ): Promise<UploadCustomerResponse> {
    if (this.useMemoryStorage) {
      let inserted = 0;
      let updated = 0;
      const now = new Date();
      for (const c of customers) {
        const code = String(c.customerCode ?? '').trim();
        if (!code) continue;
        const existing = this.memoryStore.get(code);
        const extrasObj = (c.extras ?? {}) as Record<string, unknown>;
        const sanitizedExtras = this.sanitizeExtras(extrasObj);
        if (existing) {
          existing.customerName = String(c.customerName ?? '').trim();
          existing.region = String(c.region ?? '').trim();
          existing.tier = String(c.tier ?? '').trim();
          existing.extras = sanitizedExtras;
          existing._updated_at = now;
          existing._updated_by = userId;
          updated++;
        } else {
          this.memoryStore.set(code, {
            customerCode: code,
            customerName: String(c.customerName ?? '').trim(),
            region: String(c.region ?? '').trim(),
            tier: String(c.tier ?? '').trim(),
            extras: sanitizedExtras,
            _created_at: now,
            _updated_at: now,
            _created_by: userId,
            _updated_by: userId,
          });
          inserted++;
        }
      }
      this.logger.log(`内存存储: 新增 ${inserted} 条，更新 ${updated} 条，共 ${customers.length} 条`);
      return { inserted, updated, total: customers.length };
    }

    try {
      const [beforeResult] = await this.db
        .select({ total: count() })
        .from(customerProfile);
      const beforeCount = parseInt(String(beforeResult?.total ?? 0), 10);
      const BATCH_SIZE = 200;
      let totalProcessed = 0;

      for (let i = 0; i < customers.length; i += BATCH_SIZE) {
        const batch = customers.slice(i, i + BATCH_SIZE);
        const rows = batch.map((c) => {
          const code = String(c.customerCode ?? '').trim();
          const name = String(c.customerName ?? '').trim();
          const region = String(c.region ?? '').trim();
          const tier = String(c.tier ?? '').trim();
          const extrasObj = (c.extras ?? {}) as Record<string, unknown>;
          const sanitizedExtras = this.sanitizeExtras(extrasObj);
          return {
            customerCode: code,
            customerName: name,
            region, tier,
            extras: sanitizedExtras,
            createdBy: userId,
            updatedBy: userId,
          };
        });

        await this.db
          .insert(customerProfile)
          .values(rows)
          .onConflictDoUpdate({
            target: customerProfile.customerCode,
            set: {
              customerName: sql`EXCLUDED.customer_name`,
              region: sql`EXCLUDED.region`,
              tier: sql`EXCLUDED.tier`,
              extras: sql`EXCLUDED.extras`,
              updatedBy: sql`EXCLUDED._updated_by`,
            },
          });
        totalProcessed += batch.length;
        this.logger.log(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length} records (total ${totalProcessed}/${customers.length})`,
        );
      }

      const [afterResult] = await this.db
        .select({ total: count() })
        .from(customerProfile);
      const afterCount = parseInt(String(afterResult?.total ?? 0), 10);
      const inserted = Math.max(0, afterCount - beforeCount);
      const updated = Math.max(0, customers.length - inserted);
      this.logger.log(`Customer upsert complete: ${inserted} inserted, ${updated} updated, total ${customers.length}`);
      this.invalidateUnpaginatedCache();
      return { inserted, updated, total: customers.length };
    } catch (err) {
      this.logger.error(`upsertBatch 数据库失败，切换到内存: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.upsertBatch(customers, userId);
    }
  }

  async removeAll(userId: string): Promise<DeleteCustomerResponse> {
    if (this.useMemoryStorage) {
      const count = this.memoryStore.size;
      this.memoryStore.clear();
      this.logger.log(`内存存储: 清空 ${count} 条记录 (by ${userId})`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    }
    try {
      await this.db.delete(customerProfile);
      this.logger.log(`All customer profiles deleted by ${userId}`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.removeAll(userId);
    }
  }

  async removeOne(id: string, userId: string): Promise<DeleteCustomerResponse> {
    if (this.useMemoryStorage) {
      const exists = this.memoryStore.has(id);
      if (!exists) throw new NotFoundException(`Customer ${id} not found`);
      this.memoryStore.delete(id);
      this.logger.log(`内存存储: 删除 ${id} (by ${userId})`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    }
    try {
      const [deleted] = await this.db
        .delete(customerProfile)
        .where(eq(customerProfile.id, id))
        .returning({ id: customerProfile.id });
      if (!deleted) throw new NotFoundException(`Customer ${id} not found`);
      this.logger.log(`Customer profile deleted: ${id} by ${userId}`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeOne 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { success: true };
    }
  }

  async getDimensions(datasetId?: string): Promise<GetCustomerDimensionsResponse> {
    const dimensions: CustomerDimension[] = [
      { field: 'region', label: '区域' },
      { field: 'tier', label: '层级' },
    ];

    if (this.useMemoryStorage) {
      return { dimensions, matched: this.memoryStore.size > 0 };
    }
    try {
      const [totalResult] = await this.db
        .select({ total: count() })
        .from(customerProfile);
      const hasCustomers = parseInt(String(totalResult?.total ?? 0), 10) > 0;
      return { dimensions, matched: hasCustomers };
    } catch (err) {
      this.logger.warn(`getDimensions 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { dimensions, matched: false };
    }
  }

  async getFilterOptions(region?: string[]): Promise<FilterOptions> {
    if (this.useMemoryStorage) {
      const records = Array.from(this.memoryStore.values());
      const filtered = region && region.length > 0
        ? records.filter((r) => region.includes(r.region))
        : records;
      const regions = Array.from(new Set(records.map((r) => r.region).filter(Boolean))).sort();
      const tiers = Array.from(new Set(records.map((r) => r.tier).filter(Boolean))).sort();
      const dealerTypesSet = new Set<string>();
      const salesRepsSet = new Set<string>();
      for (const r of filtered) {
        const dt = String(r.extras['经销商类型'] ?? '').trim();
        const sr = String(r.extras['客户经理'] ?? '').trim();
        if (dt) dealerTypesSet.add(DEALER_TYPE_TO_FORMAT[dt] ?? dt);
        if (sr) salesRepsSet.add(sr);
      }
      
      // 从交易数据中补充业代（虚拟服务点的业代）
      const memDataset = DatasetService.getLatestMemoryDataset();
      if (memDataset && memDataset.records) {
        for (const record of memDataset.records) {
          // 交易数据中的业代字段：人员-业代
          const transSalesRep = String(record['人员-业代'] ?? '').trim();
          if (transSalesRep) {
            salesRepsSet.add(transSalesRep);
          }
        }
      }
      
      return {
        regions, tiers,
        dealerTypes: Array.from(dealerTypesSet).sort(),
        brands: [],
        salesReps: Array.from(salesRepsSet).sort(),
        specifications: [],
      };
    }
    try {
      const regionFilter = region && region.length > 0
        ? sql` AND region IN (${sql.join(region.map((r) => sql`${r}`), sql`, `)})`
        : sql``;
      const [regionsResult, tiersResult, dealerTypesResult, salesRepsResult, brandsResult, transSalesRepsResult] = await Promise.all([
        this.db.execute(sql`SELECT DISTINCT region FROM customer_profile WHERE region != '' ORDER BY region`),
        this.db.execute(sql`SELECT DISTINCT tier FROM customer_profile WHERE tier != '' ORDER BY tier`),
        this.db.execute(
          sql`SELECT DISTINCT extras->>'经销商类型' as dealer_type FROM customer_profile WHERE extras->>'经销商类型' IS NOT NULL AND extras->>'经销商类型' != ''${regionFilter} ORDER BY dealer_type`,
        ),
        this.db.execute(
          sql`SELECT DISTINCT extras->>'客户经理' as sales_rep FROM customer_profile WHERE extras->>'客户经理' IS NOT NULL AND extras->>'客户经理' != ''${regionFilter} ORDER BY sales_rep`,
        ),
        this.db.execute(
          sql`SELECT DISTINCT content->>'品牌' as brand FROM data_record WHERE content->>'品牌' IS NOT NULL AND content->>'品牌' != '' ORDER BY brand`,
        ),
        // 从交易数据中获取业代（虚拟服务点的业代）
        this.db.execute(
          sql`SELECT DISTINCT content->>'人员-业代' as sales_rep FROM data_record WHERE content->>'人员-业代' IS NOT NULL AND content->>'人员-业代' != '' ORDER BY sales_rep`,
        ),
      ]);
      const rawTypes = (dealerTypesResult as unknown as Array<{ dealer_type: string }>).map((d) => d.dealer_type);
      const simplifiedSet = new Set<string>();
      for (const raw of rawTypes) simplifiedSet.add(DEALER_TYPE_TO_FORMAT[raw] ?? raw);
      
      // 合并客户资料的业代和交易数据的业代
      const profileSalesReps = (salesRepsResult as unknown as Array<{ sales_rep: string }>).map((s) => s.sales_rep);
      const transSalesReps = (transSalesRepsResult as unknown as Array<{ sales_rep: string }>).map((s) => s.sales_rep);
      const allSalesRepsSet = new Set([...profileSalesReps, ...transSalesReps]);
      
      return {
        regions: (regionsResult as unknown as Array<{ region: string }>).map((r) => r.region),
        tiers: (tiersResult as unknown as Array<{ tier: string }>).map((t) => t.tier),
        dealerTypes: Array.from(simplifiedSet).sort(),
        brands: (brandsResult as unknown as Array<{ brand: string }>).map((b) => b.brand),
        salesReps: Array.from(allSalesRepsSet).sort(),
        specifications: [],
      };
    } catch (err) {
      this.logger.warn(`getFilterOptions 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getFilterOptions(region);
    }
  }

  async getClassification(): Promise<GetClassificationResponse> {
    // ── 统一数据源：付费相关指标一律引用 ATP 费用分析系统 ──
    // 通过 DatasetService（ATP 费用分析系统数据服务）获取「最新可用月份」及其各门店付费金额映射，
    // 口径与 ATP 绩效分析完全一致（expense_profile 中 sheetType='ATP费用'，计划付费金额÷3 分摊至 3 个月）。
    const atpSummary = DatasetService._instance
      ? await DatasetService._instance.getAtpLatestMonthPaidMap()
      : null;
    const atpPaidMap = atpSummary?.paidMap ?? new Map<string, number>();
    const paidPeriod = atpSummary?.month ?? null;
    const hasAtpData = atpSummary !== null;

    // 数据校验：无 ATP 费用数据时输出告警，付费指标统一为 0
    if (!hasAtpData) {
      this.logger.warn(
        '[数据校验] expense_profile 中未找到 sheetType=ATP费用 的记录，客户总览付费门店数/付费金额统一显示为 0',
      );
    }

    // 获取客户记录（内存模式直接读取；DB 模式按客户编码明细查询，付费在 JS 侧统一按 ATP map 计算）
    let records: ClassificationRecord[];
    if (this.useMemoryStorage) {
      records = Array.from(this.memoryStore.values());
    } else {
      try {
        const result = await this.db.execute(
          sql.raw(
            'SELECT region, tier, customer_code, ' +
            "COALESCE(extras->>'客户经理', '') as customer_manager, " +
            "COALESCE(extras->>'经销商类型', '') as dealer_type " +
            'FROM customer_profile',
          ),
        );
        records = (result as unknown as Array<{
          region: string; tier: string; customer_code: string;
          customer_manager: string; dealer_type: string;
        }>).map((r) => ({
          customerCode: r.customer_code,
          region: r.region,
          tier: r.tier,
          extras: {
            '客户经理': r.customer_manager,
            '经销商类型': r.dealer_type,
          },
        }));
      } catch (err) {
        this.logger.warn(`getClassification 数据库失败，切换到内存: ${(err as Error).message}`);
        this.useMemoryStorage = true;
        return this.getClassification();
      }
    }

    // 付费指标（付费门店数 / 付费金额）统一按 atpPaidMap 计算，不再读取客户资料中的「付费金额」字段
    const aggregated = this.aggregateClassification(records, atpPaidMap);

    return {
      ...aggregated,
      paidDataSource: 'atp',
      paidPeriod,
      hasAtpData,
    };
  }

  /**
   * 聚合分类汇总。付费指标（paidStoreCount / paidAmount）统一按 atpPaidMap 计算，
   * 付费金额唯一来源为费用资料（expense_profile 中 sheetType='ATP费用'）。
   */
  private aggregateClassification(
    records: ClassificationRecord[],
    atpPaidMap: Map<string, number>,
  ): {
    rows: ClassificationRow[];
    regionSummary: GetClassificationResponse['regionSummary'];
    tierSummary: GetClassificationResponse['tierSummary'];
    storeFormatSummary: StoreFormatItem[];
    totalStoreCount: number;
    totalPaidStoreCount: number;
    totalPaidAmount: number;
  } {
    // 客户编码统一为 ATP 费用分析系统的标准格式，确保与 atpPaidMap 键一致
    const normalizeCode = (code: string) =>
      DatasetService._instance?.normalizeAtpCustomerCode(code) ?? String(code ?? '').trim();

    // 按 (region, tier, customerManager) 分组汇总，每个业代一行
    const personMap = new Map<string, {
      region: string; tier: string; customerManager: string;
      storeCount: number; paidStoreCount: number; paidAmount: number;
    }>();
    const regionMap = new Map<string, { storeCount: number; paidStoreCount: number; paidAmount: number }>();
    const tierMap = new Map<string, { storeCount: number; paidStoreCount: number; paidAmount: number }>();
    let totalStoreCount = 0, totalPaidStoreCount = 0, totalPaidAmount = 0;

    for (const r of records) {
      const customerManager = String(r.extras['客户经理'] ?? '').trim();
      const paidAmount = atpPaidMap.get(normalizeCode(String(r.customerCode ?? '').trim())) ?? 0;
      const paidStoreCount = paidAmount > 0 ? 1 : 0;

      totalStoreCount++;
      totalPaidStoreCount += paidStoreCount;
      totalPaidAmount += paidAmount;

      // 人员聚合：每个 (区域, 层级, 业代) 一行
      const personKey = `${r.region}||${r.tier}||${customerManager}`;
      const personEntry = personMap.get(personKey) ?? {
        region: r.region, tier: r.tier, customerManager,
        storeCount: 0, paidStoreCount: 0, paidAmount: 0,
      };
      personEntry.storeCount++;
      personEntry.paidStoreCount += paidStoreCount;
      personEntry.paidAmount += paidAmount;
      personMap.set(personKey, personEntry);

      // 区域/层级聚合
      for (const [key, map] of [[r.region, regionMap], [r.tier, tierMap]] as const) {
        const entry = map.get(key) ?? { storeCount: 0, paidStoreCount: 0, paidAmount: 0 };
        entry.storeCount++;
        entry.paidStoreCount += paidStoreCount;
        entry.paidAmount += paidAmount;
        map.set(key, entry);
      }
    }

    // 转换为 rows —— 每行一个业代，按区域/层级/业代排序
    const rows: ClassificationRow[] = Array.from(personMap.values())
      .map((p) => ({
        region: p.region,
        tier: p.tier,
        customerManager: p.customerManager,
        storeCount: p.storeCount,
        paidStoreCount: p.paidStoreCount,
        paidAmount: Math.round(p.paidAmount * 100) / 100,
      }))
      .sort((a, b) => a.region.localeCompare(b.region)
        || a.tier.localeCompare(b.tier)
        || a.customerManager.localeCompare(b.customerManager));

    // 一阶门店形态分布
    const simplify = (val: string) => DEALER_TYPE_TO_FORMAT[val] ?? val;
    const formatMap = new Map<string, Map<string, number>>();
    for (const r of records) {
      if (r.tier !== '一阶') continue;
      const simpleType = simplify(String(r.extras['经销商类型'] ?? '').trim());
      const regionData = formatMap.get(r.region) ?? new Map<string, number>();
      regionData.set(simpleType, (regionData.get(simpleType) ?? 0) + 1);
      formatMap.set(r.region, regionData);
    }
    const storeFormatSummary: StoreFormatItem[] = [];
    for (const [reg, typeMap] of formatMap) {
      for (const [simpleType, cnt] of typeMap) {
        storeFormatSummary.push({ region: reg, simpleType, storeCount: cnt });
      }
    }
    storeFormatSummary.sort((a, b) => a.region.localeCompare(b.region) || b.storeCount - a.storeCount);

    return {
      rows,
      regionSummary: Array.from(regionMap.entries()).map(([region, v]) => ({
        region, ...v, paidAmount: Math.round(v.paidAmount * 100) / 100,
      })),
      tierSummary: Array.from(tierMap.entries()).map(([tier, v]) => ({
        tier, ...v, paidAmount: Math.round(v.paidAmount * 100) / 100,
      })),
      totalStoreCount, totalPaidStoreCount,
      totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
      storeFormatSummary,
    };
  }

  async getFormatDrilldown(region: string): Promise<FormatDrilldownResponse> {
    if (this.useMemoryStorage) {
      const personnelMap = new Map<string, Map<string, number>>();
      const allFormatTypes = new Set<string>();
      const records = Array.from(this.memoryStore.values()).filter((r) => r.region === region && r.tier === '一阶');

      for (const r of records) {
        const name = String(r.extras['客户经理'] ?? '').trim();
        const dt = String(r.extras['经销商类型'] ?? '').trim();
        const simpleType = DEALER_TYPE_TO_FORMAT[dt] ?? (dt || '其他');
        allFormatTypes.add(simpleType);
        const pMap = personnelMap.get(name) ?? new Map<string, number>();
        pMap.set(simpleType, (pMap.get(simpleType) ?? 0) + 1);
        personnelMap.set(name, pMap);
      }

      const formatTypes = Array.from(allFormatTypes).sort();
      const personnel: FormatDrilldownPersonnel[] = Array.from(personnelMap.entries())
        .map(([name, fmtMap]) => {
          const formats: Record<string, number> = {};
          let totalStores = 0;
          for (const ft of formatTypes) {
            const cnt = fmtMap.get(ft) ?? 0;
            formats[ft] = cnt;
            totalStores += cnt;
          }
          return { name, formats, totalStores };
        })
        .sort((a, b) => b.totalStores - a.totalStores);

      const totalByFormat = new Map<string, number>();
      for (const p of personnel) {
        for (const ft of formatTypes) {
          totalByFormat.set(ft, (totalByFormat.get(ft) ?? 0) + p.formats[ft]);
        }
      }

      // 计算近6个月各形态成交率（与成交分析模块保持一致的计算逻辑）
      const monthlyRates: FormatDrilldownMonthlyRate[] =
        (await DatasetService._instance?.computeMonthlyFormatDealRates(
          region,
          formatTypes,
          totalByFormat,
          '一阶',
        )) ?? [];

      return { personnel, monthlyRates, formatTypes };
    }
    try {
      const safeRegion = region.replace(/'/g, "''");
      const personnelSql =
        "SELECT COALESCE(extras->>'客户经理', '') as sales_rep, " +
        "COALESCE(extras->>'经销商类型', '') as dealer_type, " +
        'count(*) as store_count ' +
        "FROM customer_profile WHERE region = '" + safeRegion + "' AND tier = '一阶' " +
        "GROUP BY sales_rep, dealer_type ORDER BY sales_rep";
      const personnelResult = await this.db.execute(sql.raw(personnelSql));

      const personnelMap = new Map<string, Map<string, number>>();
      const allFormatTypes = new Set<string>();
      for (const row of personnelResult as unknown as Array<{ sales_rep: string; dealer_type: string; store_count: string }>) {
        const simpleType = DEALER_TYPE_TO_FORMAT[row.dealer_type] ?? (row.dealer_type || '其他');
        allFormatTypes.add(simpleType);
        const pMap = personnelMap.get(row.sales_rep) ?? new Map<string, number>();
        pMap.set(simpleType, (pMap.get(simpleType) ?? 0) + parseInt(row.store_count, 10));
        personnelMap.set(row.sales_rep, pMap);
      }

      const formatTypes = Array.from(allFormatTypes).sort();
      const personnel: FormatDrilldownPersonnel[] = Array.from(personnelMap.entries())
        .map(([name, fmtMap]) => {
          const formats: Record<string, number> = {};
          let totalStores = 0;
          for (const ft of formatTypes) {
            const cnt = fmtMap.get(ft) ?? 0;
            formats[ft] = cnt;
            totalStores += cnt;
          }
          return { name, formats, totalStores };
        })
        .sort((a, b) => b.totalStores - a.totalStores);

      const totalByFormat = new Map<string, number>();
      for (const p of personnel) {
        for (const ft of formatTypes) {
          totalByFormat.set(ft, (totalByFormat.get(ft) ?? 0) + p.formats[ft]);
        }
      }

      // 计算近6个月各形态成交率（与成交分析模块保持一致的计算逻辑：动态字段查找 + content hash 去重）
      const monthlyRates: FormatDrilldownMonthlyRate[] =
        (await DatasetService._instance?.computeMonthlyFormatDealRates(
          region,
          formatTypes,
          totalByFormat,
          '一阶',
        )) ?? [];

      return { personnel, monthlyRates, formatTypes };
    } catch (err) {
      this.logger.warn(`getFormatDrilldown 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getFormatDrilldown(region);
    }
  }
}
