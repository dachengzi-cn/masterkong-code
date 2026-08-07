import { Injectable, Inject, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { createHash } from 'crypto';
import { dataset, dataRecord, customerProfile } from '@server/database/schema';
import { eq, desc, count, sql } from 'drizzle-orm';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { DEALER_TYPE_TO_FORMAT } from '../customer-profile/customer-profile.service';
import { RouteProfileService } from '../route-profile/route-profile.service';
import { ExpenseProfileService } from '../expense-profile/expense-profile.service';
import type {
  DatasetListItem,
  GetDatasetsResponse,
  CreateDatasetResponse,
  AppendRecordsResponse,
  DeleteDatasetResponse,
  DatasetDetail,
  FieldConfig,
  KpiData,
  TrendChartData,
  BarChartData,
  PieChartData,
  ChartFilterParams,
  HeatmapRow,
  HeatmapResponse,
  HeatmapDailyData,
  HeatmapColumnHeader,
  HeatmapFilterParams,
  TimeGranularity,
  UnconvertedStoreItem,
  GetUnconvertedStoresResponse,
  BrandSpecStatsResponse,
  BrandSpecStatsRow,
  BrandSpecMonthlyStatsResponse,
  BrandSpecMonthlyStat,
  BrandSpecDimensionMonthlyStat,
  SalesRepDrilldownResponse,
  SystemStatusResponse,
  CheckDuplicatesResponse,
  DatasetSpecOptions,
  SheetType,
  FormatDrilldownMonthlyRate,
  AtpPerformanceResponse,
  AtpPerformanceRow,
  AtpPerformanceStoreDetailResponse,
  AtpPerformanceStoreRow,
  AtpAvailableMonthsResponse,
  AtpThresholdParams,
} from '@shared/api.interface';

interface MemoryDataset {
  id: string;
  name: string;
  fields: FieldConfig[];
  records: Record<string, unknown>[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

@Injectable()
export class DatasetService implements OnModuleInit {
  private readonly logger = new Logger(DatasetService.name);
  private useMemoryStorage = true;
  private datasetStore = new Map<string, MemoryDataset>();
  // 静态实例引用：供其他模块在内存模式下访问数据集记录
  public static _instance: DatasetService | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly customerProfileService: CustomerProfileService,
    private readonly routeProfileService: RouteProfileService,
    private readonly expenseProfileService: ExpenseProfileService,
  ) {
    this.logger.log('DatasetService constructor called, db type: ' + typeof db);
    DatasetService._instance = this;
  }

  /** 获取最新的内存数据集（供其他模块在内存模式下使用） */
  static getLatestMemoryDataset(): MemoryDataset | null {
    if (!DatasetService._instance || DatasetService._instance.datasetStore.size === 0) return null;
    const allDatasets = Array.from(DatasetService._instance.datasetStore.values());
    // 返回最近创建的一个
    return allDatasets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  /** 检查是否运行在内存模式 */
  static isMemoryMode(): boolean {
    return DatasetService._instance?.useMemoryStorage ?? true;
  }

  /**
   * 获取最新数据集的进货记录，按 (customerCode, specification, purchaseMonth) 聚合。
   * 供其他模块（如差异门店分析）在内存/DB 模式下复用。
   *
   * 数据口径：生产力数据仅取「一阶回单」sheet 页的记录，进货金额来自「回单金额」字段、
   * 进货数量来自「订单数量-不含促销」字段（上传时由「回单数量-不含促销」列名归一化而来）；
   * 不使用其他 sheet 页（一阶订单/二阶订单/二阶回单）或「订单金额」等字段。
   * 当数据集中不存在「一阶回单」记录时，回退到字段名自动探测逻辑以兼容普通数据集。
   */
  static async getLatestDatasetPurchaseRecords(): Promise<
    Array<{
      customerCode: string;
      specification: string;
      purchaseMonth: string;
      purchaseAmount: number;
      purchaseQuantity: number;
      salesRep?: string;
      region?: string;
    }>
  > {
    const self = DatasetService._instance;
    if (!self) return [];

    const normalizeCode = (code: string): string => {
      const trimmed = String(code ?? '').trim();
      if (/^1201\//i.test(trimmed)) return trimmed;
      if (/^KH\d+/i.test(trimmed)) return trimmed;
      const m = trimmed.match(/^0+(\d+)$/);
      if (m) return `1201/${m[1]}`;
      return trimmed;
    };

    const parseAmount = (value: unknown): number => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const cleaned = String(value).replace(/,/g, '').trim();
      const num = parseFloat(cleaned);
      return Number.isNaN(num) || !Number.isFinite(num) ? 0 : num;
    };

    const parseMonth = (raw: unknown): string | null => {
      const s = String(raw ?? '').trim();
      if (!s) return null;
      const normalized = s.replace(/[./]/g, '-');
      const parts = normalized.split('-');
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!Number.isNaN(y) && !Number.isNaN(m) && y > 1900 && m >= 1 && m <= 12) {
          return `${y}-${String(m).padStart(2, '0')}`;
        }
      }
      const cnMatch = s.match(/(\d{4})年(\d{1,2})月/);
      if (cnMatch) {
        return `${cnMatch[1]}-${String(cnMatch[2]).padStart(2, '0')}`;
      }
      return null;
    };

    const aggregateRecords = (
      records: Iterable<{
        customerCode: string;
        specification: string;
        purchaseMonth: string;
        purchaseAmount: number;
        purchaseQuantity: number;
        salesRep?: string;
        region?: string;
      }>,
    ): Array<{
      customerCode: string;
      specification: string;
      purchaseMonth: string;
      purchaseAmount: number;
      purchaseQuantity: number;
      salesRep?: string;
      region?: string;
    }> => {
      const map = new Map<
        string,
        {
          customerCode: string;
          specification: string;
          purchaseMonth: string;
          purchaseAmount: number;
          purchaseQuantity: number;
          salesRep?: string;
          region?: string;
        }
      >();
      for (const r of records) {
        const key = `${r.customerCode}\t${r.specification}\t${r.purchaseMonth}`;
        const existing = map.get(key);
        if (existing) {
          existing.purchaseAmount += r.purchaseAmount;
          existing.purchaseQuantity += r.purchaseQuantity;
        } else {
          map.set(key, { ...r });
        }
      }
      return Array.from(map.values());
    };

    if (self.useMemoryStorage) {
      const allDatasets = DatasetService._instance
        ? Array.from(DatasetService._instance.datasetStore.values())
        : [];
      const sortedDatasets = allDatasets.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const memDataset = sortedDatasets.find((ds) => self.isPurchaseDataset(ds.fields));
      if (!memDataset || memDataset.records.length === 0) {
        self.logger.warn('内存模式下未找到包含客户编码/日期/规格/金额的进货数据集');
        return [];
      }
      const fields = memDataset.fields;
      let codeField = self.findCustomerCodeField(fields);
      let dateField = self.findDateField(fields);
      const specField = self.findSpecificationField(fields);
      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;

      // 优先采用「一阶回单」sheet 页数据（回单金额/订单数量-不含促销），否则回退到字段自动探测
      const tier1ReturnRecords = memDataset.records.filter(
        (r) => String(r['_sheetType'] ?? '') === '一阶回单',
      );
      const useTier1Return = tier1ReturnRecords.length > 0;
      const amountField = useTier1Return ? '回单金额' : self.findAmountField(fields);
      const quantityField = useTier1Return ? '订单数量-不含促销' : undefined;
      const recordsToProcess = useTier1Return ? tier1ReturnRecords : memDataset.records;

      if (recordsToProcess.length > 0) {
        const sampleKeys = Object.keys(recordsToProcess[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fallbackCode =
            sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase())) ??
            sampleKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
          if (fallbackCode) codeField = fallbackCode;
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fallbackDate =
            sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase())) ??
            sampleKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
          if (fallbackDate) dateField = fallbackDate;
        }
      }

      const seenHashes = new Set<string>();
      const parsed: Array<{
        customerCode: string;
        specification: string;
        purchaseMonth: string;
        purchaseAmount: number;
        purchaseQuantity: number;
        salesRep?: string;
        region?: string;
      }> = [];

      for (const record of recordsToProcess) {
        if (!record || typeof record !== 'object') continue;
        const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const rawCode = String(record[codeField ?? ''] ?? '').trim();
        const rawDate = String(record[dateField ?? ''] ?? '').trim();
        const rawSpec = String(record[specField ?? ''] ?? '').trim();
        if (!rawCode || !rawDate || !rawSpec) continue;

        const customerCode = normalizeCode(rawCode);
        const purchaseMonth = parseMonth(rawDate);
        if (!customerCode || !purchaseMonth) continue;

        parsed.push({
          customerCode,
          specification: rawSpec,
          purchaseMonth,
          purchaseAmount: parseAmount(record[amountField ?? ''] ?? 0),
          purchaseQuantity: parseAmount(record[quantityField ?? ''] ?? 0),
          salesRep: salesRepField ? String(record[salesRepField] ?? '').trim() || undefined : undefined,
          region: regionField ? String(record[regionField ?? ''] ?? '').trim() || undefined : undefined,
        });
      }

      return aggregateRecords(parsed);
    }

    try {
      const dsCandidates = await self.db
        .select({ id: dataset.id, fields: dataset.fields })
        .from(dataset)
        .orderBy(desc(dataset.createdAt));

      let dsId: string | undefined;
      for (const ds of dsCandidates) {
        const fields = (ds.fields ?? []) as FieldConfig[];
        if (self.isPurchaseDataset(fields)) {
          dsId = ds.id;
          break;
        }
      }

      if (!dsId) {
        self.logger.warn('数据库模式下未找到包含客户编码/日期/规格/金额的进货数据集');
        return [];
      }

      const fields = await self.getDatasetFields(dsId);
      let codeField = self.findCustomerCodeField(fields);
      let dateField = self.findDateField(fields);
      const specField = self.findSpecificationField(fields);
      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;

      // 优先采用「一阶回单」sheet 页数据（回单金额/订单数量-不含促销），否则回退到字段自动探测
      const tier1Check = await self.db.execute(
        sql.raw(
          "SELECT COUNT(*)::int AS cnt FROM data_record WHERE dataset_id = '" +
            String(dsId).replace(/'/g, "''") +
            "' AND content->>'_sheetType' = '一阶回单' AND content_hash IS NOT NULL",
        ),
      );
      const tier1Count = Number((tier1Check[0] as { cnt?: number | string })?.cnt ?? 0);
      const useTier1Return = tier1Count > 0;
      const amountField = useTier1Return ? '回单金额' : self.findAmountField(fields);
      const quantityField = useTier1Return ? '订单数量-不含促销' : undefined;

      const sampleResult = await self.db.execute(
        sql.raw(
          "SELECT content FROM data_record WHERE dataset_id = '" +
            String(dsId).replace(/'/g, "''") +
            "' AND content_hash IS NOT NULL LIMIT 1",
        ),
      );
      if (sampleResult.length > 0) {
        const sampleContent = (sampleResult[0] as { content: Record<string, unknown> }).content;
        if (sampleContent && typeof sampleContent === 'object') {
          const dataKeys = Object.keys(sampleContent);
          if (codeField && !dataKeys.includes(codeField)) {
            const fallbackCode =
              dataKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase())) ??
              dataKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
            if (fallbackCode) codeField = fallbackCode;
          }
          if (dateField && !dataKeys.includes(dateField)) {
            const fallbackDate =
              dataKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase())) ??
              dataKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
            if (fallbackDate) dateField = fallbackDate;
          }
        }
      }

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const safeSpecField = (specField ?? '产品-规格').replace(/'/g, "''");
      const safeAmountField = amountField ? amountField.replace(/'/g, "''") : null;
      const safeQuantityField = quantityField ? quantityField.replace(/'/g, "''") : null;
      const safeSalesRepField = salesRepField ? salesRepField.replace(/'/g, "''") : null;
      const safeRegionField = regionField ? regionField.replace(/'/g, "''") : null;

      const query =
        'WITH deduped AS (' +
        ' SELECT DISTINCT ON (content_hash)' +
        " content->>'" +
        safeCodeField +
        "' as customer_code," +
        " content->>'" +
        safeDateField +
        "' as trans_date," +
        " COALESCE(content->>'" +
        safeSpecField +
        "', '') as specification" +
        (safeAmountField ? ", NULLIF(content->>'" + safeAmountField + "', '')::numeric as amount" : '') +
        (safeQuantityField
          ? ", NULLIF(content->>'" + safeQuantityField + "', '')::numeric as quantity"
          : '') +
        (safeSalesRepField ? ", content->>'" + safeSalesRepField + "' as sales_rep" : '') +
        (safeRegionField ? ", content->>'" + safeRegionField + "' as region" : '') +
        ' FROM data_record WHERE dataset_id = \'' +
        String(dsId).replace(/'/g, "''") +
        '\' AND content_hash IS NOT NULL' +
        (useTier1Return ? " AND content->>'_sheetType' = '一阶回单'" : '') +
        ' ORDER BY content_hash, _created_at' +
        ') SELECT customer_code, trans_date, specification' +
        (safeAmountField ? ', amount' : '') +
        (safeQuantityField ? ', quantity' : '') +
        (safeSalesRepField ? ', sales_rep' : '') +
        (safeRegionField ? ', region' : '') +
        ' FROM deduped';

      const rows = (await self.db.execute(sql.raw(query))) as Array<{
        customer_code: string;
        trans_date: string;
        specification: string;
        amount?: string | number;
        quantity?: string | number;
        sales_rep?: string;
        region?: string;
      }>;

      const parsed: Array<{
        customerCode: string;
        specification: string;
        purchaseMonth: string;
        purchaseAmount: number;
        purchaseQuantity: number;
        salesRep?: string;
        region?: string;
      }> = [];

      for (const row of rows) {
        const customerCode = normalizeCode(String(row.customer_code ?? '').trim());
        const purchaseMonth = parseMonth(row.trans_date);
        const specification = String(row.specification ?? '').trim();
        if (!customerCode || !purchaseMonth || !specification) continue;
        parsed.push({
          customerCode,
          specification,
          purchaseMonth,
          purchaseAmount: parseAmount(row.amount ?? 0),
          purchaseQuantity: parseAmount(row.quantity ?? 0),
          salesRep: row.sales_rep ? String(row.sales_rep).trim() || undefined : undefined,
          region: row.region ? String(row.region).trim() || undefined : undefined,
        });
      }

      return aggregateRecords(parsed);
    } catch (err) {
      self.logger.warn(`getLatestDatasetPurchaseRecords 失败: ${(err as Error).message}`);
      self.logger.warn(`getLatestDatasetPurchaseRecords error stack: ${(err as Error).stack}`);
      return [];
    }
  }

  /** 获取 Postgres DB 实例（供其他模块使用） */
  getDb(): PostgresJsDatabase { return this.db; }

  async onModuleInit(): Promise<void> {
    this.logger.log('onModuleInit called, useMemoryStorage=' + this.useMemoryStorage);
    await this.verifyDatabase();
  }

  private async verifyDatabase(): Promise<void> {
    try {
      this.logger.log('开始验证数据库连接...');
      const [result] = await this.db
        .select({ total: count() })
        .from(dataset)
        .limit(1);
      this.useMemoryStorage = false;
      this.logger.log(`数据库正常 (${result?.total ?? 0} 条记录)，使用数据库存储`);
    } catch (err) {
      this.logger.warn(`数据库不可用 (${(err as Error).message})，切换到内存存储`);
      this.useMemoryStorage = true;
    }
  }

  async findAll(page: number = 1, pageSize: number = 20): Promise<GetDatasetsResponse> {
    if (this.useMemoryStorage) {
      const allItems = Array.from(this.datasetStore.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = allItems.length;
      const offset = (page - 1) * pageSize;
      const items: DatasetListItem[] = allItems.slice(offset, offset + pageSize).map((d) => ({
        id: d.id,
        name: d.name,
        rowCount: d.records.length,
        status: 'parsed',
        createdAt: d.createdAt.toISOString(),
      }));
      return { items, total };
    }
    try {
      const offset = (page - 1) * pageSize;
      const [items, totalResult] = await Promise.all([
        this.db
          .select({
            id: dataset.id,
            name: dataset.name,
            rowCount: dataset.rowCount,
            status: dataset.status,
            createdAt: dataset.createdAt,
          })
          .from(dataset)
          .orderBy(desc(dataset.createdAt))
          .limit(pageSize)
          .offset(offset),
        this.db.select({ total: count() }).from(dataset),
      ]);
      const totalRaw = String(totalResult[0]?.total ?? 0);
      const total = parseInt(totalRaw, 10);
      const mappedItems: DatasetListItem[] = items.map((item: typeof items[number]) => ({
        id: item.id,
        name: item.name,
        rowCount: item.rowCount,
        status: item.status as unknown as DatasetListItem['status'],
        createdAt: item.createdAt.toISOString(),
      }));
      return { items: mappedItems, total: isNaN(total) ? 0 : total };
    } catch (err) {
      this.logger.warn(`findAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.findAll(page, pageSize);
    }
  }

  private findSpecificationField(fields: FieldConfig[]): string | undefined {
    const candidates = [
      '产品-规格',
      '规格',
      'specification',
      '产品规格',
      '品项',
      '产品-品项',
      '品项规格',
      '产品品项',
      '产品-品牌规格',
    ];
    for (const cand of candidates) {
      const found = fields.find((f: FieldConfig) => f.name.trim() === cand);
      if (found) return found.name;
    }
    const fallback = fields.find((f: FieldConfig) =>
      /规格|specification|品项/i.test(f.name)
    );
    return fallback?.name;
  }

  private findBrandField(fields: FieldConfig[]): string | undefined {
    const candidates = ['品牌', '产品-品牌', 'brand'];
    for (const cand of candidates) {
      const found = fields.find((f: FieldConfig) => f.name.trim() === cand);
      if (found) return found.name;
    }
    const fallback = fields.find((f: FieldConfig) =>
      /品牌|brand/i.test(f.name)
    );
    return fallback?.name;
  }

  private findCustomerCodeField(fields: FieldConfig[]): string | undefined {
    const exactCandidates = [
      '客户编码', '客户代码', '客户编号', '客户-通路客户编码',
      '门店编码', '门店代码', '门店编号', '门店号',
      'customer_code', 'customerCode', 'customer_code_',
      'store_code', 'storeCode', 'outlet_code', 'outletCode',
    ];
    for (const cand of exactCandidates) {
      const found = fields.find((f: FieldConfig) => f.name.trim() === cand);
      if (found) return found.name;
    }
    const lowerMatch = fields.find((f: FieldConfig) => {
      const lower = f.name.toLowerCase();
      return lower.includes('customer') && lower.includes('code');
    });
    if (lowerMatch) return lowerMatch.name;
    const storeMatch = fields.find((f: FieldConfig) => {
      const lower = f.name.toLowerCase();
      return lower.includes('store') && lower.includes('code');
    });
    if (storeMatch) return storeMatch.name;
    const chineseMatch = fields.find(
      (f: FieldConfig) =>
        (f.name.includes('客户') && f.name.includes('编码')) ||
        (f.name.includes('门店') && f.name.includes('编码')),
    );
    if (chineseMatch) return chineseMatch.name;
    return undefined;
  }

  private findDateField(fields: FieldConfig[]): string | undefined {
    const dateField = fields.find((f: FieldConfig) => f.type === 'date');
    if (dateField) return dateField.name;
    const dateCandidates = [
      '订单-订单日期',
      '时间-日期',
      '订单日期',
      '日期',
      '交易日期',
      '月份',
      '月份别',
      '月',
      '期间',
      'period',
      '年月',
    ];
    for (const cand of dateCandidates) {
      const found = fields.find((f: FieldConfig) => f.name.trim() === cand);
      if (found) return found.name;
    }
    const fallback = fields.find((f: FieldConfig) =>
      /日期|date|时间|月份|年月|period|期间|^\d{4}年\d{1,2}月/i.test(f.name)
    );
    return fallback?.name;
  }

  private findBoxCountField(fields: FieldConfig[]): string | undefined {
    const candidates = ['箱数', '订单箱数', '数量', '订单数量', '件数'];
    for (const c of candidates) {
      const found = fields.find((f: FieldConfig) => f.name === c);
      if (found) return found.name;
    }
    return fields.find((f: FieldConfig) => f.type === 'number' && /箱|数量|件数|qty|box/i.test(f.name))?.name;
  }

  private findAmountField(fields: FieldConfig[]): string | undefined {
    const candidates = ['金额', '订单金额', '销售金额', '进货金额', '产品金额', '合计金额', '总额', '金额（元）'];
    for (const c of candidates) {
      const found = fields.find((f: FieldConfig) => f.name.trim() === c);
      if (found) return found.name;
    }
    return fields.find((f: FieldConfig) =>
      /金额|amount|销售额|销额|总价|total/i.test(f.name),
    )?.name;
  }

  private isPurchaseDataset(fields: FieldConfig[]): boolean {
    return !!(
      this.findCustomerCodeField(fields) &&
      this.findDateField(fields) &&
      this.findSpecificationField(fields) &&
      this.findAmountField(fields)
    );
  }

  private buildCustomerJoin(
    customerCodeField: string,
    customerDimension: string,
  ): { joinClause: string; dimExpr: string } {
    const safeCodeField = customerCodeField.replace(/'/g, "''");
    const safeDim = customerDimension.replace(/'/g, "''");
    const joinClause = ` LEFT JOIN customer_profile ON content->>'${safeCodeField}' = customer_profile.customer_code`;
    const dimExpr = `customer_profile.${safeDim}`;
    return { joinClause, dimExpr };
  }

  async create(
    name: string,
    fields: FieldConfig[],
    records: Record<string, unknown>[],
    userId: string,
    dedupMode?: 'overwrite' | 'new_only',
    existingDatasetId?: string,
  ): Promise<CreateDatasetResponse> {
    if (this.useMemoryStorage) {
      const now = new Date();
      if (dedupMode === 'overwrite' && existingDatasetId) {
        const existing = this.datasetStore.get(existingDatasetId);
        if (existing) {
          existing.name = name;
          existing.fields = fields;
          existing.records = records;
          existing.updatedAt = now;
          existing.updatedBy = userId;
        } else {
          this.datasetStore.set(existingDatasetId, {
            id: existingDatasetId, name, fields, records,
            createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId,
          });
        }
        this.logger.log(`内存存储: 覆盖数据集 ${existingDatasetId}`);
        return { id: existingDatasetId };
      }
      if (dedupMode === 'new_only' && existingDatasetId) {
        const codeField = this.findCustomerCodeField(fields);
        const dateField = this.findDateField(fields);
        const existing = this.datasetStore.get(existingDatasetId);
        if (existing && codeField && dateField) {
          const existingCombos = new Set<string>();
          for (const r of existing.records) {
            const code = String(r[codeField] ?? '');
            const date = String(r[dateField] ?? '');
            existingCombos.add(`${code}|||${date}`);
          }
          const newRecords = records.filter((r) => {
            const code = String(r[codeField] ?? '');
            const date = String(r[dateField] ?? '');
            return !existingCombos.has(`${code}|||${date}`);
          });
          existing.records.push(...newRecords);
          existing.updatedAt = now;
          existing.updatedBy = userId;
          this.logger.log(`内存存储: 追加 ${newRecords.length} 条到 ${existingDatasetId}`);
          return { id: existingDatasetId };
        }
      }
      const newId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.datasetStore.set(newId, {
        id: newId, name, fields, records,
        createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId,
      });
      this.logger.log(`内存存储: 创建数据集 ${newId}`);
      return { id: newId };
    }
    try {
      const codeField = this.findCustomerCodeField(fields);
      const dateField = this.findDateField(fields);
      if (dedupMode === 'overwrite' && existingDatasetId) {
        await this.db
          .delete(dataRecord)
          .where(eq(dataRecord.datasetId, existingDatasetId));
        await this.db
          .update(dataset)
          .set({ rowCount: 0, updatedAt: new Date(), updatedBy: userId })
          .where(eq(dataset.id, existingDatasetId));
        const BATCH_SIZE = 500;
        const recordValues = records.map((record: Record<string, unknown>) => ({
          datasetId: existingDatasetId, content: record,
          contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
          createdBy: userId, updatedBy: userId,
        }));
        for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
          const batch = recordValues.slice(i, i + BATCH_SIZE);
          await this.db.insert(dataRecord).values(batch);
        }
        await this.db
          .update(dataset)
          .set({ rowCount: records.length, name, fields, updatedAt: new Date(), updatedBy: userId })
          .where(eq(dataset.id, existingDatasetId));
        this.logger.log(`Dataset overwritten: ${existingDatasetId} with ${records.length} records`);
        return { id: existingDatasetId };
      }
      if (dedupMode === 'new_only' && existingDatasetId && codeField && dateField) {
        const safeCodeField = codeField.replace(/'/g, "''");
        const safeDateField = dateField.replace(/'/g, "''");
        const existingResult = await this.db.execute(sql.raw(
          `SELECT DISTINCT CONCAT(content->>'${safeCodeField}', '|||', content->>'${safeDateField}') as combo ` +
          `FROM data_record WHERE dataset_id = '${existingDatasetId.replace(/'/g, "''")}'`
        ));
        const existingCombos = new Set<string>();
        for (const row of existingResult as unknown as Array<{ combo: string }>) {
          if (row.combo) existingCombos.add(row.combo);
        }
        const filteredRecords = records.filter((record: Record<string, unknown>) => {
          const code = String(record[codeField] ?? '');
          const date = String(record[dateField] ?? '');
          return !existingCombos.has(`${code}|||${date}`);
        });
        if (filteredRecords.length > 0) {
          const BATCH_SIZE = 500;
          const recordValues = filteredRecords.map((record: Record<string, unknown>) => ({
            datasetId: existingDatasetId, content: record,
            contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
            createdBy: userId, updatedBy: userId,
          }));
          for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
            const batch = recordValues.slice(i, i + BATCH_SIZE);
            await this.db.insert(dataRecord).values(batch);
          }
          await this.db
            .update(dataset)
            .set({ rowCount: sql`row_count + ${filteredRecords.length}`, name, fields, updatedAt: new Date(), updatedBy: userId })
            .where(eq(dataset.id, existingDatasetId));
        }
        this.logger.log(`Dataset appended (new_only): ${existingDatasetId}`);
        return { id: existingDatasetId };
      }
      const [inserted] = await this.db
        .insert(dataset)
        .values({ name, fields, rowCount: records.length, status: 'parsed', createdBy: userId, updatedBy: userId })
        .returning({ id: dataset.id });
      if (records.length > 0) {
        const BATCH_SIZE = 500;
        const recordValues = records.map((record: Record<string, unknown>) => ({
          datasetId: inserted.id, content: record,
          contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
          createdBy: userId, updatedBy: userId,
        }));
        for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
          const batch = recordValues.slice(i, i + BATCH_SIZE);
          await this.db.insert(dataRecord).values(batch);
        }
      }
      this.logger.log(`Dataset created: ${inserted.id} with ${records.length} records`);
      return { id: inserted.id };
    } catch (err) {
      this.logger.warn(`create 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.create(name, fields, records, userId, dedupMode, existingDatasetId);
    }
  }

  async appendRecords(
    datasetId: string,
    records: Record<string, unknown>[],
    userId: string,
  ): Promise<AppendRecordsResponse> {
    if (this.useMemoryStorage) {
      const existing = this.datasetStore.get(datasetId);
      if (!existing) throw new NotFoundException(`Dataset ${datasetId} not found`);
      existing.records.push(...records);
      existing.updatedAt = new Date();
      existing.updatedBy = userId;
      this.logger.log(`内存存储: 追加 ${records.length} 条到 ${datasetId}`);
      return { appended: records.length };
    }
    try {
      const BATCH_SIZE = 500;
      const recordValues = records.map((record: Record<string, unknown>) => ({
        datasetId,
        content: record,
        contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
        createdBy: userId,
        updatedBy: userId,
      }));
      for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
        const batch = recordValues.slice(i, i + BATCH_SIZE);
        await this.db.insert(dataRecord).values(batch);
      }
      await this.db
        .update(dataset)
        .set({ rowCount: sql`row_count + ${records.length}`, updatedAt: new Date(), updatedBy: userId })
        .where(eq(dataset.id, datasetId));
      this.logger.log(`Appended ${records.length} records to dataset ${datasetId}`);
      return { appended: records.length };
    } catch (err) {
      this.logger.warn(`appendRecords 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.appendRecords(datasetId, records, userId);
    }
  }

  async remove(id: string): Promise<DeleteDatasetResponse> {
    if (this.useMemoryStorage) {
      if (!this.datasetStore.has(id)) throw new NotFoundException(`Dataset ${id} not found`);
      this.datasetStore.delete(id);
      this.logger.log(`内存存储: 删除数据集 ${id}`);
      return { success: true };
    }
    try {
      const [deleted] = await this.db
        .delete(dataset)
        .where(eq(dataset.id, id))
        .returning({ id: dataset.id });
      if (!deleted) throw new NotFoundException(`Dataset ${id} not found`);
      this.logger.log(`Dataset deleted: ${id}`);
      return { success: true };
    } catch (err) {
      this.logger.warn(`remove 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.remove(id);
    }
  }

  async findOne(id: string): Promise<DatasetDetail> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(id);
      if (!d) throw new NotFoundException(`Dataset ${id} not found`);
      const customerCodeField = this.findCustomerCodeField(d.fields);
      return {
        id: d.id, name: d.name, fields: d.fields,
        rowCount: d.records.length,
        createdAt: d.createdAt.toISOString(),
        customerCodeField,
      };
    }
    try {
      const [row] = await this.db
        .select({
          id: dataset.id, name: dataset.name, fields: dataset.fields,
          rowCount: dataset.rowCount, createdAt: dataset.createdAt,
        })
        .from(dataset)
        .where(eq(dataset.id, id));
      if (!row) throw new NotFoundException(`Dataset ${id} not found`);
      const fields = row.fields as FieldConfig[];
      const customerCodeField = this.findCustomerCodeField(fields);
      return {
        id: row.id, name: row.name, fields,
        rowCount: row.rowCount,
        createdAt: row.createdAt.toISOString(),
        customerCodeField,
      };
    } catch (err) {
      this.logger.warn(`findOne 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.findOne(id);
    }
  }

  private async getDatasetFields(datasetId: string): Promise<FieldConfig[]> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d) throw new NotFoundException(`Dataset ${datasetId} not found`);
      return d.fields;
    }
    const [row] = await this.db
      .select({ fields: dataset.fields })
      .from(dataset)
      .where(eq(dataset.id, datasetId));
    if (!row) throw new NotFoundException(`Dataset ${datasetId} not found`);
    return row.fields as FieldConfig[];
  }

  private resolveFields(
    fields: FieldConfig[],
    params: ChartFilterParams,
    dimensionType: 'date' | 'text',
  ): { dimension: string; metric: string; dimensionFieldType: string } {
    const dimension =
      params.dimension ??
      fields.find((f: FieldConfig) => f.type === dimensionType)?.name ??
      fields.find((f: FieldConfig) => f.type === 'text')?.name ??
      fields[0]?.name;
    const metric =
      params.metric ??
      fields.find((f: FieldConfig) => f.type === 'number')?.name ??
      fields[0]?.name;
    const dimField = fields.find((f: FieldConfig) => f.name === dimension);
    const dimensionFieldType = dimField?.type ?? 'text';
    return { dimension, metric, dimensionFieldType };
  }

  private buildDateCondition(
    dimension: string,
    dimensionFieldType: string,
    startDate?: string,
    endDate?: string,
  ): string {
    if (dimensionFieldType !== 'date' || (!startDate && !endDate)) {
      return '';
    }
    const conditions: string[] = [];
    if (startDate) {
      conditions.push(`(content->>'${dimension}') >= '${startDate}'`);
    }
    if (endDate) {
      conditions.push(`(content->>'${dimension}') <= '${endDate}'`);
    }
    return conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
  }

  private buildDedupedSubquery(datasetId: string, extraConditions: string = ''): string {
    return `(
      SELECT DISTINCT ON (content_hash) id, dataset_id, content, content_hash, _created_at, _updated_at, _created_by, _updated_by
      FROM data_record
      WHERE dataset_id = '${datasetId.replace(/'/g, "''")}' AND content_hash IS NOT NULL${extraConditions}
      ORDER BY content_hash, _created_at
    )`;
  }

  async checkDuplicates(
    fields: FieldConfig[],
    records: Record<string, unknown>[],
  ): Promise<CheckDuplicatesResponse> {
    if (this.useMemoryStorage) {
      return { duplicateCount: 0, totalCount: records.length, existingDatasetId: null, existingDatasetName: null };
    }
    try {
      const codeField = this.findCustomerCodeField(fields);
      const dateField = this.findDateField(fields);
      if (!codeField || !dateField || records.length === 0) {
        return { duplicateCount: 0, totalCount: records.length, existingDatasetId: null, existingDatasetName: null };
      }
      const existingDatasets = await this.db
        .select({ id: dataset.id, name: dataset.name })
        .from(dataset)
        .orderBy(desc(dataset.createdAt));
      if (existingDatasets.length === 0) {
        return { duplicateCount: 0, totalCount: records.length, existingDatasetId: null, existingDatasetName: null };
      }
      const latestDataset = existingDatasets[0];
      const safeCodeField = codeField.replace(/'/g, "''");
      const safeDateField = dateField.replace(/'/g, "''");
      const datasetId = latestDataset.id;
      const seen = new Set<string>();
      const uniqueCombos: Array<{ code: string; date: string }> = [];
      for (const record of records) {
        const code = String(record[codeField] ?? '');
        const date = String(record[dateField] ?? '');
        if (!code || !date) continue;
        const key = `${code}|||${date}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCombos.push({ code, date });
        }
      }
      if (uniqueCombos.length === 0) {
        return { duplicateCount: 0, totalCount: records.length, existingDatasetId: null, existingDatasetName: null };
      }
      const CHECK_BATCH = 200;
      let duplicateCount = 0;
      for (let i = 0; i < uniqueCombos.length; i += CHECK_BATCH) {
        const batch = uniqueCombos.slice(i, i + CHECK_BATCH);
        const valuesClause = batch.map((c) =>
          `('${c.code.replace(/'/g, "''")}','${c.date.replace(/'/g, "''")}')`
        ).join(',');
        const result = await this.db.execute(sql.raw(
          `SELECT COUNT(*) as dup_count FROM (VALUES ${valuesClause}) AS u(code, date) ` +
          `WHERE EXISTS (` +
            `SELECT 1 FROM data_record dr ` +
            `WHERE dr.dataset_id = '${datasetId.replace(/'/g, "''")}' ` +
            `AND dr.content->>'${safeCodeField}' = u.code ` +
            `AND dr.content->>'${safeDateField}' = u.date` +
          ')'
        ));
        const row = result[0] as Record<string, string>;
        duplicateCount += parseInt(row?.dup_count ?? '0', 10) || 0;
      }
      return {
        duplicateCount,
        totalCount: records.length,
        existingDatasetId: duplicateCount > 0 ? datasetId : null,
        existingDatasetName: duplicateCount > 0 ? latestDataset.name : null,
      };
    } catch (err) {
      this.logger.warn(`checkDuplicates 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { duplicateCount: 0, totalCount: records.length, existingDatasetId: null, existingDatasetName: null };
    }
  }

  async mergeByMonths(
    name: string,
    fields: FieldConfig[],
    records: Record<string, unknown>[],
    userId: string,
    uploadMonths?: string[],
  ): Promise<CreateDatasetResponse> {
    if (this.useMemoryStorage) {
      const now = new Date();
      const allItems = Array.from(this.datasetStore.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      if (allItems.length === 0) {
        const newId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.datasetStore.set(newId, {
          id: newId, name, fields, records,
          createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId,
        });
        return { id: newId };
      }
      const target = allItems[0];
      const dateField = this.findDateField(fields);
      let monthsToDelete = uploadMonths ?? [];
      if (monthsToDelete.length === 0 && dateField) {
        const monthSet = new Set<string>();
        for (const record of records) {
          const raw = String(record[dateField] ?? '');
          if (!raw) continue;
          const normalized = raw.replace(/[./]/g, '-');
          const parts = normalized.split('-');
          if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(y) && !isNaN(m)) {
              monthSet.add(`${y}-${String(m).padStart(2, '0')}`);
            }
          }
        }
        monthsToDelete = Array.from(monthSet);
      }
      if (dateField && monthsToDelete.length > 0) {
        target.records = target.records.filter((r) => {
          const raw = String(r[dateField] ?? '');
          if (!raw) return true;
          const normalized = raw.replace(/[./]/g, '-');
          const parts = normalized.split('-');
          if (parts.length < 2) return true;
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          if (isNaN(y) || isNaN(m)) return true;
          const ym = `${y}-${String(m).padStart(2, '0')}`;
          return !monthsToDelete.includes(ym);
        });
      } else if (!dateField) {
        target.records = [];
      }
      target.records.push(...records);
      target.name = name;
      target.fields = fields;
      target.updatedAt = now;
      target.updatedBy = userId;
      this.logger.log(`内存存储: 按月合并 ${target.id}`);
      return { id: target.id };
    }
    try {
      const dateField = this.findDateField(fields);
      const existingDatasets = await this.db
        .select({ id: dataset.id, name: dataset.name, fields: dataset.fields })
        .from(dataset)
        .orderBy(desc(dataset.createdAt));
      if (existingDatasets.length === 0) {
        const [inserted] = await this.db
          .insert(dataset)
          .values({ name, fields, rowCount: 0, status: 'parsed', createdBy: userId, updatedBy: userId })
          .returning({ id: dataset.id });
        if (records.length > 0) {
          const BATCH_SIZE = 500;
          const recordValues = records.map((record: Record<string, unknown>) => ({
            datasetId: inserted.id, content: record,
            contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
            createdBy: userId, updatedBy: userId,
          }));
          for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
            const batch = recordValues.slice(i, i + BATCH_SIZE);
            await this.db.insert(dataRecord).values(batch);
          }
          await this.db
            .update(dataset)
            .set({ rowCount: records.length, updatedAt: new Date(), updatedBy: userId })
            .where(eq(dataset.id, inserted.id));
        }
        this.logger.log(`Dataset created: ${inserted.id} with ${records.length} records`);
        return { id: inserted.id };
      }
      const targetDatasetId = existingDatasets[0].id;
      let monthsToDelete = uploadMonths ?? [];
      if (monthsToDelete.length === 0 && dateField) {
        const monthSet = new Set<string>();
        for (const record of records) {
          const raw = String(record[dateField] ?? '');
          if (!raw) continue;
          const normalized = raw.replace(/[./]/g, '-');
          const parts = normalized.split('-');
          if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(y) && !isNaN(m)) {
              monthSet.add(`${y}-${String(m).padStart(2, '0')}`);
            }
          }
        }
        monthsToDelete = Array.from(monthSet);
      }
      if (dateField && monthsToDelete.length > 0) {
        const safeDateField = dateField.replace(/'/g, "''");
        const normalizedDateExpr = `REPLACE(REPLACE(content->>'${safeDateField}', '.', '-'), '/', '-')`;
        const monthConditions = monthsToDelete.map((ym) => {
          const [y, m] = ym.split('-');
          const nextMonth = parseInt(m, 10) === 12 ? 1 : parseInt(m, 10) + 1;
          const nextYear = parseInt(m, 10) === 12 ? parseInt(y, 10) + 1 : parseInt(y, 10);
          const start = `${y}-${m}-01`;
          const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
          return `(${normalizedDateExpr} >= '${start}' AND ${normalizedDateExpr} < '${end}')`;
        });
        const whereClause = monthConditions.join(' OR ');
        await this.db.execute(sql.raw(
          `DELETE FROM data_record WHERE dataset_id = '${targetDatasetId.replace(/'/g, "''")}' AND (${whereClause})`
        ));
      } else if (!dateField) {
        await this.db.execute(sql.raw(
          `DELETE FROM data_record WHERE dataset_id = '${targetDatasetId.replace(/'/g, "''")}'`
        ));
      }
      const BATCH_SIZE = 500;
      const recordValues = records.map((record: Record<string, unknown>) => ({
        datasetId: targetDatasetId, content: record,
        contentHash: createHash('md5').update(JSON.stringify(record)).digest('hex'),
        createdBy: userId, updatedBy: userId,
      }));
      for (let i = 0; i < recordValues.length; i += BATCH_SIZE) {
        const batch = recordValues.slice(i, i + BATCH_SIZE);
        await this.db.insert(dataRecord).values(batch);
      }
      const countResult = await this.db
        .select({ total: count() })
        .from(dataRecord)
        .where(eq(dataRecord.datasetId, targetDatasetId));
      const newTotal = parseInt(String(countResult[0].total), 10);
      await this.db
        .update(dataset)
        .set({ name, fields, rowCount: newTotal, status: 'parsed', updatedAt: new Date(), updatedBy: userId })
        .where(eq(dataset.id, targetDatasetId));
      this.logger.log(`Dataset merged by months: ${targetDatasetId}`);
      return { id: targetDatasetId };
    } catch (err) {
      this.logger.warn(`mergeByMonths 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.mergeByMonths(name, fields, records, userId, uploadMonths);
    }
  }

  async getKpis(datasetId: string, params: ChartFilterParams): Promise<KpiData> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d) return { totalRecords: 0, totalAmount: 0, avgValue: 0, maxValue: 0, minValue: 0, yearOnYearChange: 0 };
      const metricField = params.metric ?? d.fields.find((f: FieldConfig) => f.type === 'number')?.name;
      let totalRecords = 0;
      let totalAmount = 0;
      let maxValue = 0;
      let minValue = 0;
      for (const r of d.records) {
        totalRecords++;
        const val = metricField ? (parseFloat(String(r[metricField] ?? '')) || 0) : 0;
        totalAmount += val;
        if (val > maxValue) maxValue = val;
        if (val < minValue || minValue === 0) minValue = val;
      }
      return {
        totalRecords, totalAmount,
        avgValue: totalRecords > 0 ? totalAmount / totalRecords : 0,
        maxValue, minValue, yearOnYearChange: 0,
      };
    }
    try {
      const fields = await this.getDatasetFields(datasetId);
      const { metric } = this.resolveFields(fields, params, 'date');
      const dateCond = this.buildDateCondition(
        params.dimension ?? this.findDateField(fields) ?? '',
        'date', params.startDate, params.endDate,
      );
      const dedupedFrom = this.buildDedupedSubquery(datasetId, dateCond.replace(/^ AND /, ''));
      const result = await this.db.execute(sql`
        SELECT
          COUNT(*) as total_records,
          COALESCE(SUM((content->>${sql.raw(`'${metric}'`)})::numeric), 0) as total_amount,
          COALESCE(AVG((content->>${sql.raw(`'${metric}'`)})::numeric), 0) as avg_value,
          COALESCE(MAX((content->>${sql.raw(`'${metric}'`)})::numeric), 0) as max_value,
          COALESCE(MIN((content->>${sql.raw(`'${metric}'`)})::numeric), 0) as min_value
        FROM ${sql.raw(dedupedFrom)} deduped
      `);
      const row = result[0] as Record<string, string>;
      this.logger.log(`KPI query for dataset ${datasetId}, metric: ${metric}`);
      return {
        totalRecords: parseInt(row.total_records, 10) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        avgValue: parseFloat(row.avg_value) || 0,
        maxValue: parseFloat(row.max_value) || 0,
        minValue: parseFloat(row.min_value) || 0,
        yearOnYearChange: 0,
      };
    } catch (err) {
      this.logger.warn(`getKpis 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getKpis(datasetId, params);
    }
  }

  async getTrendChart(
    datasetId: string,
    params: ChartFilterParams,
  ): Promise<TrendChartData> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d) return { xAxis: [], series: [{ name: '', data: [] }] };
      const dimension = params.dimension ?? this.findDateField(d.fields) ?? d.fields[0]?.name ?? '';
      const metric = params.metric ?? d.fields.find((f: FieldConfig) => f.type === 'number')?.name ?? d.fields[0]?.name ?? '';
      const groupMap = new Map<string, number>();
      for (const r of d.records) {
        const key = String(r[dimension] ?? '');
        const val = parseFloat(String(r[metric] ?? '')) || 0;
        groupMap.set(key, (groupMap.get(key) ?? 0) + val);
      }
      const sortedKeys = Array.from(groupMap.keys()).sort();
      return {
        xAxis: sortedKeys,
        series: [{ name: metric, data: sortedKeys.map((k) => groupMap.get(k) ?? 0) }],
      };
    }
    try {
      const fields = await this.getDatasetFields(datasetId);
      const { dimension, metric, dimensionFieldType } = this.resolveFields(fields, params, 'date');
      const dateCond = this.buildDateCondition(dimension, dimensionFieldType, params.startDate, params.endDate);
      const customerCodeField = this.findCustomerCodeField(fields);
      let joinClause = '';
      let dimSelectExpr = `content->>'${dimension}'`;
      let groupByExpr = `content->>'${dimension}'`;
      let orderByExpr = `content->>'${dimension}'`;
      if (params.customerDimension && customerCodeField) {
        const join = this.buildCustomerJoin(customerCodeField, params.customerDimension);
        joinClause = join.joinClause;
        dimSelectExpr = join.dimExpr;
        groupByExpr = join.dimExpr;
        orderByExpr = join.dimExpr;
      }
      const dedupedFrom = this.buildDedupedSubquery(datasetId, dateCond.replace(/^ AND /, ''));
      const result = await this.db.execute(sql`
        SELECT
          ${sql.raw(dimSelectExpr)} as x_value,
          SUM((content->>${sql.raw(`'${metric}'`)})::numeric) as y_value
        FROM ${sql.raw(dedupedFrom)} deduped${sql.raw(joinClause)}
        GROUP BY ${sql.raw(groupByExpr)}
        ORDER BY ${sql.raw(orderByExpr)}
      `);
      const rows = result as unknown as Array<Record<string, string>>;
      const xAxis: string[] = [];
      const data: number[] = [];
      for (const row of rows) {
        xAxis.push(row.x_value ?? '');
        data.push(parseFloat(row.y_value) || 0);
      }
      this.logger.log(`Trend chart for dataset ${datasetId}`);
      return { xAxis, series: [{ name: metric, data }] };
    } catch (err) {
      this.logger.warn(`getTrendChart 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getTrendChart(datasetId, params);
    }
  }

  async getBarChart(
    datasetId: string,
    params: ChartFilterParams,
  ): Promise<BarChartData> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d) return { categories: [], data: [] };
      const dimension = params.dimension ?? d.fields.find((f: FieldConfig) => f.type === 'text')?.name ?? d.fields[0]?.name ?? '';
      const metric = params.metric ?? d.fields.find((f: FieldConfig) => f.type === 'number')?.name ?? d.fields[0]?.name ?? '';
      const groupMap = new Map<string, number>();
      for (const r of d.records) {
        const key = String(r[dimension] ?? '');
        const val = parseFloat(String(r[metric] ?? '')) || 0;
        groupMap.set(key, (groupMap.get(key) ?? 0) + val);
      }
      const sorted = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
      return { categories: sorted.map((e) => e[0]), data: sorted.map((e) => e[1]) };
    }
    try {
      const fields = await this.getDatasetFields(datasetId);
      const { dimension, metric, dimensionFieldType } = this.resolveFields(fields, params, 'text');
      const dateCond = this.buildDateCondition(dimension, dimensionFieldType, params.startDate, params.endDate);
      const customerCodeField = this.findCustomerCodeField(fields);
      let joinClause = '';
      let dimSelectExpr = `content->>'${dimension}'`;
      let groupByExpr = `content->>'${dimension}'`;
      if (params.customerDimension && customerCodeField) {
        const join = this.buildCustomerJoin(customerCodeField, params.customerDimension);
        joinClause = join.joinClause;
        dimSelectExpr = join.dimExpr;
        groupByExpr = join.dimExpr;
      }
      const dedupedFrom = this.buildDedupedSubquery(datasetId, dateCond.replace(/^ AND /, ''));
      const result = await this.db.execute(sql`
        SELECT
          ${sql.raw(dimSelectExpr)} as category,
          SUM((content->>${sql.raw(`'${metric}'`)})::numeric) as value
        FROM ${sql.raw(dedupedFrom)} deduped${sql.raw(joinClause)}
        GROUP BY ${sql.raw(groupByExpr)}
        ORDER BY SUM((content->>${sql.raw(`'${metric}'`)})::numeric) DESC
      `);
      const rows = result as unknown as Array<Record<string, string>>;
      const categories: string[] = [];
      const data: number[] = [];
      for (const row of rows) {
        categories.push(row.category ?? '');
        data.push(parseFloat(row.value) || 0);
      }
      this.logger.log(`Bar chart for dataset ${datasetId}`);
      return { categories, data };
    } catch (err) {
      this.logger.warn(`getBarChart 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getBarChart(datasetId, params);
    }
  }

  async getPieChart(
    datasetId: string,
    params: ChartFilterParams,
  ): Promise<PieChartData> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d) return { items: [] };
      const dimension = params.dimension ?? d.fields.find((f: FieldConfig) => f.type === 'text')?.name ?? d.fields[0]?.name ?? '';
      const metric = params.metric ?? d.fields.find((f: FieldConfig) => f.type === 'number')?.name ?? d.fields[0]?.name ?? '';
      const groupMap = new Map<string, number>();
      for (const r of d.records) {
        const key = String(r[dimension] ?? '');
        const val = parseFloat(String(r[metric] ?? '')) || 0;
        groupMap.set(key, (groupMap.get(key) ?? 0) + val);
      }
      const items = Array.from(groupMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));
      return { items };
    }
    try {
      const fields = await this.getDatasetFields(datasetId);
      const { dimension, metric, dimensionFieldType } = this.resolveFields(fields, params, 'text');
      const dateCond = this.buildDateCondition(dimension, dimensionFieldType, params.startDate, params.endDate);
      const customerCodeField = this.findCustomerCodeField(fields);
      let joinClause = '';
      let dimSelectExpr = `content->>'${dimension}'`;
      let groupByExpr = `content->>'${dimension}'`;
      if (params.customerDimension && customerCodeField) {
        const join = this.buildCustomerJoin(customerCodeField, params.customerDimension);
        joinClause = join.joinClause;
        dimSelectExpr = join.dimExpr;
        groupByExpr = join.dimExpr;
      }
      const dedupedFrom = this.buildDedupedSubquery(datasetId, dateCond.replace(/^ AND /, ''));
      const result = await this.db.execute(sql`
        SELECT
          ${sql.raw(dimSelectExpr)} as name,
          SUM((content->>${sql.raw(`'${metric}'`)})::numeric) as value
        FROM ${sql.raw(dedupedFrom)} deduped${sql.raw(joinClause)}
        GROUP BY ${sql.raw(groupByExpr)}
        ORDER BY SUM((content->>${sql.raw(`'${metric}'`)})::numeric) DESC
      `);
      const rows = result as unknown as Array<Record<string, string>>;
      const items = rows.map((row: Record<string, string>) => ({
        name: row.name ?? '',
        value: parseFloat(row.value) || 0,
      }));
      this.logger.log(`Pie chart for dataset ${datasetId}`);
      return { items };
    } catch (err) {
      this.logger.warn(`getPieChart 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getPieChart(datasetId, params);
    }
  }

  /** 内存存储模式下的成交分析热力图计算 */
  private async getHeatmapDataMemory(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    granularity: TimeGranularity,
    filters?: HeatmapFilterParams,
  ): Promise<HeatmapResponse> {
    try {
      const from = new Date(dateFrom + 'T00:00:00');
      const to = new Date(dateTo + 'T00:00:00');
      const year = from.getFullYear();
      const month = from.getMonth() + 1;

      // 获取线路资料，构建门店编码到线路名称的映射
      const routeData = await this.routeProfileService.findAll(1, 10000);
      const codeToRouteMap = new Map<string, string>();
      for (const route of routeData.items) {
        codeToRouteMap.set(route.customerCode, route.routeName);
      }

      // 1) 从内存客户资料构建业代分组
      const allProfiles = this.customerProfileService.getAllProfiles();

      // 根据 sheetType 推断 tier：一阶订单/一阶回单 → 一阶，二阶订单/二阶回单 → 二阶
      let inferredTier: string | undefined;
      if (!filters?.tier || filters.tier.length === 0) {
        const sheetTypes = filters?.sheetType ?? [];
        const hasFirst = sheetTypes.some((s) => s.includes('一阶'));
        const hasSecond = sheetTypes.some((s) => s.includes('二阶'));
        if (hasFirst && !hasSecond) inferredTier = '一阶';
        else if (hasSecond && !hasFirst) inferredTier = '二阶';
      }

      const filteredProfiles = allProfiles.filter((p) => {
        if (filters?.region && filters.region.length > 0 && !filters.region.includes(p.region)) return false;
        if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(p.tier)) return false;
        if (inferredTier && p.tier !== inferredTier) return false;
        if (filters?.dealerType && filters.dealerType.length > 0) {
          const dealerType = String(p.extras?.['经销商类型'] ?? '');
          const allFullNames: string[] = [];
          for (const dt of filters.dealerType) {
            for (const [full, simplified] of Object.entries(DEALER_TYPE_TO_FORMAT)) {
              if (simplified === dt) allFullNames.push(full);
            }
          }
          if (allFullNames.length > 0 && !allFullNames.includes(dealerType) && !filters.dealerType.includes(dealerType)) return false;
        }
        // 当日模式：排除自售、特约士多批、特约特通批形态
        if (filters?.mode === 'daily') {
          const dt = String(p.extras?.['经销商类型'] ?? '');
          if (dt === '自售' || dt === '特约士多批' || dt === '特约特通批') return false;
        }
        if (filters?.isPaid && filters.isPaid.length > 0) {
          const paid = p.extras?.['付费金额'];
          const hasPaid = filters.isPaid.includes('true');
          const hasUnpaid = filters.isPaid.includes('false');
          if (hasPaid && !hasUnpaid && (!paid || paid === '')) return false;
          if (!hasPaid && hasUnpaid && (paid && paid !== '')) return false;
        }
        if (filters?.customerKeyword) {
          const kw = filters.customerKeyword.toLowerCase();
          if (!p.customerCode.toLowerCase().includes(kw) && !p.customerName.toLowerCase().includes(kw)) return false;
        }
        if (filters?.salesRep && filters.salesRep.length > 0) {
          const sr = String(p.extras?.['客户经理'] ?? '');
          if (!filters.salesRep.includes(sr)) return false;
        }
        // 线路筛选：支持复合线路递归匹配
        // 选中"周二"时，"周二,周六"等复合线路也会被匹配
        if (filters?.route && filters.route.length > 0) {
          const customerRoute = codeToRouteMap.get(p.customerCode);
          if (!customerRoute) return false;
          const customerRouteDays = customerRoute.split(',').map((d: string) => d.trim());
          const hasMatch = customerRouteDays.some((day: string) => filters.route!.includes(day));
          if (!hasMatch) return false;
        }
        return true;
      });

      const compositeKey = (salesRep: string, region: string, tier: string) =>
        salesRep + '|||' + region + '|||' + tier;

      // 构建客户编码 → 业代组 的映射
      const codeToGroup = new Map<string, string>();
      const repGroupMap = new Map<string, { sales_rep: string; region: string; tier: string; service_points: number }>();
      for (const p of filteredProfiles) {
        const sr = String(p.extras?.['客户经理'] ?? '');
        const key = compositeKey(sr, p.region, p.tier);
        codeToGroup.set(p.customerCode, key);
        const existing = repGroupMap.get(key);
        if (existing) {
          existing.service_points++;
        } else {
          repGroupMap.set(key, { sales_rep: sr, region: p.region, tier: p.tier, service_points: 1 });
        }
      }
      const repResult = Array.from(repGroupMap.values());
      this.logger.log(`[Memory] Heatmap 客户资料: 匹配客户数=${codeToGroup.size}, 业代组数=${repResult.length}`);

      // 构建业代组 → 星期 → 客户编码集合 的映射（用于当日成交率计算）
      const groupToDayRouteStores: Record<string, Record<string, Set<string>>> = {};
      for (const [code, groupKey] of codeToGroup) {
        const routeName = codeToRouteMap.get(code);
        if (!routeName) continue;
        const days = routeName.split(',').map((d: string) => d.trim());
        for (const day of days) {
          if (!groupToDayRouteStores[groupKey]) groupToDayRouteStores[groupKey] = {};
          if (!groupToDayRouteStores[groupKey][day]) groupToDayRouteStores[groupKey][day] = new Set();
          groupToDayRouteStores[groupKey][day].add(code);
        }
      }

      // 2) 获取数据集字段和记录
      const memDataset = this.datasetStore.get(datasetId);
      if (!memDataset || memDataset.records.length === 0) {
        this.logger.warn(`[Memory] 数据集 ${datasetId} 不存在或无记录`);
        return { rows: [], columns: [], granularity, year, month, daysInMonth: 0, dateFrom, dateTo };
      }

      const fields = memDataset.fields;
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);

      // 采样验证字段名
      if (memDataset.records.length > 0) {
        const sampleKeys = Object.keys(memDataset.records[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fallbackCode = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /编码|code/i.test(k));
          if (fallbackCode) { codeField = fallbackCode; }
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fallbackDate = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /date|日期/i.test(k));
          if (fallbackDate) { dateField = fallbackDate; }
        }
      }

      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;
      this.logger.log(`[Memory] Heatmap 字段解析: codeField=${codeField}, dateField=${dateField}, boxCount=${boxCountField}`);

      // 3) 解析并过滤交易记录（去重）
      const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
      const parseDate = (dateStr: string): { y: number; m: number; d: number } | null => {
        const normalized = String(dateStr ?? '').replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10); const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return { y, m, d };
      };

      const seenHashes = new Set<string>();
      const dedupedTrans: Array<{
        customer_code: string; trans_date: string;
        box_count?: number; trans_sales_rep?: string; trans_region?: string;
      }> = [];

      for (const record of memDataset.records) {
        if (!record || typeof record !== 'object') continue;
        const cd = String(record[codeField ?? ''] ?? '').trim();
        const dd = String(record[dateField ?? ''] ?? '').trim();
        if (!cd || !dd) continue;
        // contentHash 去重模拟
        const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        // 日期范围过滤
        const parsed = parseDate(dd);
        if (!parsed) continue;
        const normalizedDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        if (granularity === 'day' || granularity === 'week') {
          if (normalizedDate < dateFrom || normalizedDate > dateTo) continue;
        } else if (granularity === 'month') {
          if (parsed.y !== year) continue;
        }

        // 品牌筛选
        if (filters?.brand && filters.brand.length > 0) {
          const brand = String(record['品牌'] ?? '');
          if (!filters.brand.includes(brand)) continue;
        }
        // sheetType 筛选
        if (filters?.sheetType && filters.sheetType.length > 0) {
          const st = String(record['_sheetType'] ?? '') as SheetType;
          if (!filters.sheetType.includes(st)) continue;
        }
        // specification 筛选
        if (filters?.specification && filters.specification.length > 0) {
          const spec = String(record['产品-规格'] ?? '');
          if (!filters.specification.includes(spec)) continue;
        }

        const boxVal = boxCountField ? (parseFloat(String(record[boxCountField] ?? '')) || 0) : undefined;
        dedupedTrans.push({
          customer_code: cd,
          trans_date: dd,
          box_count: boxVal,
          trans_sales_rep: salesRepField ? String(record[salesRepField] ?? '') : undefined,
          trans_region: regionField ? String(record[regionField] ?? '') : undefined,
        });
      }
      this.logger.log(`[Memory] Heatmap 交易数据: ${dedupedTrans.length} 条去重记录`);

      // 4) 构建时间列
      const totalDaysInRange = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const parseToPeriod = (dateStr: string): number | null => {
        const parsed = parseDate(dateStr);
        if (!parsed) return null;
        const parsedDate = new Date(parsed.y, parsed.m - 1, parsed.d);
        switch (granularity) {
          case 'day': {
            if (parsedDate < from || parsedDate > to) return null;
            return Math.round((parsedDate.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
          }
          case 'week': {
            if (parsed.y !== year || parsed.m !== month) return null;
            const daysInMonth = new Date(year, month, 0).getDate();
            if (parsed.d < 1 || parsed.d > daysInMonth) return null;
            return Math.ceil(parsed.d / 7);
          }
          case 'month':
            if (parsed.y !== year) return null;
            if (parsed.m < 1 || parsed.m > 12) return null;
            return parsed.m;
          case 'year':
            return parsed.y;
        }
      };

      let periods: number[];
      let columns: HeatmapColumnHeader[];
      switch (granularity) {
        case 'day': {
          periods = Array.from({ length: totalDaysInRange }, (_, i: number) => i);
          columns = periods.map((idx: number) => {
            const d = new Date(from);
            d.setDate(d.getDate() + idx);
            const weekday = WEEKDAYS[d.getDay()];
            const monthDay = d.getDate();
            const monthNum = d.getMonth() + 1;
            const label = idx === 0 || monthDay === 1 ? monthNum + '/' + monthDay : String(monthDay);
            return { index: idx, label, subLabel: weekday, isHoliday: d.getDay() === 0 };
          });
          break;
        }
        case 'week': {
          const daysInMonth = new Date(year, month, 0).getDate();
          const weekCount = Math.ceil(daysInMonth / 7);
          periods = Array.from({ length: weekCount }, (_, i: number) => i + 1);
          columns = periods.map((w: number) => ({ index: w - 1, label: 'W' + w }));
          break;
        }
        case 'month': {
          periods = Array.from({ length: 12 }, (_, i: number) => i + 1);
          columns = periods.map((m: number) => ({ index: m - 1, label: m + '月' }));
          break;
        }
        case 'year': {
          const yearsSet = new Set<number>();
          for (const trans of dedupedTrans) {
            const parsed = parseDate(trans.trans_date);
            if (parsed) yearsSet.add(parsed.y);
          }
          periods = Array.from(yearsSet).sort((a: number, b: number) => a - b);
          columns = periods.map((y: number, idx: number) => ({ index: idx, label: String(y) }));
          break;
        }
        default:
          periods = [];
          columns = [];
      }

      // 5) 虚拟服务点：交易数据中有业代/营业所但客户资料中没有的客户
      // 虚拟服务点同样需要应用区域/阶层筛选
      const virtualServicePoints: Record<string, Set<string>> = {};
      for (const trans of dedupedTrans) {
        if (codeToGroup.has(trans.customer_code)) continue;
        const sr = trans.trans_sales_rep ?? '';
        const rg = trans.trans_region ?? '';
        if (!sr && !rg) continue;
        // 虚拟服务点也需要区域筛选
        if (filters?.region && filters.region.length > 0 && !filters.region.includes(rg)) continue;
        // 虚拟服务点也需要阶层筛选
        const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
        if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(tier)) continue;
        const key = compositeKey(sr, rg, tier);
        if (!virtualServicePoints[key]) virtualServicePoints[key] = new Set();
        virtualServicePoints[key].add(trans.customer_code);
      }

      // 6) 初始化业代周期数据
      const repPeriodStores: Record<string, Record<number, Set<string>>> = {};
      const repOrderCounts: Record<string, number> = {};
      const repPeriodOrders: Record<string, Record<number, number>> = {};
      const repServicePointsMap: Record<string, number> = {};
      for (const row of repResult) {
        const key = compositeKey(row.sales_rep, row.region, row.tier);
        repPeriodStores[key] = {};
        repOrderCounts[key] = 0;
        repPeriodOrders[key] = {};
        repServicePointsMap[key] = row.service_points;
      }
      for (const [key, codes] of Object.entries(virtualServicePoints)) {
        if (!repPeriodStores[key]) {
          repPeriodStores[key] = {};
          repOrderCounts[key] = 0;
          repPeriodOrders[key] = {};
          repServicePointsMap[key] = codes.size;
        }
      }

      // 7) 遍历交易数据，累计每个业代在每个时间粒度的成交门店
      const hasBoxField = !!boxCountField;
      let lastTransPeriodIdx = -1;
      for (const trans of dedupedTrans) {
        const period = parseToPeriod(trans.trans_date);
        if (period === null) continue;
        const periodIdx = periods.indexOf(period);
        if (periodIdx === -1) continue;
        if (periodIdx > lastTransPeriodIdx) lastTransPeriodIdx = periodIdx;

        let groupKey = codeToGroup.get(trans.customer_code);
        if (!groupKey) {
          const sr = trans.trans_sales_rep ?? '';
          const rg = trans.trans_region ?? '';
          if (!sr && !rg) continue;
          const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
          groupKey = compositeKey(sr, rg, tier);
        }
        if (!repPeriodStores[groupKey]) continue;
        if (!repPeriodStores[groupKey][period]) {
          repPeriodStores[groupKey][period] = new Set();
        }
        repPeriodStores[groupKey][period].add(trans.customer_code);
        const boxValue = hasBoxField ? (trans.box_count ?? 0) : 1;
        repOrderCounts[groupKey] = (repOrderCounts[groupKey] ?? 0) + boxValue;
        if (!repPeriodOrders[groupKey]) repPeriodOrders[groupKey] = {};
        repPeriodOrders[groupKey][period] = (repPeriodOrders[groupKey][period] ?? 0) + boxValue;
      }

      // 8) 收集活跃的业代组并生成行数据
      const activeGroups = new Set<string>();
      for (const trans of dedupedTrans) {
        let gk = codeToGroup.get(trans.customer_code);
        if (!gk) {
          const sr = trans.trans_sales_rep ?? '';
          const rg = trans.trans_region ?? '';
          if (!sr && !rg) continue;
          const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
          gk = compositeKey(sr, rg, tier);
        }
        activeGroups.add(gk);
      }

      type GroupInfo = { sales_rep: string; region: string; tier: string; service_points: number };
      // 包含所有客户资料中的业代组（即使无成交也要显示）
      const allGroups: GroupInfo[] = [...repResult];
      const profileKeys = new Set(allGroups.map((g: GroupInfo) => compositeKey(g.sales_rep, g.region, g.tier)));
      for (const [key, codes] of Object.entries(virtualServicePoints)) {
        if (!profileKeys.has(key) && codes.size > 0) {
          const [sr, rg, ti] = key.split('|||');
          // 过滤掉业代为空的虚拟服务点
          if (!sr) continue;
          allGroups.push({ sales_rep: sr, region: rg, tier: ti, service_points: codes.size });
        }
      }

      const rows: HeatmapRow[] = allGroups.map((repInfo: GroupInfo) => {
        const groupKey = compositeKey(repInfo.sales_rep, repInfo.region, repInfo.tier);
        const dailyData: HeatmapDailyData[] = [];
        const cumulativeStores = new Set<string>();
        const servicePoints = repServicePointsMap[groupKey] ?? parseInt(String(repInfo.service_points), 10);
        const isDailyMode = filters?.mode === 'daily';
        for (let pi = 0; pi < periods.length; pi++) {
          const period = periods[pi];
          const colLabel = columns[pi].label;
          if (pi > lastTransPeriodIdx && !isDailyMode) {
            dailyData.push({ day: period, label: colLabel, rate: null, stores: null });
            continue;
          }
          const periodStores = repPeriodStores[groupKey]?.[period];
          if (!isDailyMode) {
            if (periodStores) {
              for (const code of periodStores) cumulativeStores.add(code);
            }
            const rate = servicePoints > 0 ? cumulativeStores.size / servicePoints : 0;
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: cumulativeStores.size,
            });
          } else if (granularity === 'day') {
            // 当日成交率：当日线路成交门店数 / 当日线路门店总点数
            const periodDate = new Date(from);
            periodDate.setDate(periodDate.getDate() + pi);
            const weekdayChar = WEEKDAYS[periodDate.getDay()];
            const routeDay = '周' + weekdayChar;
            const routeStores = groupToDayRouteStores[groupKey]?.[routeDay];
            const routeStoreCount = routeStores?.size ?? 0;
            if (routeStoreCount === 0) {
              dailyData.push({ day: period, label: colLabel, rate: null, stores: null, routeStores: null, orders: null });
              continue;
            }
            let dealCount = 0;
            if (periodStores) {
              for (const code of periodStores) {
                if (routeStores!.has(code)) dealCount++;
              }
            }
            const rate = dealCount / routeStoreCount;
            const periodOrders = Math.round(repPeriodOrders[groupKey]?.[period] ?? 0);
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: dealCount,
              routeStores: routeStoreCount, orders: periodOrders,
            });
          } else {
            // 当日模式但非日粒度：当期成交门店数 / 总服务点数
            const storeCount = periodStores?.size ?? 0;
            const rate = servicePoints > 0 ? storeCount / servicePoints : 0;
            const periodOrders = Math.round(repPeriodOrders[groupKey]?.[period] ?? 0);
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: storeCount,
              routeStores: servicePoints, orders: periodOrders,
            });
          }
        }
        return {
          salesRep: repInfo.sales_rep, region: repInfo.region, tier: repInfo.tier, servicePoints,
          totalOrders: Math.round(repOrderCounts[groupKey] ?? 0), dailyData,
        };
      });

      this.logger.log(`[Memory] Heatmap 完成: dataset=${datasetId}, 生成 ${rows.length} 行业代数据, ${columns.length} 个时间列`);
      return { rows, columns, granularity, year, month, daysInMonth: totalDaysInRange, dateFrom, dateTo };
    } catch (err) {
      this.logger.warn('[Memory] getHeatmapDataMemory 失败: ' + (err as Error).message);
      return { rows: [], columns: [], granularity, year: new Date(dateFrom).getFullYear(), month: new Date(dateFrom).getMonth() + 1, daysInMonth: 0, dateFrom, dateTo };
    }
  }

  async getHeatmapData(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    granularity: TimeGranularity,
    filters?: HeatmapFilterParams,
  ): Promise<HeatmapResponse> {
    if (this.useMemoryStorage) {
      return this.getHeatmapDataMemory(datasetId, dateFrom, dateTo, granularity, filters);
    }
    try {
      const from = new Date(dateFrom + 'T00:00:00');
      const to = new Date(dateTo + 'T00:00:00');
      const year = from.getFullYear();
      const month = from.getMonth() + 1;
      // 基础条件：不再强制要求客户经理非空，允许所有客户资料参与分析
      // 没有客户经理的客户会被归入空字符串组，后续通过交易数据中的业代字段补充
      const profileConditions: string[] = [];
      if (filters?.region && filters.region.length > 0) {
        const vals = filters.region.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        profileConditions.push('region IN (' + vals + ')');
      }
      if (filters?.tier && filters.tier.length > 0) {
        const vals = filters.tier.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        profileConditions.push('tier IN (' + vals + ')');
      } else if (filters?.sheetType && filters.sheetType.length > 0) {
        // 根据 sheetType 自动推断 tier：一阶订单/一阶回单 → 一阶，二阶订单/二阶回单 → 二阶
        const hasFirst = filters.sheetType.some((s) => s.includes('一阶'));
        const hasSecond = filters.sheetType.some((s) => s.includes('二阶'));
        if (hasFirst && !hasSecond) {
          profileConditions.push("tier = '一阶'");
        } else if (hasSecond && !hasFirst) {
          profileConditions.push("tier = '二阶'");
        }
      }
      if (filters?.dealerType && filters.dealerType.length > 0) {
        const allFullNames: string[] = [];
        for (const dt of filters.dealerType) {
          for (const [full, simplified] of Object.entries(DEALER_TYPE_TO_FORMAT)) {
            if (simplified === dt) allFullNames.push(full.replace(/'/g, "''"));
          }
        }
        if (allFullNames.length > 0) {
          profileConditions.push("extras->>'经销商类型' IN ('" + allFullNames.join("','") + "')");
        } else {
          const vals = filters.dealerType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
          profileConditions.push("extras->>'经销商类型' IN (" + vals + ")");
        }
      }
      // 当日模式：排除自售、特约士多批、特约特通批形态
      if (filters?.mode === 'daily') {
        profileConditions.push("extras->>'经销商类型' NOT IN ('自售', '特约士多批', '特约特通批')");
      }
      if (filters?.isPaid && filters.isPaid.length > 0) {
        const hasPaid = filters.isPaid.includes('true');
        const hasUnpaid = filters.isPaid.includes('false');
        if (hasPaid && !hasUnpaid) {
          profileConditions.push("extras->>'付费金额' IS NOT NULL AND extras->>'付费金额' != ''");
        } else if (!hasPaid && hasUnpaid) {
          profileConditions.push("(extras->>'付费金额' IS NULL OR extras->>'付费金额' = '')");
        }
      }
      if (filters?.customerKeyword) {
        const kw = filters.customerKeyword.replace(/'/g, "''");
        profileConditions.push("(customer_name LIKE '%" + kw + "%' OR customer_code LIKE '%" + kw + "%')");
      }
      if (filters?.salesRep && filters.salesRep.length > 0) {
        const vals = filters.salesRep.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        profileConditions.push("extras->>'客户经理' IN (" + vals + ")");
      }
      const whereClause = profileConditions.join(' AND ');
      const whereSql = whereClause ? `WHERE ${whereClause} ` : '';

      const repResult = await this.db.execute(sql.raw(
        "SELECT COALESCE(extras->>'客户经理', '') as sales_rep, region, tier, COUNT(*)::int as service_points " +
        'FROM customer_profile ' + whereSql +
        "GROUP BY extras->>'客户经理', region, tier ORDER BY region, tier, COALESCE(extras->>'客户经理', '')"
      ));
      const customerMapResult = await this.db.execute(sql.raw(
        "SELECT customer_code, COALESCE(extras->>'客户经理', '') as sales_rep, region, tier " +
        'FROM customer_profile ' + whereSql
      ));
      const codeToGroup = new Map<string, string>();
      for (const row of customerMapResult as unknown as Array<{ customer_code: string; sales_rep: string; region: string; tier: string }>) {
        codeToGroup.set(row.customer_code, row.sales_rep + '|||' + row.region + '|||' + row.tier);
      }
      this.logger.log(`Heatmap 客户资料: profile条件='${whereClause}', 匹配客户数=${codeToGroup.size}, 业代组数=${repResult.length}`);

      // 构建线路映射和业代组 → 星期 → 客户编码集合（用于当日成交率计算）
      const routeData = await this.routeProfileService.findAll(1, 10000);
      const codeToRouteMap = new Map<string, string>();
      for (const route of routeData.items) {
        codeToRouteMap.set(route.customerCode, route.routeName);
      }
      const groupToDayRouteStores: Record<string, Record<string, Set<string>>> = {};
      for (const [code, groupKey] of codeToGroup) {
        const routeName = codeToRouteMap.get(code);
        if (!routeName) continue;
        const days = routeName.split(',').map((d: string) => d.trim());
        for (const day of days) {
          if (!groupToDayRouteStores[groupKey]) groupToDayRouteStores[groupKey] = {};
          if (!groupToDayRouteStores[groupKey][day]) groupToDayRouteStores[groupKey][day] = new Set();
          groupToDayRouteStores[groupKey][day].add(code);
        }
      }

      const fields = await this.getDatasetFields(datasetId);
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);

      // 验证字段名是否与实际数据中的 key 匹配，通过采样数据自动修正
      const sampleResult = await this.db.execute(sql.raw(
        "SELECT content FROM data_record WHERE dataset_id = '" + datasetId.replace(/'/g, "''") +
        "' AND content_hash IS NOT NULL LIMIT 1"
      ));
      if (sampleResult.length > 0) {
        const sampleContent = (sampleResult[0] as { content: Record<string, unknown> }).content;
        if (sampleContent && typeof sampleContent === 'object') {
          const dataKeys = Object.keys(sampleContent);
          // 如果推断的字段不在数据 keys 中，尝试模糊匹配
          if (codeField && !dataKeys.includes(codeField)) {
            const fallbackCode = dataKeys.find((k: string) => {
              const lower = k.toLowerCase();
              return /客户.*编码|customer.*code|编码/i.test(lower);
            }) ?? dataKeys.find((k: string) => /编码|code/i.test(k));
            if (fallbackCode) {
              this.logger.warn(`字段名不匹配: 元数据中客户编码字段 '${codeField}' 不在数据中，自动修正为 '${fallbackCode}'`);
              codeField = fallbackCode;
            }
          }
          if (dateField && !dataKeys.includes(dateField)) {
            const fallbackDate = dataKeys.find((k: string) => {
              const lower = k.toLowerCase();
              return /日期|date|时间/i.test(lower);
            }) ?? dataKeys.find((k: string) => /date|日期/i.test(k));
            if (fallbackDate) {
              this.logger.warn(`字段名不匹配: 元数据中日期字段 '${dateField}' 不在数据中，自动修正为 '${fallbackDate}'`);
              dateField = fallbackDate;
            }
          }
        }
      }

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;

      this.logger.log(`Heatmap 字段解析: codeField=${codeField}, dateField=${dateField}, boxCount=${boxCountField}, salesRep=${salesRepField}, region=${regionField}`);

      const transConditions: string[] = [
        "dataset_id = '" + datasetId.replace(/'/g, "''") + "'",
        "content->>'" + safeDateField + "' IS NOT NULL",
        "content->>'" + safeDateField + "' != ''",
      ];
      if (granularity === 'day' || granularity === 'week') {
        transConditions.push("REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') >= '" + dateFrom + "'");
        transConditions.push("REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') <= '" + dateTo + "'");
      } else if (granularity === 'month') {
        transConditions.push("REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') >= '" + year + "-01-01'");
        transConditions.push("REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') <= '" + year + "-12-31'");
      }
      if (filters?.brand && filters.brand.length > 0) {
        const vals = filters.brand.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push("content->>'品牌' IN (" + vals + ")");
      }
      if (filters?.sheetType && filters.sheetType.length > 0) {
        const vals = filters.sheetType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push("content->>'_sheetType' IN (" + vals + ")");
      }
      if (filters?.specification && filters.specification.length > 0) {
        const vals = filters.specification.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push("content->>'产品-规格' IN (" + vals + ")");
      }
      const dedupedTransQuery =
        'WITH deduped AS (' +
        ' SELECT DISTINCT ON (content_hash)' +
        " content->>'" + safeCodeField + "' as customer_code," +
        " content->>'" + safeDateField + "' as trans_date" +
        (boxCountField ? ", (content->>'" + boxCountField.replace(/'/g, "''") + "')::numeric as box_count" : '') +
        (salesRepField ? ", content->>'" + salesRepField.replace(/'/g, "''") + "' as trans_sales_rep" : '') +
        (regionField ? ", content->>'" + regionField.replace(/'/g, "''") + "' as trans_region" : '') +
        ' FROM data_record WHERE ' + transConditions.join(' AND ') +
        ' AND content_hash IS NOT NULL' +
        ' ORDER BY content_hash, _created_at' +
        ') SELECT customer_code, trans_date' +
        (boxCountField ? ', box_count' : '') +
        (salesRepField ? ', trans_sales_rep' : '') +
        (regionField ? ', trans_region' : '') +
        ' FROM deduped';
      const transResult = await this.db.execute(sql.raw(dedupedTransQuery));
      this.logger.log(`Heatmap 交易数据: 查询到 ${transResult.length} 条去重交易记录 (codeField=${safeCodeField}, dateField=${safeDateField})`);
      const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
      const parseDate = (dateStr: string): { y: number; m: number; d: number } | null => {
        const normalized = dateStr.replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10); const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return { y, m, d };
      };
      const totalDaysInRange = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const parseToPeriod = (dateStr: string): number | null => {
        const parsed = parseDate(dateStr);
        if (!parsed) return null;
        const parsedDate = new Date(parsed.y, parsed.m - 1, parsed.d);
        switch (granularity) {
          case 'day': {
            if (parsedDate < from || parsedDate > to) return null;
            return Math.round((parsedDate.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
          }
          case 'week': {
            if (parsed.y !== year || parsed.m !== month) return null;
            const daysInMonth = new Date(year, month, 0).getDate();
            if (parsed.d < 1 || parsed.d > daysInMonth) return null;
            return Math.ceil(parsed.d / 7);
          }
          case 'month':
            if (parsed.y !== year) return null;
            if (parsed.m < 1 || parsed.m > 12) return null;
            return parsed.m;
          case 'year':
            return parsed.y;
        }
      };

      let periods: number[];
      let columns: HeatmapColumnHeader[];
      switch (granularity) {
        case 'day': {
          periods = Array.from({ length: totalDaysInRange }, (_, i: number) => i);
          columns = periods.map((idx: number) => {
            const d = new Date(from);
            d.setDate(d.getDate() + idx);
            const weekday = WEEKDAYS[d.getDay()];
            const monthDay = d.getDate();
            const monthNum = d.getMonth() + 1;
            const label = idx === 0 || monthDay === 1 ? monthNum + '/' + monthDay : String(monthDay);
            return { index: idx, label, subLabel: weekday, isHoliday: d.getDay() === 0 };
          });
          break;
        }
        case 'week': {
          const daysInMonth = new Date(year, month, 0).getDate();
          const weekCount = Math.ceil(daysInMonth / 7);
          periods = Array.from({ length: weekCount }, (_, i: number) => i + 1);
          columns = periods.map((w: number) => ({ index: w - 1, label: 'W' + w }));
          break;
        }
        case 'month': {
          periods = Array.from({ length: 12 }, (_, i: number) => i + 1);
          columns = periods.map((m: number) => ({ index: m - 1, label: m + '月' }));
          break;
        }
        case 'year': {
          const yearsSet = new Set<number>();
          for (const trans of transResult as unknown as Array<{ customer_code: string; trans_date: string }>) {
            const parsed = parseDate(trans.trans_date);
            if (parsed) yearsSet.add(parsed.y);
          }
          periods = Array.from(yearsSet).sort((a: number, b: number) => a - b);
          columns = periods.map((y: number, idx: number) => ({ index: idx, label: String(y) }));
          break;
        }
      }

      const compositeKey = (salesRep: string, region: string, tier: string) =>
        salesRep + '|||' + region + '|||' + tier;

      type TransRow = { customer_code: string; trans_date: string; box_count?: string | null; trans_sales_rep?: string; trans_region?: string };
      // 虚拟服务点：交易数据中有业代/营业所但客户资料中没有的客户
      // 虚拟服务点同样需要应用区域/阶层筛选
      const virtualServicePoints: Record<string, Set<string>> = {};
      for (const trans of transResult as unknown as TransRow[]) {
        if (codeToGroup.has(trans.customer_code)) continue;
        const sr = trans.trans_sales_rep ?? '';
        const rg = trans.trans_region ?? '';
        if (!sr && !rg) continue;
        // 虚拟服务点也需要区域筛选
        if (filters?.region && filters.region.length > 0 && !filters.region.includes(rg)) continue;
        // 虚拟服务点也需要阶层筛选
        const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
        if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(tier)) continue;
        const key = compositeKey(sr, rg, tier);
        if (!virtualServicePoints[key]) virtualServicePoints[key] = new Set();
        virtualServicePoints[key].add(trans.customer_code);
      }

      const repPeriodStores: Record<string, Record<number, Set<string>>> = {};
      const repOrderCounts: Record<string, number> = {};
      const repPeriodOrders: Record<string, Record<number, number>> = {};
      const repServicePointsMap: Record<string, number> = {};
      for (const row of repResult as unknown as Array<{ sales_rep: string; region: string; tier: string; service_points: number }>) {
        const key = compositeKey(row.sales_rep, row.region, row.tier);
        repPeriodStores[key] = {};
        repOrderCounts[key] = 0;
        repPeriodOrders[key] = {};
        repServicePointsMap[key] = parseInt(String(row.service_points), 10);
      }
      for (const [key, codes] of Object.entries(virtualServicePoints)) {
        if (!repPeriodStores[key]) {
          repPeriodStores[key] = {};
          repOrderCounts[key] = 0;
          repPeriodOrders[key] = {};
          repServicePointsMap[key] = codes.size;
        }
      }

      const hasBoxField = !!boxCountField;
      let lastTransPeriodIdx = -1;
      for (const trans of transResult as unknown as TransRow[]) {
        const period = parseToPeriod(trans.trans_date);
        if (period === null) continue;
        const periodIdx = periods.indexOf(period);
        if (periodIdx === -1) continue;
        if (periodIdx > lastTransPeriodIdx) lastTransPeriodIdx = periodIdx;
        let groupKey = codeToGroup.get(trans.customer_code);
        if (!groupKey) {
          const sr = trans.trans_sales_rep ?? '';
          const rg = trans.trans_region ?? '';
          if (!sr && !rg) continue;
          const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
          groupKey = compositeKey(sr, rg, tier);
        }
        if (!repPeriodStores[groupKey]) continue;
        if (!repPeriodStores[groupKey][period]) {
          repPeriodStores[groupKey][period] = new Set();
        }
        repPeriodStores[groupKey][period].add(trans.customer_code);
        const boxValue = hasBoxField ? (parseFloat(String(trans.box_count ?? '')) || 0) : 1;
        repOrderCounts[groupKey] = (repOrderCounts[groupKey] ?? 0) + boxValue;
        if (!repPeriodOrders[groupKey]) repPeriodOrders[groupKey] = {};
        repPeriodOrders[groupKey][period] = (repPeriodOrders[groupKey][period] ?? 0) + boxValue;
      }

      type GroupInfo = { sales_rep: string; region: string; tier: string; service_points: number };
      const activeGroups = new Set<string>();
      for (const trans of transResult as unknown as TransRow[]) {
        let gk = codeToGroup.get(trans.customer_code);
        if (!gk) {
          const sr = trans.trans_sales_rep ?? '';
          const rg = trans.trans_region ?? '';
          if (!sr && !rg) continue;
          const tier = /二阶/.test(filters?.sheetType?.join('') ?? '') ? '二阶' : '一阶';
          gk = compositeKey(sr, rg, tier);
        }
        activeGroups.add(gk);
      }

      const allGroups: GroupInfo[] = [...(repResult as unknown as GroupInfo[])];
      const profileKeys = new Set(allGroups.map((g: GroupInfo) => compositeKey(g.sales_rep, g.region, g.tier)));
      for (const [key, codes] of Object.entries(virtualServicePoints)) {
        if (!profileKeys.has(key) && codes.size > 0) {
          const [sr, rg, ti] = key.split('|||');
          // 过滤掉业代为空的虚拟服务点
          if (!sr) continue;
          allGroups.push({ sales_rep: sr, region: rg, tier: ti, service_points: codes.size });
        }
      }

      const rows: HeatmapRow[] = allGroups.map((repInfo: GroupInfo) => {
        const groupKey = compositeKey(repInfo.sales_rep, repInfo.region, repInfo.tier);
        const dailyData: HeatmapDailyData[] = [];
        const cumulativeStores = new Set<string>();
        const servicePoints = repServicePointsMap[groupKey] ?? parseInt(String(repInfo.service_points), 10);
        const isDailyMode = filters?.mode === 'daily';
        for (let pi = 0; pi < periods.length; pi++) {
          const period = periods[pi];
          const colLabel = columns[pi].label;
          if (pi > lastTransPeriodIdx && !isDailyMode) {
            dailyData.push({ day: period, label: colLabel, rate: null, stores: null });
            continue;
          }
          const periodStores = repPeriodStores[groupKey]?.[period];
          if (!isDailyMode) {
            if (periodStores) {
              for (const code of periodStores) cumulativeStores.add(code);
            }
            const rate = servicePoints > 0 ? cumulativeStores.size / servicePoints : 0;
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: cumulativeStores.size });
          } else if (granularity === 'day') {
            // 当日成交率：当日线路成交门店数 / 当日线路门店总点数
            const periodDate = new Date(from);
            periodDate.setDate(periodDate.getDate() + pi);
            const weekdayChar = WEEKDAYS[periodDate.getDay()];
            const routeDay = '周' + weekdayChar;
            const routeStores = groupToDayRouteStores[groupKey]?.[routeDay];
            const routeStoreCount = routeStores?.size ?? 0;
            if (routeStoreCount === 0) {
              dailyData.push({ day: period, label: colLabel, rate: null, stores: null, routeStores: null, orders: null });
              continue;
            }
            let dealCount = 0;
            if (periodStores) {
              for (const code of periodStores) {
                if (routeStores!.has(code)) dealCount++;
              }
            }
            const rate = dealCount / routeStoreCount;
            const periodOrders = Math.round(repPeriodOrders[groupKey]?.[period] ?? 0);
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: dealCount,
              routeStores: routeStoreCount, orders: periodOrders });
          } else {
            // 当日模式但非日粒度：当期成交门店数 / 总服务点数
            const storeCount = periodStores?.size ?? 0;
            const rate = servicePoints > 0 ? storeCount / servicePoints : 0;
            const periodOrders = Math.round(repPeriodOrders[groupKey]?.[period] ?? 0);
            dailyData.push({
              day: period, label: colLabel, rate: Math.round(rate * 10000) / 10000, stores: storeCount,
              routeStores: servicePoints, orders: periodOrders });
          }
        }
        return {
          salesRep: repInfo.sales_rep, region: repInfo.region, tier: repInfo.tier, servicePoints,
          totalOrders: Math.round(repOrderCounts[groupKey] ?? 0), dailyData };
      });

      this.logger.log(`Heatmap 完成: dataset=${datasetId}, 生成 ${rows.length} 行业代数据, ${columns.length} 个时间列, 虚拟组数=${Object.keys(virtualServicePoints).length}`);
      return { rows, columns, granularity, year, month, daysInMonth: totalDaysInRange, dateFrom, dateTo };
    } catch (err) {
      this.logger.warn('getHeatmapData 失败: ' + (err as Error).message);
      return { rows: [], columns: [], granularity, year: new Date(dateFrom).getFullYear(), month: new Date(dateFrom).getMonth() + 1, daysInMonth: 0, dateFrom, dateTo };
    }
  }

  async getBrandSpecStats(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    filters?: HeatmapFilterParams,
  ): Promise<BrandSpecStatsResponse> {
    if (this.useMemoryStorage) {
      return this.getBrandSpecStatsMemory(datasetId, dateFrom, dateTo, filters);
    }
    try {
      const profileWhere = this.buildProfileWhereClause(filters);
      const profileSql = profileWhere
        ? `SELECT customer_code, COALESCE(extras->>'客户经理', '') as sales_rep, region, tier FROM customer_profile WHERE ${profileWhere}`
        : `SELECT customer_code, COALESCE(extras->>'客户经理', '') as sales_rep, region, tier FROM customer_profile`;
      const profileResult = await this.db.execute(sql.raw(profileSql));
      const codeToGroup = new Map<string, { salesRep: string; region: string; tier: string }>();
      for (const row of profileResult as unknown as Array<{ customer_code: string; sales_rep: string; region: string; tier: string }>) {
        codeToGroup.set(row.customer_code, { salesRep: row.sales_rep, region: row.region, tier: row.tier });
      }

      const fields = await this.getDatasetFields(datasetId);
      const codeField = this.findCustomerCodeField(fields);
      const dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);
      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const safeBoxCountField = boxCountField ? boxCountField.replace(/'/g, "''") : '';
      const safeSalesRepField = salesRepField ? salesRepField.replace(/'/g, "''") : '';
      const safeRegionField = regionField ? regionField.replace(/'/g, "''") : '';

      const transConditions: string[] = [
        `dataset_id = '${datasetId.replace(/'/g, "''")}'`,
        `content->>'${safeDateField}' IS NOT NULL`,
        `content->>'${safeDateField}' != ''`,
        `REPLACE(REPLACE(content->>'${safeDateField}', '.', '-'), '/', '-') >= '${dateFrom}'`,
        `REPLACE(REPLACE(content->>'${safeDateField}', '.', '-'), '/', '-') <= '${dateTo}'`,
      ];
      if (filters?.brand && filters.brand.length > 0) {
        const vals = filters.brand.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push(`content->>'品牌' IN (${vals})`);
      }
      if (filters?.specification && filters.specification.length > 0) {
        const vals = filters.specification.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push(`content->>'产品-规格' IN (${vals})`);
      }
      if (filters?.sheetType && filters.sheetType.length > 0) {
        const vals = filters.sheetType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push(`content->>'_sheetType' IN (${vals})`);
      }

      const dedupedTransQuery =
        'WITH deduped AS (' +
        ' SELECT DISTINCT ON (content_hash)' +
        ` content->>'${safeCodeField}' as customer_code,` +
        ` content->>'${safeDateField}' as trans_date,` +
        (safeBoxCountField ? ` (content->>'${safeBoxCountField}')::numeric as box_count,` : " 0 as box_count,") +
        (safeSalesRepField ? ` content->>'${safeSalesRepField}' as trans_sales_rep,` : " '' as trans_sales_rep,") +
        (safeRegionField ? ` content->>'${safeRegionField}' as trans_region,` : " '' as trans_region,") +
        " content->>'_sheetType' as sheet_type" +
        ' FROM data_record WHERE ' + transConditions.join(' AND ') +
        ' AND content_hash IS NOT NULL' +
        ' ORDER BY content_hash, _created_at' +
        ') SELECT customer_code, box_count, trans_sales_rep, trans_region, sheet_type' +
        ' FROM deduped';
      const transResult = await this.db.execute(sql.raw(dedupedTransQuery));
      this.logger.log(`BrandSpecStats 交易数据: dataset=${datasetId}, 查询到 ${transResult.length} 条去重记录`);

      type TransRow = { customer_code: string; box_count?: string | number | null; trans_sales_rep?: string; trans_region?: string; sheet_type?: string };
      const compositeKey = (salesRep: string, region: string, tier: string) => salesRep + '|||' + region + '|||' + tier;
      const groupStats = new Map<string, { salesRep: string; region: string; tier: string; totalOrders: number; stores: Set<string> }>();

      for (const trans of transResult as unknown as TransRow[]) {
        let salesRep = trans.trans_sales_rep ?? '';
        let region = trans.trans_region ?? '';
        let tier = trans.sheet_type?.startsWith('一阶') ? '一阶' : trans.sheet_type?.startsWith('二阶') ? '二阶' : '';

        const profileGroup = codeToGroup.get(trans.customer_code);
        if (profileGroup) {
          salesRep = profileGroup.salesRep;
          region = profileGroup.region;
          tier = profileGroup.tier;
        } else {
          // 虚拟客户应用区域/阶层筛选
          if (filters?.region && filters.region.length > 0 && !filters.region.includes(region)) continue;
          if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(tier)) continue;
          if (!salesRep && !region) continue;
        }

        const key = compositeKey(salesRep, region, tier);
        const stats = groupStats.get(key);
        const boxValue = parseFloat(String(trans.box_count ?? '0')) || 0;
        if (stats) {
          stats.totalOrders += boxValue;
          stats.stores.add(trans.customer_code);
        } else {
          groupStats.set(key, {
            salesRep,
            region,
            tier,
            totalOrders: boxValue,
            stores: new Set([trans.customer_code]),
          });
        }
      }

      const rows: BrandSpecStatsRow[] = [];
      for (const stats of groupStats.values()) {
        rows.push({
          salesRep: stats.salesRep,
          region: stats.region,
          tier: stats.tier,
          servicePoints: 0,
          totalOrders: Math.round(stats.totalOrders),
          storeCount: stats.stores.size,
        });
      }
      return { rows };
    } catch (err) {
      this.logger.error('getBrandSpecStats 失败: ' + (err as Error).message, (err as Error).stack);
      return { rows: [] };
    }
  }

  /** 内存存储模式下的品牌规格统计 */
  private async getBrandSpecStatsMemory(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    filters?: HeatmapFilterParams,
  ): Promise<BrandSpecStatsResponse> {
    try {
      // 1) 从内存客户资料构建业代分组
      const allProfiles = this.customerProfileService.getAllProfiles();

      // 根据 sheetType 推断 tier
      let inferredTier: string | undefined;
      if (!filters?.tier || filters.tier.length === 0) {
        const sheetTypes = filters?.sheetType ?? [];
        const hasFirst = sheetTypes.some((s) => s.includes('一阶'));
        const hasSecond = sheetTypes.some((s) => s.includes('二阶'));
        if (hasFirst && !hasSecond) inferredTier = '一阶';
        else if (hasSecond && !hasFirst) inferredTier = '二阶';
      }

      const filteredProfiles = allProfiles.filter((p) => {
        if (filters?.region && filters.region.length > 0 && !filters.region.includes(p.region)) return false;
        if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(p.tier)) return false;
        if (inferredTier && p.tier !== inferredTier) return false;
        if (filters?.dealerType && filters.dealerType.length > 0) {
          const dealerType = String(p.extras?.['经销商类型'] ?? '');
          const allFullNames: string[] = [];
          for (const dt of filters.dealerType) {
            for (const [full, simplified] of Object.entries(DEALER_TYPE_TO_FORMAT)) {
              if (simplified === dt) allFullNames.push(full);
            }
          }
          if (allFullNames.length > 0 && !allFullNames.includes(dealerType) && !filters.dealerType.includes(dealerType)) return false;
        }
        if (filters?.isPaid && filters.isPaid.length > 0) {
          const paid = p.extras?.['付费金额'];
          const hasPaid = filters.isPaid.includes('true');
          const hasUnpaid = filters.isPaid.includes('false');
          if (hasPaid && !hasUnpaid && (!paid || paid === '')) return false;
          if (!hasPaid && hasUnpaid && (paid && paid !== '')) return false;
        }
        if (filters?.customerKeyword) {
          const kw = filters.customerKeyword.toLowerCase();
          if (!p.customerCode.toLowerCase().includes(kw) && !p.customerName.toLowerCase().includes(kw)) return false;
        }
        if (filters?.salesRep && filters.salesRep.length > 0) {
          const sr = String(p.extras?.['客户经理'] ?? '');
          if (!filters.salesRep.includes(sr)) return false;
        }
        return true;
      });

      const codeToGroup = new Map<string, { salesRep: string; region: string; tier: string }>();
      for (const p of filteredProfiles) {
        const sr = String(p.extras?.['客户经理'] ?? '');
        codeToGroup.set(p.customerCode, { salesRep: sr, region: p.region, tier: p.tier });
      }
      this.logger.log(`[Memory] BrandSpecStats 客户资料: 匹配客户数=${codeToGroup.size}`);

      // 2) 获取数据集字段和记录
      const memDataset = this.datasetStore.get(datasetId);
      if (!memDataset || memDataset.records.length === 0) {
        this.logger.warn(`[Memory] BrandSpecStats 数据集 ${datasetId} 不存在或无记录`);
        return { rows: [] };
      }

      const fields = memDataset.fields;
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);
      const salesRepField = fields.find((f: FieldConfig) => f.name === '人员-业代')?.name;
      const regionField = fields.find((f: FieldConfig) => f.name === '组织-营业所')?.name;

      // 采样验证字段名
      if (memDataset.records.length > 0) {
        const sampleKeys = Object.keys(memDataset.records[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fallbackCode = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /编码|code/i.test(k));
          if (fallbackCode) { codeField = fallbackCode; }
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fallbackDate = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /date|日期/i.test(k));
          if (fallbackDate) { dateField = fallbackDate; }
        }
      }

      // 3) 解析并过滤交易记录（去重）
      const parseDate = (dateStr: string): string | null => {
        const normalized = String(dateStr ?? '').replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10); const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      };

      const seenHashes = new Set<string>();
      const compositeKey = (salesRep: string, region: string, tier: string) => salesRep + '|||' + region + '|||' + tier;
      const groupStats = new Map<string, { salesRep: string; region: string; tier: string; totalOrders: number; stores: Set<string> }>();

      for (const record of memDataset.records) {
        if (!record || typeof record !== 'object') continue;
        const cd = String(record[codeField ?? ''] ?? '').trim();
        const dd = String(record[dateField ?? ''] ?? '').trim();
        if (!cd || !dd) continue;
        // contentHash 去重模拟
        const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        // 日期范围过滤
        const normalizedDate = parseDate(dd);
        if (!normalizedDate) continue;
        if (normalizedDate < dateFrom || normalizedDate > dateTo) continue;

        // 品牌筛选
        if (filters?.brand && filters.brand.length > 0) {
          const brand = String(record['品牌'] ?? '');
          if (!filters.brand.includes(brand)) continue;
        }
        // 规格筛选
        if (filters?.specification && filters.specification.length > 0) {
          const spec = String(record['产品-规格'] ?? '');
          if (!filters.specification.includes(spec)) continue;
        }
        // sheetType 筛选
        if (filters?.sheetType && filters.sheetType.length > 0) {
          const st = String(record['_sheetType'] ?? '');
          if (!filters.sheetType.includes(st as SheetType)) continue;
        }

        let salesRep = salesRepField ? String(record[salesRepField] ?? '') : '';
        let region = regionField ? String(record[regionField] ?? '') : '';
        let tier = String(record['_sheetType'] ?? '').startsWith('一阶') ? '一阶'
          : String(record['_sheetType'] ?? '').startsWith('二阶') ? '二阶' : '';

        const profileGroup = codeToGroup.get(cd);
        if (profileGroup) {
          salesRep = profileGroup.salesRep;
          region = profileGroup.region;
          tier = profileGroup.tier;
        } else {
          if (filters?.region && filters.region.length > 0 && !filters.region.includes(region)) continue;
          if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(tier)) continue;
          if (inferredTier && tier !== inferredTier) continue;
          if (!salesRep && !region) continue;
        }

        const boxValue = boxCountField ? (parseFloat(String(record[boxCountField] ?? '')) || 0) : 0;
        const key = compositeKey(salesRep, region, tier);
        const stats = groupStats.get(key);
        if (stats) {
          stats.totalOrders += boxValue;
          stats.stores.add(cd);
        } else {
          groupStats.set(key, {
            salesRep, region, tier,
            totalOrders: boxValue,
            stores: new Set([cd]),
          });
        }
      }
      this.logger.log(`[Memory] BrandSpecStats 交易数据: ${groupStats.size} 个业代组`);

      const rows: BrandSpecStatsRow[] = [];
      for (const stats of groupStats.values()) {
        rows.push({
          salesRep: stats.salesRep,
          region: stats.region,
          tier: stats.tier,
          servicePoints: 0,
          totalOrders: Math.round(stats.totalOrders),
          storeCount: stats.stores.size,
        });
      }
      return { rows };
    } catch (err) {
      this.logger.error('[Memory] getBrandSpecStats 失败: ' + (err as Error).message, (err as Error).stack);
      return { rows: [] };
    }
  }

  async getBrandSpecMonthlyStats(
    datasetId: string,
    salesRep: string,
    region: string,
    tier: string,
    filters?: HeatmapFilterParams,
  ): Promise<BrandSpecMonthlyStatsResponse> {
    if (this.useMemoryStorage) {
      return this.getBrandSpecMonthlyStatsMemory(datasetId, salesRep, region, tier, filters);
    }
    try {
      // 1) 获取客户资料，找到该业代的所有客户编码
      const profileWhere = this.buildProfileWhereClause({
        ...filters,
        salesRep: [salesRep],
        region: [region],
        tier: [tier],
      });
      const profileSql = profileWhere
        ? `SELECT customer_code FROM customer_profile WHERE ${profileWhere}`
        : `SELECT customer_code FROM customer_profile WHERE COALESCE(extras->>'客户经理','') = '${salesRep.replace(/'/g, "''")}' AND region = '${region.replace(/'/g, "''")}' AND tier = '${tier.replace(/'/g, "''")}'`;
      const profileResult = await this.db.execute(sql.raw(profileSql));
      const customerCodes = new Set<string>();
      for (const row of profileResult as unknown as Array<{ customer_code: string }>) {
        customerCodes.add(row.customer_code);
      }

      if (customerCodes.size === 0) {
        this.logger.warn(`BrandSpecMonthlyStats: 未找到业代 ${salesRep} 的客户`);
        return { rows: [] };
      }

      // 2) 构建交易数据查询（不按品牌/规格过滤，按维度值聚合）
      const fields = await this.getDatasetFields(datasetId);
      const codeField = this.findCustomerCodeField(fields);
      const dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const safeBoxCountField = boxCountField ? boxCountField.replace(/'/g, "''") : '';

      // 计算6个月日期范围（不含当月）
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFromStr = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10);
      const dateToStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const codeList = Array.from(customerCodes).map((c) => "'" + c.replace(/'/g, "''") + "'").join(',');

      const transConditions: string[] = [
        `dataset_id = '${datasetId.replace(/'/g, "''")}'`,
        `content->>'${safeCodeField}' IN (${codeList})`,
        `content->>'${safeDateField}' IS NOT NULL`,
        `content->>'${safeDateField}' != ''`,
        `REPLACE(REPLACE(content->>'${safeDateField}', '.', '-'), '/', '-') >= '${dateFromStr}'`,
        `REPLACE(REPLACE(content->>'${safeDateField}', '.', '-'), '/', '-') <= '${dateToStr}'`,
      ];
      if (filters?.sheetType && filters.sheetType.length > 0) {
        const vals = filters.sheetType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        transConditions.push(`content->>'_sheetType' IN (${vals})`);
      }

      const dedupedTransQuery =
        'WITH deduped AS (' +
        ' SELECT DISTINCT ON (content_hash)' +
        ` content->>'${safeCodeField}' as customer_code,` +
        ` content->>'${safeDateField}' as trans_date,` +
        (safeBoxCountField ? ` (content->>'${safeBoxCountField}')::numeric as box_count,` : " 0 as box_count,") +
        " content->>'品牌' as brand_val," +
        " content->>'产品-规格' as spec_val" +
        ' FROM data_record WHERE ' + transConditions.join(' AND ') +
        ' AND content_hash IS NOT NULL' +
        ' ORDER BY content_hash, _created_at' +
        ') SELECT customer_code, trans_date, box_count, brand_val, spec_val FROM deduped';
      const transResult = await this.db.execute(sql.raw(dedupedTransQuery));
      this.logger.log(`BrandSpecMonthlyStats 交易数据: dataset=${datasetId}, 查询到 ${transResult.length} 条去重记录`);

      // 3) 按 (维度值, 月份) 聚合
      const requestedBrands = filters?.brand ?? [];
      const requestedSpecs = filters?.specification ?? [];

      // key = `${dimensionType}|||${dimensionValue}|||${month}`
      const dimMonthlyMap = new Map<string, { boxCount: number; stores: Set<string> }>();
      type TransRow = { customer_code: string; trans_date: string; box_count?: string | number | null; brand_val?: string; spec_val?: string };
      for (const trans of transResult as unknown as TransRow[]) {
        const normalized = String(trans.trans_date ?? '').replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) continue;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10);
        if (isNaN(y) || isNaN(m)) continue;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const boxValue = parseFloat(String(trans.box_count ?? '0')) || 0;
        const brandVal = String(trans.brand_val ?? '').trim();
        const specVal = String(trans.spec_val ?? '').trim();

        if (brandVal && requestedBrands.includes(brandVal)) {
          const key = `brand|||${brandVal}|||${monthKey}`;
          const stats = dimMonthlyMap.get(key);
          if (stats) { stats.boxCount += boxValue; stats.stores.add(trans.customer_code); }
          else dimMonthlyMap.set(key, { boxCount: boxValue, stores: new Set([trans.customer_code]) });
        }
        if (specVal && requestedSpecs.includes(specVal)) {
          const key = `spec|||${specVal}|||${monthKey}`;
          const stats = dimMonthlyMap.get(key);
          if (stats) { stats.boxCount += boxValue; stats.stores.add(trans.customer_code); }
          else dimMonthlyMap.set(key, { boxCount: boxValue, stores: new Set([trans.customer_code]) });
        }
      }

      // 4) 生成按维度值的6个月列表
      const rows: BrandSpecDimensionMonthlyStat[] = [];
      for (const brand of requestedBrands) {
        const monthly: BrandSpecMonthlyStat[] = [];
        for (let i = 6; i >= 1; i--) {
          const d = new Date(currentMonthStart);
          d.setMonth(d.getMonth() - i);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const stats = dimMonthlyMap.get(`brand|||${brand}|||${monthKey}`);
          monthly.push({ month: monthKey, boxCount: stats ? Math.round(stats.boxCount) : 0, storeCount: stats ? stats.stores.size : 0 });
        }
        rows.push({ dimensionType: 'brand', dimensionValue: brand, monthly });
      }
      for (const spec of requestedSpecs) {
        const monthly: BrandSpecMonthlyStat[] = [];
        for (let i = 6; i >= 1; i--) {
          const d = new Date(currentMonthStart);
          d.setMonth(d.getMonth() - i);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const stats = dimMonthlyMap.get(`spec|||${spec}|||${monthKey}`);
          monthly.push({ month: monthKey, boxCount: stats ? Math.round(stats.boxCount) : 0, storeCount: stats ? stats.stores.size : 0 });
        }
        rows.push({ dimensionType: 'specification', dimensionValue: spec, monthly });
      }
      return { rows };
    } catch (err) {
      this.logger.error('getBrandSpecMonthlyStats 失败: ' + (err as Error).message, (err as Error).stack);
      return { rows: [] };
    }
  }

  /** 内存存储模式下的品牌规格月度统计 */
  private async getBrandSpecMonthlyStatsMemory(
    datasetId: string,
    salesRep: string,
    region: string,
    tier: string,
    filters?: HeatmapFilterParams,
  ): Promise<BrandSpecMonthlyStatsResponse> {
    try {
      const allProfiles = this.customerProfileService.getAllProfiles();
      const customerCodes = new Set<string>();
      for (const p of allProfiles) {
        const sr = String(p.extras?.['客户经理'] ?? '');
        if (sr === salesRep && p.region === region && p.tier === tier) {
          customerCodes.add(p.customerCode);
        }
      }
      if (customerCodes.size === 0) {
        this.logger.warn(`[Memory] BrandSpecMonthlyStats: 未找到业代 ${salesRep} 的客户`);
        return { rows: [] };
      }

      const memDataset = this.datasetStore.get(datasetId);
      if (!memDataset || memDataset.records.length === 0) {
        return { rows: [] };
      }
      const fields = memDataset.fields;
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);
      const boxCountField = this.findBoxCountField(fields);

      if (memDataset.records.length > 0) {
        const sampleKeys = Object.keys(memDataset.records[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fb = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /编码|code/i.test(k));
          if (fb) codeField = fb;
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fb = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /date|日期/i.test(k));
          if (fb) dateField = fb;
        }
      }

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFromStr = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10);
      const dateToStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const requestedBrands = filters?.brand ?? [];
      const requestedSpecs = filters?.specification ?? [];
      const dimMonthlyMap = new Map<string, { boxCount: number; stores: Set<string> }>();
      const seenHashes = new Set<string>();

      for (const record of memDataset.records) {
        if (!record || typeof record !== 'object') continue;
        const cd = String(record[codeField ?? ''] ?? '').trim();
        const dd = String(record[dateField ?? ''] ?? '').trim();
        if (!cd || !dd) continue;
        if (!customerCodes.has(cd)) continue;
        const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const normalized = dd.replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) continue;
        const normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        if (normalizedDate < dateFromStr || normalizedDate > dateToStr) continue;

        if (filters?.sheetType && filters.sheetType.length > 0) {
          const st = String(record['_sheetType'] ?? '');
          if (!filters.sheetType.includes(st as SheetType)) continue;
        }

        const monthKey = `${parts[0]}-${parts[1].padStart(2, '0')}`;
        const boxValue = boxCountField ? (parseFloat(String(record[boxCountField] ?? '')) || 0) : 0;
        const brandVal = String(record['品牌'] ?? '').trim();
        const specVal = String(record['产品-规格'] ?? '').trim();

        if (brandVal && requestedBrands.includes(brandVal)) {
          const key = `brand|||${brandVal}|||${monthKey}`;
          const stats = dimMonthlyMap.get(key);
          if (stats) { stats.boxCount += boxValue; stats.stores.add(cd); }
          else dimMonthlyMap.set(key, { boxCount: boxValue, stores: new Set([cd]) });
        }
        if (specVal && requestedSpecs.includes(specVal)) {
          const key = `spec|||${specVal}|||${monthKey}`;
          const stats = dimMonthlyMap.get(key);
          if (stats) { stats.boxCount += boxValue; stats.stores.add(cd); }
          else dimMonthlyMap.set(key, { boxCount: boxValue, stores: new Set([cd]) });
        }
      }

      const rows: BrandSpecDimensionMonthlyStat[] = [];
      for (const brand of requestedBrands) {
        const monthly: BrandSpecMonthlyStat[] = [];
        for (let i = 6; i >= 1; i--) {
          const d = new Date(currentMonthStart);
          d.setMonth(d.getMonth() - i);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const stats = dimMonthlyMap.get(`brand|||${brand}|||${monthKey}`);
          monthly.push({ month: monthKey, boxCount: stats ? Math.round(stats.boxCount) : 0, storeCount: stats ? stats.stores.size : 0 });
        }
        rows.push({ dimensionType: 'brand', dimensionValue: brand, monthly });
      }
      for (const spec of requestedSpecs) {
        const monthly: BrandSpecMonthlyStat[] = [];
        for (let i = 6; i >= 1; i--) {
          const d = new Date(currentMonthStart);
          d.setMonth(d.getMonth() - i);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const stats = dimMonthlyMap.get(`spec|||${spec}|||${monthKey}`);
          monthly.push({ month: monthKey, boxCount: stats ? Math.round(stats.boxCount) : 0, storeCount: stats ? stats.stores.size : 0 });
        }
        rows.push({ dimensionType: 'specification', dimensionValue: spec, monthly });
      }
      return { rows };
    } catch (err) {
      this.logger.error('[Memory] getBrandSpecMonthlyStats 失败: ' + (err as Error).message, (err as Error).stack);
      return { rows: [] };
    }
  }

  private buildProfileWhereClause(filters?: HeatmapFilterParams): string {
    // 不再强制要求客户经理非空，允许所有客户资料参与分析
    const profileConditions: string[] = [];
    if (filters?.region && filters.region.length > 0) {
      const vals = filters.region.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
      profileConditions.push('region IN (' + vals + ')');
    }
    if (filters?.tier && filters.tier.length > 0) {
      const vals = filters.tier.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
      profileConditions.push('tier IN (' + vals + ')');
    } else if (filters?.sheetType && filters.sheetType.length > 0) {
      // 根据 sheetType 自动推断 tier：一阶订单/一阶回单 → 一阶，二阶订单/二阶回单 → 二阶
      const hasFirst = filters.sheetType.some((s) => s.includes('一阶'));
      const hasSecond = filters.sheetType.some((s) => s.includes('二阶'));
      if (hasFirst && !hasSecond) {
        profileConditions.push("tier = '一阶'");
      } else if (hasSecond && !hasFirst) {
        profileConditions.push("tier = '二阶'");
      }
    }
    if (filters?.dealerType && filters.dealerType.length > 0) {
      const allFullNames: string[] = [];
      for (const dt of filters.dealerType) {
        for (const [full, simplified] of Object.entries(DEALER_TYPE_TO_FORMAT)) {
          if (simplified === dt) allFullNames.push(full.replace(/'/g, "''"));
        }
      }
      if (allFullNames.length > 0) {
        profileConditions.push("extras->>'经销商类型' IN ('" + allFullNames.join("','") + "')");
      } else {
        const vals = filters.dealerType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
        profileConditions.push("extras->>'经销商类型' IN (" + vals + ")");
      }
    }
    if (filters?.isPaid && filters.isPaid.length > 0) {
      const hasPaid = filters.isPaid.includes('true');
      const hasUnpaid = filters.isPaid.includes('false');
      if (hasPaid && !hasUnpaid) {
        profileConditions.push("extras->>'付费金额' IS NOT NULL AND extras->>'付费金额' != ''");
      } else if (!hasPaid && hasUnpaid) {
        profileConditions.push("(extras->>'付费金额' IS NULL OR extras->>'付费金额' = '')");
      }
    }
    if (filters?.customerKeyword) {
      const kw = filters.customerKeyword.replace(/'/g, "''");
      profileConditions.push("(customer_name LIKE '%" + kw + "%' OR customer_code LIKE '%" + kw + "%')");
    }
    if (filters?.salesRep && filters.salesRep.length > 0) {
      const vals = filters.salesRep.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
      profileConditions.push("extras->>'客户经理' IN (" + vals + ")");
    }
    return profileConditions.join(' AND ');
  }

  /** 内存存储模式下的未成交门店查询 */
  private async getUnconvertedStoresMemory(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    filters?: HeatmapFilterParams,
  ): Promise<GetUnconvertedStoresResponse> {
    try {
      // 获取线路资料，构建门店编码到线路名称的映射
      const routeData = await this.routeProfileService.findAll(1, 10000);
      const codeToRouteMap = new Map<string, string>();
      for (const route of routeData.items) {
        codeToRouteMap.set(route.customerCode, route.routeName);
      }

      // 1) 从内存客户资料获取所有客户并应用筛选条件
      const allProfiles = this.customerProfileService.getAllProfiles();

      // 根据 sheetType 推断 tier：一阶订单/一阶回单 → 一阶，二阶订单/二阶回单 → 二阶
      let inferredTier: string | undefined;
      if (!filters?.tier || filters.tier.length === 0) {
        const sheetTypes = filters?.sheetType ?? [];
        const hasFirst = sheetTypes.some((s) => s.includes('一阶'));
        const hasSecond = sheetTypes.some((s) => s.includes('二阶'));
        if (hasFirst && !hasSecond) inferredTier = '一阶';
        else if (hasSecond && !hasFirst) inferredTier = '二阶';
      }

      const filteredProfiles = allProfiles.filter((p) => {
        if (filters?.region && filters.region.length > 0 && !filters.region.includes(p.region)) return false;
        if (filters?.tier && filters.tier.length > 0 && !filters.tier.includes(p.tier)) return false;
        if (inferredTier && p.tier !== inferredTier) return false;
        if (filters?.dealerType && filters.dealerType.length > 0) {
          const dealerType = String(p.extras?.['经销商类型'] ?? '');
          const allFullNames: string[] = [];
          for (const dt of filters.dealerType) {
            for (const [full, simplified] of Object.entries(DEALER_TYPE_TO_FORMAT)) {
              if (simplified === dt) allFullNames.push(full);
            }
          }
          if (allFullNames.length > 0 && !allFullNames.includes(dealerType) && !filters.dealerType.includes(dealerType)) return false;
        }
        // 当日模式：排除自售、特约士多批、特约特通批形态
        if (filters?.mode === 'daily') {
          const dt = String(p.extras?.['经销商类型'] ?? '');
          if (dt === '自售' || dt === '特约士多批' || dt === '特约特通批') return false;
        }
        if (filters?.isPaid && filters.isPaid.length > 0) {
          const paid = p.extras?.['付费金额'];
          const hasPaid = filters.isPaid.includes('true');
          const hasUnpaid = filters.isPaid.includes('false');
          if (hasPaid && !hasUnpaid && (!paid || paid === '')) return false;
          if (!hasPaid && hasUnpaid && (paid && paid !== '')) return false;
        }
        if (filters?.customerKeyword) {
          const kw = filters.customerKeyword.toLowerCase();
          if (!p.customerCode.toLowerCase().includes(kw) && !p.customerName.toLowerCase().includes(kw)) return false;
        }
        if (filters?.salesRep && filters.salesRep.length > 0) {
          const sr = String(p.extras?.['客户经理'] ?? '');
          if (!filters.salesRep.includes(sr)) return false;
        }
        // 线路筛选：支持复合线路递归匹配
        // 选中"周二"时，"周二,周六"等复合线路也会被匹配
        if (filters?.route && filters.route.length > 0) {
          const customerRoute = codeToRouteMap.get(p.customerCode);
          if (!customerRoute) return false;
          const customerRouteDays = customerRoute.split(',').map((d: string) => d.trim());
          const hasMatch = customerRouteDays.some((day: string) => filters.route!.includes(day));
          if (!hasMatch) return false;
        }
        return true;
      });

      // 2) 获取数据集字段和记录
      const memDataset = this.datasetStore.get(datasetId);
      if (!memDataset || memDataset.records.length === 0) {
        // 没有交易数据，所有客户都是未成交
        const items: UnconvertedStoreItem[] = filteredProfiles.map((p) => ({
          customerCode: p.customerCode,
          customerName: p.customerName,
          region: p.region,
          tier: p.tier,
          salesRep: String(p.extras?.['客户经理'] ?? ''),
          extras: p.extras ?? {},
        }));
        this.logger.log(`[Memory] Unconverted stores: ${items.length} found (no transaction data)`);
        return { items, total: items.length };
      }

      const fields = memDataset.fields;
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);

      // 采样验证字段名
      if (memDataset.records.length > 0) {
        const sampleKeys = Object.keys(memDataset.records[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fallbackCode = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
          if (fallbackCode) { codeField = fallbackCode; }
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fallbackDate = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
          if (fallbackDate) { dateField = fallbackDate; }
        }
      }

      // 3) 解析日期范围
      const parseDate = (dateStr: string): { y: number; m: number; d: number } | null => {
        const normalized = String(dateStr ?? '').replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10); const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return { y, m, d };
      };

      // 4) 收集在日期范围内有交易的客户编码
      const tradedCodes = new Set<string>();
      const selectedBrands = filters?.brand?.filter((b: string) => b) ?? [];
      const brandTradedMap = new Map<string, Set<string>>(); // customerCode -> Set<brand>

      for (const record of memDataset.records) {
        if (!record || typeof record !== 'object') continue;
        const cd = String(record[codeField ?? ''] ?? '').trim();
        const dd = String(record[dateField ?? ''] ?? '').trim();
        if (!cd || !dd) continue;

        // 日期范围过滤
        const parsed = parseDate(dd);
        if (!parsed) continue;
        const normalizedDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        if (normalizedDate < dateFrom || normalizedDate > dateTo) continue;

        // sheetType 筛选
        if (filters?.sheetType && filters.sheetType.length > 0) {
          const st = String(record['_sheetType'] ?? '') as SheetType;
          if (!filters.sheetType.includes(st)) continue;
        }
        // specification 筛选
        if (filters?.specification && filters.specification.length > 0) {
          const spec = String(record['产品-规格'] ?? '');
          if (!filters.specification.includes(spec)) continue;
        }

        tradedCodes.add(cd);

        // 品牌交易记录
        if (selectedBrands.length > 0) {
          const brand = String(record['品牌'] ?? '').trim();
          if (brand && selectedBrands.includes(brand)) {
            if (!brandTradedMap.has(cd)) brandTradedMap.set(cd, new Set());
            brandTradedMap.get(cd)!.add(brand);
          }
        }
      }

      // 5) 找出未成交的客户
      let items: UnconvertedStoreItem[] = [];

      if (selectedBrands.length <= 1) {
        // 单品牌或无品牌筛选：找出完全没有交易的客户
        for (const p of filteredProfiles) {
          if (!tradedCodes.has(p.customerCode)) {
            items.push({
              customerCode: p.customerCode,
              customerName: p.customerName,
              region: p.region,
              tier: p.tier,
              salesRep: String(p.extras?.['客户经理'] ?? ''),
              extras: p.extras ?? {},
            });
          }
        }
        // 如果选择了1个品牌，添加品牌状态
        if (selectedBrands.length === 1 && items.length > 0) {
          const brand = selectedBrands[0];
          items = items.map((item) => {
            const dealtBrands = brandTradedMap.get(item.customerCode) ?? new Set();
            const brandStatus: Record<string, 0 | 1> = { [brand]: dealtBrands.has(brand) ? 1 : 0 };
            return { ...item, brandStatus };
          });
        }
      } else {
        // 多品牌筛选：找出至少有一个品牌未成交的客户
        for (const p of filteredProfiles) {
          const dealtBrands = brandTradedMap.get(p.customerCode) ?? new Set();
          const brandStatus: Record<string, 0 | 1> = {};
          let hasUnconverted = false;
          for (const brand of selectedBrands) {
            const dealt = dealtBrands.has(brand);
            brandStatus[brand] = dealt ? 1 : 0;
            if (!dealt) hasUnconverted = true;
          }
          if (hasUnconverted) {
            items.push({
              customerCode: p.customerCode,
              customerName: p.customerName,
              region: p.region,
              tier: p.tier,
              salesRep: String(p.extras?.['客户经理'] ?? ''),
              extras: p.extras ?? {},
              brandStatus,
            });
          }
        }
      }

      this.logger.log(`[Memory] Unconverted stores: ${items.length} found (traded codes: ${tradedCodes.size})`);
      return { items, total: items.length };
    } catch (err) {
      this.logger.warn('[Memory] getUnconvertedStoresMemory 失败: ' + (err as Error).message);
      return { items: [], total: 0 };
    }
  }

  async getUnconvertedStores(
    datasetId: string,
    dateFrom: string,
    dateTo: string,
    filters?: HeatmapFilterParams,
  ): Promise<GetUnconvertedStoresResponse> {
    if (this.useMemoryStorage) {
      return this.getUnconvertedStoresMemory(datasetId, dateFrom, dateTo, filters);
    }
    try {
      const whereClause = this.buildProfileWhereClause(filters);
      const fields = await this.getDatasetFields(datasetId);
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);

      // 字段名验证：采样一条数据检查实际 key 是否与元数据匹配
      const unconvertedSample = await this.db.execute(sql.raw(
        "SELECT content FROM data_record WHERE dataset_id = '" + datasetId.replace(/'/g, "''") +
        "' AND content_hash IS NOT NULL LIMIT 1"
      ));
      if (unconvertedSample.length > 0) {
        const ucContent = (unconvertedSample[0] as { content: Record<string, unknown> }).content;
        if (ucContent && typeof ucContent === 'object') {
          const ucKeys = Object.keys(ucContent);
          if (codeField && !ucKeys.includes(codeField)) {
            const fbCode = ucKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
              ?? ucKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
            if (fbCode) { codeField = fbCode; }
          }
          if (dateField && !ucKeys.includes(dateField)) {
            const fbDate = ucKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
              ?? ucKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
            if (fbDate) { dateField = fbDate; }
          }
        }
      }

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const safeDatasetId = datasetId.replace(/'/g, "''");

      const mapRows = (rows: Array<{
        customer_code: string; customer_name: string; region: string;
        tier: string; sales_rep: string; extras: Record<string, unknown>;
      }>): UnconvertedStoreItem[] => rows.map((row) => ({
        customerCode: row.customer_code, customerName: row.customer_name,
        region: row.region, tier: row.tier, salesRep: row.sales_rep, extras: row.extras ?? {},
      }));

      const selectedBrands = filters?.brand?.filter((b: string) => b) ?? [];

      const enrichBrandStatus = async (items: UnconvertedStoreItem[], brands: string[]): Promise<UnconvertedStoreItem[]> => {
        if (items.length === 0 || brands.length === 0) return items;
        const customerCodes = items.map((i) => i.customerCode);
        const codeList = customerCodes.map((c) => "'" + c.replace(/'/g, "''") + "'").join(',');
        const brandList = brands.map((b) => "'" + b.replace(/'/g, "''") + "'").join(',');
        const brandConditions: string[] = [
          "dr.dataset_id = '" + safeDatasetId + "'",
          "dr.content->>'" + safeCodeField + "' IN (" + codeList + ")",
          "dr.content->>'品牌' IN (" + brandList + ")",
          "dr.content->>'" + safeDateField + "' IS NOT NULL",
          "dr.content->>'" + safeDateField + "' != ''",
          "REPLACE(REPLACE(dr.content->>'" + safeDateField + "', '.', '-'), '/', '-') >= '" + dateFrom + "'",
          "REPLACE(REPLACE(dr.content->>'" + safeDateField + "', '.', '-'), '/', '-') <= '" + dateTo + "'",
        ];
        if (filters?.sheetType && filters.sheetType.length > 0) {
          const vals = filters.sheetType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
          brandConditions.push("dr.content->>'_sheetType' IN (" + vals + ")");
        }
        if (filters?.specification && filters.specification.length > 0) {
          const vals = filters.specification.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
          brandConditions.push("dr.content->>'产品-规格' IN (" + vals + ")");
        }
        const dealResult = await this.db.execute(sql.raw(
          "SELECT dr.content->>'" + safeCodeField + "' as customer_code, " +
          "dr.content->>'品牌' as brand, " +
          "COUNT(*) as deal_count " +
          'FROM data_record dr WHERE ' + brandConditions.join(' AND ') + ' ' +
          'GROUP BY customer_code, brand'
        ));
        const dealMap = new Map<string, Set<string>>();
        for (const row of dealResult as unknown as Array<{ customer_code: string; brand: string; deal_count: string }>) {
          const key = row.customer_code;
          if (!dealMap.has(key)) dealMap.set(key, new Set());
          dealMap.get(key)!.add(row.brand);
        }
        return items.map((item) => {
          const brandStatus: Record<string, 0 | 1> = {};
          const dealtBrands = dealMap.get(item.customerCode) ?? new Set();
          for (const brand of brands) brandStatus[brand] = dealtBrands.has(brand) ? 1 : 0;
          return { ...item, brandStatus };
        });
      };

      if (selectedBrands.length <= 1) {
        const notExistsConditions: string[] = [
          `dr.dataset_id = '${safeDatasetId}'`,
          `dr.content->>'${safeCodeField}' = cp.customer_code`,
          `dr.content->>'${safeDateField}' IS NOT NULL`,
          `dr.content->>'${safeDateField}' != ''`,
          `REPLACE(REPLACE(dr.content->>'${safeDateField}', '.', '-'), '/', '-') >= '${dateFrom}'`,
          `REPLACE(REPLACE(dr.content->>'${safeDateField}', '.', '-'), '/', '-') <= '${dateTo}'`,
        ];
        if (selectedBrands.length === 1) {
          const safeBrand = selectedBrands[0].replace(/'/g, "''");
          notExistsConditions.push(`dr.content->>'品牌' = '${safeBrand}'`);
        }
        if (filters?.sheetType && filters.sheetType.length > 0) {
          const vals = filters.sheetType.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
          notExistsConditions.push("dr.content->>'_sheetType' IN (" + vals + ")");
        }
        if (filters?.specification && filters.specification.length > 0) {
          const vals = filters.specification.map((v: string) => "'" + v.replace(/'/g, "''") + "'").join(',');
          notExistsConditions.push("dr.content->>'产品-规格' IN (" + vals + ")");
        }
        const cpWhere = whereClause ? `WHERE ${whereClause} ` : 'WHERE ';
        const result = await this.db.execute(sql.raw(
          'SELECT cp.customer_code, cp.customer_name, cp.region, cp.tier, ' +
          "COALESCE(cp.extras->>'客户经理', '') as sales_rep, " +
          'cp.extras ' +
          'FROM customer_profile cp ' + cpWhere +
          'AND NOT EXISTS (SELECT 1 FROM data_record dr WHERE ' +
          notExistsConditions.join(' AND ') + ')'
        ));
        let items = mapRows(result as unknown as Array<{
          customer_code: string; customer_name: string; region: string; tier: string;
          sales_rep: string; extras: Record<string, unknown>;
        }>);
        if (selectedBrands.length === 1 && items.length > 0) {
          items = await enrichBrandStatus(items, selectedBrands);
        }
        this.logger.log(`Unconverted stores for dataset ${datasetId}: ${items.length} found`);
        return { items, total: items.length };
      }

      const cpWhere = whereClause ? `WHERE ${whereClause}` : '';
      const result = await this.db.execute(sql.raw(
        'SELECT cp.customer_code, cp.customer_name, cp.region, cp.tier, ' +
        "COALESCE(cp.extras->>'客户经理', '') as sales_rep, " +
        'cp.extras ' +
        'FROM customer_profile cp ' + cpWhere
      ));
      let items = mapRows(result as unknown as Array<{
        customer_code: string; customer_name: string; region: string; tier: string;
        sales_rep: string; extras: Record<string, unknown>;
      }>);
      if (items.length > 0) {
        items = await enrichBrandStatus(items, selectedBrands);
        items = items.filter((item) => {
          const status = item.brandStatus ?? {};
          return Object.values(status).some((v) => v === 0);
        });
      }
      this.logger.log(`Unconverted stores for dataset ${datasetId}: ${items.length} found`);
      return { items, total: items.length };
    } catch (err) {
      this.logger.warn('getUnconvertedStores 失败: ' + (err as Error).message);
      return { items: [], total: 0 };
    }
  }

  async getSystemStatus(): Promise<SystemStatusResponse> {
    if (this.useMemoryStorage) {
      return {
        latestCustomerUpdatedAt: null,
        latestDatasetCreatedAt: null,
        latestDatasetName: null,
        totalCustomers: 0,
        totalDatasets: this.datasetStore.size,
        status: 'ok',
        storageMode: 'memory',
      } as SystemStatusResponse;
    }
    try {
      const [customerResult] = await this.db
        .select({
          latestUpdatedAt: sql<string>`MAX(${customerProfile.updatedAt})`,
          totalCount: count(),
        })
        .from(customerProfile);
      const [datasetResult] = await this.db
        .select({
          latestCreatedAt: sql<string>`MAX(${dataset.createdAt})`,
          totalCount: count(),
        })
        .from(dataset);
      let latestDatasetName: string | null = null;
      if (datasetResult?.latestCreatedAt) {
        const latestDsList = await this.db
          .select({ name: dataset.name })
          .from(dataset)
          .orderBy(desc(dataset.createdAt))
          .limit(1);
        if (latestDsList.length > 0) latestDatasetName = latestDsList[0].name ?? null;
      }
      const customerCount = Number(customerResult?.totalCount ?? 0);
      const datasetCount = Number(datasetResult?.totalCount ?? 0);
      return {
        latestCustomerUpdatedAt: customerResult?.latestUpdatedAt ? String(customerResult.latestUpdatedAt) : null,
        latestDatasetCreatedAt: datasetResult?.latestCreatedAt ? String(datasetResult.latestCreatedAt) : null,
        latestDatasetName,
        totalCustomers: isNaN(customerCount) ? 0 : customerCount,
        totalDatasets: isNaN(datasetCount) ? 0 : datasetCount,
      };
    } catch (err) {
      this.logger.warn(`getSystemStatus 失败: ${(err as Error).message}`);
      return {
        latestCustomerUpdatedAt: null,
        latestDatasetCreatedAt: null,
        latestDatasetName: null,
        totalCustomers: 0,
        totalDatasets: 0,
        status: 'error: ' + (err as Error).message,
        storageMode: 'database',
      } as SystemStatusResponse;
    }
  }

  /** 内存存储模式下的业代下钻数据计算 */
  private async getSalesRepDrilldownMemory(
    datasetId: string,
    salesRep: string,
    region: string,
    tier: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<SalesRepDrilldownResponse> {
    try {
      // 1) 获取该业代负责的所有客户及其形态
      const allProfiles = this.customerProfileService.getAllProfiles();
      const customerFormatMap = new Map<string, string>();
      const formatCountMap = new Map<string, number>();
      const allCustomerCodes: string[] = [];

      for (const p of allProfiles) {
        if (p.extras?.['客户经理'] !== salesRep) continue;
        if (p.region !== region) continue;
        if (p.tier !== tier) continue;

        const dealerType = String(p.extras?.['经销商类型'] ?? '');
        const simpleType = DEALER_TYPE_TO_FORMAT[dealerType] ?? (dealerType || '其他');
        customerFormatMap.set(p.customerCode, simpleType);
        formatCountMap.set(simpleType, (formatCountMap.get(simpleType) ?? 0) + 1);
        allCustomerCodes.push(p.customerCode);
      }

      const totalStores = allCustomerCodes.length;
      if (totalStores === 0) {
        return { formatBreakdown: [], brandBreakdown: [], specificationBreakdown: [] };
      }

      // 2) 获取数据集记录
      const memDataset = this.datasetStore.get(datasetId);
      if (!memDataset || memDataset.records.length === 0) {
        const formatTypes = Array.from(formatCountMap.keys()).sort();
        const formatBreakdown = formatTypes.map((ft) => ({
          formatType: ft,
          totalStores: formatCountMap.get(ft) ?? 0,
          dealtStores: 0,
          dealRate: 0,
        }));
        return { formatBreakdown, brandBreakdown: [], specificationBreakdown: [] };
      }

      const fields = memDataset.fields;
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);
      const brandField = this.findBrandField(fields);
      const specField = this.findSpecificationField(fields);

      // 采样验证字段名
      if (memDataset.records.length > 0) {
        const sampleKeys = Object.keys(memDataset.records[0] ?? {});
        if (codeField && !sampleKeys.includes(codeField)) {
          const fallbackCode = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
          if (fallbackCode) { codeField = fallbackCode; }
        }
        if (dateField && !sampleKeys.includes(dateField)) {
          const fallbackDate = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
            ?? sampleKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
          if (fallbackDate) { dateField = fallbackDate; }
        }
        if (brandField && !sampleKeys.includes(brandField)) {
          const fallbackBrand = sampleKeys.find((k: string) => /品牌|brand/i.test(k.toLowerCase()));
          if (fallbackBrand) { /* brandField 已在 fields 中查找，这里只是验证 */ }
        }
        if (specField && !sampleKeys.includes(specField)) {
          const fallbackSpec = sampleKeys.find((k: string) => /规格|specification/i.test(k.toLowerCase()));
          if (fallbackSpec) { /* specField 已在 fields 中查找，这里只是验证 */ }
        }
      }

      this.logger.log(`[Memory] Drilldown 字段映射: codeField=${codeField}, dateField=${dateField}, brandField=${brandField}, specField=${specField}`);

      // 3) 解析日期范围
      const parseDate = (dateStr: string): { y: number; m: number; d: number } | null => {
        const normalized = String(dateStr ?? '').replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10); const m = parseInt(parts[1], 10); const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return { y, m, d };
      };

      // 4) 遍历交易记录，计算形态别、品牌别和规格别成交数据
      const customerSet = new Set(allCustomerCodes);
      const formatDealtMap = new Map<string, Set<string>>();
      const brandDealtMap = new Map<string, Set<string>>();
      const specDealtMap = new Map<string, Set<string>>();
      const brandSet = new Set<string>();
      const specSet = new Set<string>();
      const seenHashes = new Set<string>();

      for (const record of memDataset.records) {
        if (!record || typeof record !== 'object') continue;
        const cd = String(record[codeField ?? ''] ?? '').trim();
        const dd = String(record[dateField ?? ''] ?? '').trim();
        if (!cd || !dd) continue;

        // contentHash 去重
        const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        // 只处理该业代的客户
        if (!customerSet.has(cd)) continue;

        // 日期范围过滤
        const parsed = parseDate(dd);
        if (!parsed) continue;
        const normalizedDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        if (normalizedDate < dateFrom || normalizedDate > dateTo) continue;

        // 形态别成交
        const fmt = customerFormatMap.get(cd);
        if (fmt) {
          if (!formatDealtMap.has(fmt)) formatDealtMap.set(fmt, new Set());
          formatDealtMap.get(fmt)!.add(cd);
        }

        // 品牌别成交
        const brand = brandField ? String(record[brandField] ?? '').trim() : '';
        if (brand) {
          brandSet.add(brand);
          if (!brandDealtMap.has(brand)) brandDealtMap.set(brand, new Set());
          brandDealtMap.get(brand)!.add(cd);
        }

        // 规格别成交
        const spec = specField ? String(record[specField] ?? '').trim() : '';
        if (spec) {
          specSet.add(spec);
          if (!specDealtMap.has(spec)) specDealtMap.set(spec, new Set());
          specDealtMap.get(spec)!.add(cd);
        }
      }

      // 5) 构建返回结果
      const formatTypes = Array.from(formatCountMap.keys()).sort();
      const formatBreakdown = formatTypes.map((ft) => {
        const total = formatCountMap.get(ft) ?? 0;
        const dealt = formatDealtMap.get(ft)?.size ?? 0;
        return {
          formatType: ft,
          totalStores: total,
          dealtStores: dealt,
          dealRate: total > 0 ? Math.round(dealt / total * 1000) / 10 : 0,
        };
      });

      const brands = Array.from(brandSet).sort();
      const brandBreakdown = brands.map((b) => {
        const dealt = brandDealtMap.get(b)?.size ?? 0;
        return {
          brand: b,
          totalStores,
          dealtStores: dealt,
          dealRate: totalStores > 0 ? Math.round(dealt / totalStores * 1000) / 10 : 0,
        };
      });

      const specifications = Array.from(specSet).sort();
      const specificationBreakdown = specifications.map((s) => {
        const dealt = specDealtMap.get(s)?.size ?? 0;
        return {
          specification: s,
          totalStores,
          dealtStores: dealt,
          dealRate: totalStores > 0 ? Math.round(dealt / totalStores * 1000) / 10 : 0,
        };
      });

      this.logger.log(`[Memory] Drilldown: ${salesRep}/${region}/${tier}, ${totalStores} customers, ${formatBreakdown.length} formats, ${brandBreakdown.length} brands, ${specificationBreakdown.length} specs`);
      return { formatBreakdown, brandBreakdown, specificationBreakdown };
    } catch (err) {
      this.logger.warn('[Memory] getSalesRepDrilldownMemory 失败: ' + (err as Error).message);
      return { formatBreakdown: [], brandBreakdown: [], specificationBreakdown: [] };
    }
  }

  async getSalesRepDrilldown(
    datasetId: string,
    salesRep: string,
    region: string,
    tier: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<SalesRepDrilldownResponse> {
    if (this.useMemoryStorage) {
      return this.getSalesRepDrilldownMemory(datasetId, salesRep, region, tier, dateFrom, dateTo);
    }
    try {
      const safeDatasetId = datasetId.replace(/'/g, "''");
      const safeSalesRep = salesRep.replace(/'/g, "''");
      const safeRegion = region.replace(/'/g, "''");
      const safeTier = tier.replace(/'/g, "''");
      const profileWhere = [
        "extras->>'客户经理' = '" + safeSalesRep + "'",
        "region = '" + safeRegion + "'",
        "tier = '" + safeTier + "'",
      ].join(' AND ');
      const profileResult = await this.db.execute(sql.raw(
        'SELECT customer_code, COALESCE(extras->>\'经销商类型\', \'\') as dealer_type ' +
        'FROM customer_profile WHERE ' + profileWhere
      ));
      const customerFormatMap = new Map<string, string>();
      const formatCountMap = new Map<string, number>();
      const allCustomerCodes: string[] = [];
      for (const row of profileResult as unknown as Array<{ customer_code: string; dealer_type: string }>) {
        const simpleType = DEALER_TYPE_TO_FORMAT[row.dealer_type] ?? (row.dealer_type || '其他');
        customerFormatMap.set(row.customer_code, simpleType);
        formatCountMap.set(simpleType, (formatCountMap.get(simpleType) ?? 0) + 1);
        allCustomerCodes.push(row.customer_code);
      }
      const totalStores = allCustomerCodes.length;
      if (totalStores === 0) {
        return { formatBreakdown: [], brandBreakdown: [], specificationBreakdown: [] };
      }
      const fields = await this.getDatasetFields(datasetId);
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);

      // 字段名验证
      const drilldownSample = await this.db.execute(sql.raw(
        "SELECT content FROM data_record WHERE dataset_id = '" + safeDatasetId +
        "' AND content_hash IS NOT NULL LIMIT 1"
      ));
      if (drilldownSample.length > 0) {
        const ddContent = (drilldownSample[0] as { content: Record<string, unknown> }).content;
        if (ddContent && typeof ddContent === 'object') {
          const ddKeys = Object.keys(ddContent);
          if (codeField && !ddKeys.includes(codeField)) {
            const fbCode = ddKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
              ?? ddKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
            if (fbCode) { codeField = fbCode; }
          }
          if (dateField && !ddKeys.includes(dateField)) {
            const fbDate = ddKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
              ?? ddKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
            if (fbDate) { dateField = fbDate; }
          }
        }
      }

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");
      const dedupedSql =
        'WITH deduped AS (' +
        ' SELECT DISTINCT ON (content_hash)' +
        " content->>'" + safeCodeField + "' as customer_code," +
        " content->>'" + safeDateField + "' as trans_date," +
        " COALESCE(content->>'品牌', '') as brand," +
        " COALESCE(content->>'产品-规格', '') as specification" +
        ' FROM data_record WHERE dataset_id = \'' + safeDatasetId + '\' ' +
        " AND content->>'" + safeDateField + "' IS NOT NULL" +
        " AND content->>'" + safeDateField + "' != ''" +
        " AND REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') >= '" + dateFrom + "'" +
        " AND REPLACE(REPLACE(content->>'" + safeDateField + "', '.', '-'), '/', '-') <= '" + dateTo + "'" +
        ' AND content_hash IS NOT NULL' +
        ' ORDER BY content_hash, _created_at' +
        ') SELECT customer_code, trans_date, brand, specification FROM deduped';
      const transResult = await this.db.execute(sql.raw(dedupedSql));
      const formatDealtMap = new Map<string, Set<string>>();
      const brandDealtMap = new Map<string, Set<string>>();
      const specDealtMap = new Map<string, Set<string>>();
      const brandSet = new Set<string>();
      const specSet = new Set<string>();
      for (const row of transResult as unknown as Array<{ customer_code: string; trans_date: string; brand: string; specification: string }>) {
        const fmt = customerFormatMap.get(row.customer_code);
        if (!fmt) continue;
        if (!formatDealtMap.has(fmt)) formatDealtMap.set(fmt, new Set());
        formatDealtMap.get(fmt)!.add(row.customer_code);
        if (row.brand) {
          brandSet.add(row.brand);
          if (!brandDealtMap.has(row.brand)) brandDealtMap.set(row.brand, new Set());
          brandDealtMap.get(row.brand)!.add(row.customer_code);
        }
        if (row.specification) {
          specSet.add(row.specification);
          if (!specDealtMap.has(row.specification)) specDealtMap.set(row.specification, new Set());
          specDealtMap.get(row.specification)!.add(row.customer_code);
        }
      }
      const formatTypes = Array.from(formatCountMap.keys()).sort();
      const formatBreakdown = formatTypes.map((ft) => {
        const total = formatCountMap.get(ft) ?? 0;
        const dealt = formatDealtMap.get(ft)?.size ?? 0;
        return { formatType: ft, totalStores: total, dealtStores: dealt, dealRate: total > 0 ? Math.round(dealt / total * 1000) / 10 : 0 };
      });
      const brands = Array.from(brandSet).sort();
      const brandBreakdown = brands.map((b) => {
        const dealt = brandDealtMap.get(b)?.size ?? 0;
        return { brand: b, totalStores, dealtStores: dealt, dealRate: totalStores > 0 ? Math.round(dealt / totalStores * 1000) / 10 : 0 };
      });
      const specifications = Array.from(specSet).sort();
      const specificationBreakdown = specifications.map((s) => {
        const dealt = specDealtMap.get(s)?.size ?? 0;
        return { specification: s, totalStores, dealtStores: dealt, dealRate: totalStores > 0 ? Math.round(dealt / totalStores * 1000) / 10 : 0 };
      });
      return { formatBreakdown, brandBreakdown, specificationBreakdown };
    } catch (err) {
      this.logger.warn('getSalesRepDrilldown 失败: ' + (err as Error).message);
      this.useMemoryStorage = true;
      return { formatBreakdown: [], brandBreakdown: [], specificationBreakdown: [] };
    }
  }

  async cleanupDuplicates(datasetId: string): Promise<{ removed: number }> {
    if (this.useMemoryStorage) {
      return { removed: 0 };
    }
    try {
      const batchSize = 5000;
      let totalRemoved = 0;
      let hasMore = true;
      while (hasMore) {
        const dupIds = await this.db.execute(sql`
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY content_hash ORDER BY _created_at) as rn
            FROM ${dataRecord}
            WHERE ${eq(dataRecord.datasetId, datasetId)}
          ) sub WHERE rn > 1 LIMIT ${batchSize}
        `);
        const idsToDelete = (dupIds as unknown as Array<{ id: string }>).map((r) => r.id);
        if (idsToDelete.length === 0) {
          hasMore = false;
          break;
        }
        for (let i = 0; i < idsToDelete.length; i += 500) {
          const batch = idsToDelete.slice(i, i + 500);
          await this.db.delete(dataRecord).where(
            sql`${dataRecord.id} IN (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})`
          );
        }
        totalRemoved += idsToDelete.length;
        if (idsToDelete.length < batchSize) hasMore = false;
      }
      if (totalRemoved > 0) {
        const remaining = await this.db
          .select({ cnt: count() })
          .from(dataRecord)
          .where(eq(dataRecord.datasetId, datasetId));
        const newCount = Number(remaining[0]?.cnt ?? 0);
        await this.db
          .update(dataset)
          .set({ rowCount: newCount, updatedAt: new Date() })
          .where(eq(dataset.id, datasetId));
        this.logger.log(`Cleaned up ${totalRemoved} duplicate records for dataset ${datasetId}, new count: ${newCount}`);
      }
      return { removed: totalRemoved };
    } catch (err) {
      this.logger.warn(`cleanupDuplicates 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { removed: 0 };
    }
  }

  async getSpecOptions(
    datasetId: string,
    sheetTypes?: string[],
    brands?: string[],
  ): Promise<DatasetSpecOptions> {
    if (this.useMemoryStorage) {
      const d = this.datasetStore.get(datasetId);
      if (!d || d.records.length === 0) return { brands: [], specifications: [], pairs: [] };
      const brandSet = new Set<string>();
      const specSet = new Set<string>();
      const pairs: Array<{ brand: string; specification: string }> = [];
      for (const r of d.records) {
        if (!r || typeof r !== 'object') continue;
        // sheetType 过滤（品牌和规格都受此过滤）
        if (sheetTypes && sheetTypes.length > 0) {
          const st = String(r['_sheetType'] ?? '');
          if (!sheetTypes.includes(st)) continue;
        }
        const b = String(r['品牌'] ?? '').trim();
        const s = String(r['产品-规格'] ?? '').trim();
        if (b) brandSet.add(b);
        if (b && s) pairs.push({ brand: b, specification: s });
        // 规格集合：额外受品牌过滤（级联筛选）
        if (brands && brands.length > 0 && !brands.includes(b)) continue;
        if (s) specSet.add(s);
      }
      return {
        brands: Array.from(brandSet).sort(),
        specifications: Array.from(specSet).sort(),
        pairs,
      };
    }
    try {
      const safeDatasetId = datasetId.replace(/'/g, "''");
      const baseConditions: string[] = [
        `dataset_id = '${safeDatasetId}'`,
        `content_hash IS NOT NULL`,
      ];
      if (sheetTypes && sheetTypes.length > 0) {
        const vals = sheetTypes.map((v) => "'" + v.replace(/'/g, "''") + "'").join(',');
        baseConditions.push("content->>'_sheetType' IN (" + vals + ")");
      }
      const baseWhere = baseConditions.join(' AND ');
      // 品牌选项：仅受 sheetType 过滤，始终返回全部品牌
      const brandWhere = baseWhere + " AND content->>'品牌' IS NOT NULL AND content->>'品牌' != ''";
      // 规格选项：受 sheetType + 品牌过滤（级联）
      const specConditions = [...baseConditions];
      if (brands && brands.length > 0) {
        const vals = brands.map((v) => "'" + v.replace(/'/g, "''") + "'").join(',');
        specConditions.push("content->>'品牌' IN (" + vals + ")");
      }
      const specWhere = specConditions.join(' AND ') + " AND content->>'产品-规格' IS NOT NULL AND content->>'产品-规格' != ''";
      // 品牌-规格映射对：仅受 sheetType 过滤，用于前端双向联动
      const pairWhere = baseWhere + " AND content->>'品牌' IS NOT NULL AND content->>'品牌' != '' AND content->>'产品-规格' IS NOT NULL AND content->>'产品-规格' != ''";
      const [brandResult, specResult, pairResult] = await Promise.all([
        this.db.execute(sql.raw(`SELECT DISTINCT content->>'品牌' as val FROM data_record WHERE ${brandWhere} ORDER BY 1`)),
        this.db.execute(sql.raw(`SELECT DISTINCT content->>'产品-规格' as val FROM data_record WHERE ${specWhere} ORDER BY 1`)),
        this.db.execute(sql.raw(`SELECT DISTINCT content->>'品牌' as brand, content->>'产品-规格' as specification FROM data_record WHERE ${pairWhere}`)),
      ]);
      return {
        brands: (brandResult as unknown as Array<{ val: string }>).map((r) => r.val).filter(Boolean),
        specifications: (specResult as unknown as Array<{ val: string }>).map((r) => r.val).filter(Boolean),
        pairs: (pairResult as unknown as Array<{ brand: string; specification: string }>).filter((r) => r.brand && r.specification),
      };
    } catch (err) {
      this.logger.warn(`getSpecOptions 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { brands: [], specifications: [], pairs: [] };
    }
  }

  async getAllBrandSpecOptions(): Promise<{ brands: string[]; specifications: string[] }> {
    if (this.useMemoryStorage) {
      const d = DatasetService.getLatestMemoryDataset();
      if (!d || d.records.length === 0) return { brands: [], specifications: [] };
      const brandSet = new Set<string>();
      const specSet = new Set<string>();
      for (const r of d.records) {
        if (!r || typeof r !== 'object') continue;
        const b = String(r['品牌'] ?? '').trim();
        const s = String(r['产品-规格'] ?? '').trim();
        if (b) brandSet.add(b);
        if (s) specSet.add(s);
      }
      return { brands: Array.from(brandSet).sort(), specifications: Array.from(specSet).sort() };
    }
    try {
      const [brandResult, specResult] = await Promise.all([
        this.db.execute(sql.raw(`SELECT DISTINCT content->>'品牌' as val FROM data_record WHERE content->>'品牌' IS NOT NULL AND content->>'品牌' != '' ORDER BY 1`)),
        this.db.execute(sql.raw(`SELECT DISTINCT content->>'产品-规格' as val FROM data_record WHERE content->>'产品-规格' IS NOT NULL AND content->>'产品-规格' != '' ORDER BY 1`)),
      ]);
      return {
        brands: (brandResult as unknown as Array<{ val: string }>).map((r) => r.val).filter(Boolean),
        specifications: (specResult as unknown as Array<{ val: string }>).map((r) => r.val).filter(Boolean),
      };
    } catch (err) {
      this.logger.warn(`getAllBrandSpecOptions 失败: ${(err as Error).message}`);
      return { brands: [], specifications: [] };
    }
  }

  /**
   * 计算指定区域近6个月各形态别的成交率
   * 与成交分析（热力图）模块保持完全一致的计算逻辑：
   * - 客户编码字段动态查找
   * - 日期字段动态查找  
   * - 统一的日期解析
   * - content hash 去重
   * @param region 区域名称
   * @param formatTypes 形态类型列表（用于对齐表头）
   * @param totalByFormat 各形态别的总门店数（key=形态名, value=门店数）
   * @param tier 层级，默认 '一阶'
   */
  async computeMonthlyFormatDealRates(
    region: string,
    formatTypes: string[],
    totalByFormat: Map<string, number>,
    tier: string = '一阶',
  ): Promise<FormatDrilldownMonthlyRate[]> {
    try {
      const now = new Date();
      // 构造近6个月的月份列表：包含当前月往前推5个月
      const monthList: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      // 从客户资料构建客户编码→形态映射（只取指定区域和层级）
      const allProfiles = await this.customerProfileService.findAllUnpaginated();
      const customerFormatMap = new Map<string, string>();
      for (const p of allProfiles) {
        if (p.region !== region) continue;
        if (tier && p.tier !== tier) continue;
        const dealerType = String(p.extras?.['经销商类型'] ?? '');
        const fmt = DEALER_TYPE_TO_FORMAT[dealerType] ?? (dealerType || '其他');
        customerFormatMap.set(p.customerCode, fmt);
      }
      this.logger.log(`[computeMonthlyFormatDealRates] region=${region}, 匹配客户=${customerFormatMap.size}, 形态=${formatTypes.join(',')}`);

      if (this.useMemoryStorage) {
        // ====== 内存模式：与热力图 getHeatmapDataMemory 完全一致的逻辑 ======
        const memDataset = DatasetService.getLatestMemoryDataset();
        if (memDataset && memDataset.records.length > 0) {
          const fields = memDataset.fields;
          let codeField = this.findCustomerCodeField(fields);
          let dateField = this.findDateField(fields);

          // 采样验证字段名 —— 与热力图保持完全一致
          if (memDataset.records.length > 0) {
            const sampleKeys = Object.keys(memDataset.records[0] ?? {});
            if (codeField && !sampleKeys.includes(codeField)) {
              const fallbackCode = sampleKeys.find((k: string) => /客户.*编码|customer.*code|编码/i.test(k.toLowerCase()))
                ?? sampleKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
              if (fallbackCode) { codeField = fallbackCode; }
            }
            if (dateField && !sampleKeys.includes(dateField)) {
              const fallbackDate = sampleKeys.find((k: string) => /日期|date|时间/i.test(k.toLowerCase()))
                ?? sampleKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
              if (fallbackDate) { dateField = fallbackDate; }
            }
          }
          this.logger.log(`[computeMonthlyFormatDealRates] 内存模式: codeField=${codeField}, dateField=${dateField}`);

          // 解析并累计每月各形态的成交客户
          const seenHashes = new Set<string>();
          const monthlyDealt = new Map<string, Map<string, Set<string>>>();
          for (const m of monthList) monthlyDealt.set(m, new Map());

          for (const record of memDataset.records) {
            if (!record || typeof record !== 'object') continue;
            const cd = String(record[codeField ?? ''] ?? '').trim();
            const dd = String(record[dateField ?? ''] ?? '').trim();
            if (!cd || !dd) continue;

            // content hash 去重
            const hash = createHash('md5').update(JSON.stringify(record)).digest('hex');
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);

            // 只处理该区域的客户
            const fmt = customerFormatMap.get(cd);
            if (!fmt) continue;

            // 日期解析：与热力图保持一致
            const normalized = dd.replace(/[./]/g, '-');
            const parts = normalized.split('-');
            if (parts.length < 3) continue;
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            if (isNaN(year) || isNaN(month)) continue;
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;

            // 只处理近6个月
            if (!monthlyDealt.has(monthKey)) continue;

            const monthMap = monthlyDealt.get(monthKey)!;
            if (!monthMap.has(fmt)) monthMap.set(fmt, new Set());
            monthMap.get(fmt)!.add(cd);
          }

          // 计算成交率
          return this._buildMonthlyRatesFromDealt(monthlyDealt, monthList, formatTypes, totalByFormat);
        }
        this.logger.log('[computeMonthlyFormatDealRates] 内存模式：无数据集记录，尝试DB降级');
        // 内存无数据时，落入DB模式作为降级
      }

      // ====== DB 模式：与热力图 getHeatmapData 保持完全一致的逻辑 ======
      // 获取最新数据集
      const dsResult = await this.db
        .select({ id: dataset.id })
        .from(dataset)
        .orderBy(desc(dataset.createdAt))
        .limit(1);
      const dsId = dsResult[0]?.id;
      if (!dsId) {
        this.logger.log('[computeMonthlyFormatDealRates] DB模式：无数据集');
        return this._buildEmptyMonthlyRates(monthList, formatTypes);
      }

      // 获取数据集字段（与热力图保持一致的字段查找）
      const fields = await this.getDatasetFields(String(dsId));
      let codeField = this.findCustomerCodeField(fields);
      let dateField = this.findDateField(fields);

      // 验证字段（与热力图完全一致的采样验证）
      const sampleResult = await this.db.execute(sql.raw(
        `SELECT content FROM data_record WHERE dataset_id = '${String(dsId).replace(/'/g, "''")}' AND content_hash IS NOT NULL LIMIT 1`
      ));
      if (sampleResult.length > 0) {
        const sampleContent = (sampleResult[0] as { content: Record<string, unknown> }).content;
        if (sampleContent && typeof sampleContent === 'object') {
          const dataKeys = Object.keys(sampleContent);
          if (codeField && !dataKeys.includes(codeField)) {
            const fallbackCode = dataKeys.find((k: string) => {
              const lower = k.toLowerCase();
              return /客户.*编码|customer.*code|编码/i.test(lower);
            }) ?? dataKeys.find((k: string) => /编码|code/i.test(k.toLowerCase()));
            if (fallbackCode) { this.logger.warn(`字段名修正: codeField '${codeField}' → '${fallbackCode}'`); codeField = fallbackCode; }
          }
          if (dateField && !dataKeys.includes(dateField)) {
            const fallbackDate = dataKeys.find((k: string) => {
              const lower = k.toLowerCase();
              return /日期|date|时间/i.test(lower);
            }) ?? dataKeys.find((k: string) => /date|日期/i.test(k.toLowerCase()));
            if (fallbackDate) { this.logger.warn(`字段名修正: dateField '${dateField}' → '${fallbackDate}'`); dateField = fallbackDate; }
          }
        }
      }
      this.logger.log(`[computeMonthlyFormatDealRates] DB模式: dsId=${dsId}, codeField=${codeField}, dateField=${dateField}`);

      const safeCodeField = (codeField ?? '客户-通路客户编码').replace(/'/g, "''");
      const safeDateField = (dateField ?? '订单-订单日期').replace(/'/g, "''");

      // 查询所有交易记录（带 content hash 去重）
      const transResult = await this.db.execute(sql.raw(
        `SELECT DISTINCT ON (content_hash) content->>'${safeCodeField}' as customer_code, content->>'${safeDateField}' as trans_date ` +
        `FROM data_record WHERE dataset_id = '${String(dsId).replace(/'/g, "''")}' ` +
        `AND content_hash IS NOT NULL ORDER BY content_hash`
      ));

      const monthlyDealt = new Map<string, Map<string, Set<string>>>();
      for (const m of monthList) monthlyDealt.set(m, new Map());

      for (const row of transResult as unknown as Array<{ customer_code: string; trans_date: string }>) {
        const cd = row.customer_code?.trim() || '';
        const dd = row.trans_date?.trim() || '';
        if (!cd || !dd) continue;

        const fmt = customerFormatMap.get(cd);
        if (!fmt) continue;

        // 日期解析
        const normalized = dd.replace(/[./]/g, '-');
        const parts = normalized.split('-');
        if (parts.length < 3) continue;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (isNaN(year) || isNaN(month)) continue;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (!monthlyDealt.has(monthKey)) continue;

        const monthMap = monthlyDealt.get(monthKey)!;
        if (!monthMap.has(fmt)) monthMap.set(fmt, new Set());
        monthMap.get(fmt)!.add(cd);
      }

      // 计算成交率
      return this._buildMonthlyRatesFromDealt(monthlyDealt, monthList, formatTypes, totalByFormat);
    } catch (err) {
      this.logger.warn(`[computeMonthlyFormatDealRates] 失败: ${(err as Error).message}`);
      this.logger.warn((err as Error).stack);
      return [];
    }
  }

  /** 内部辅助：构造空的月度成交率（当无可用数据时返回） */
  private _buildEmptyMonthlyRates(
    monthList: string[],
    formatTypes: string[],
  ): FormatDrilldownMonthlyRate[] {
    return monthList.map((month) => {
      const rates: Record<string, number> = {};
      for (const ft of formatTypes) rates[ft] = 0;
      return { month, rates };
    });
  }

  /** 内部辅助：根据 monthlyDealt 中累计的成交客户，计算各月各形态的成交率 */
  private _buildMonthlyRatesFromDealt(
    monthlyDealt: Map<string, Map<string, Set<string>>>,
    monthList: string[],
    formatTypes: string[],
    totalByFormat: Map<string, number>,
  ): FormatDrilldownMonthlyRate[] {
    return monthList.map((month) => {
      const monthMap = monthlyDealt.get(month);
      const rates: Record<string, number> = {};
      for (const ft of formatTypes) {
        const total = totalByFormat.get(ft) ?? 0;
        const dealt = monthMap?.get(ft)?.size ?? 0;
        rates[ft] = total > 0 ? Math.round(dealt / total * 1000) / 10 : 0;
      }
      return { month, rates };
    });
  }

  /** 获取 ATP 绩效可用的月份列表（来自费用资料「客户销额」工作表） */
  async getAtpAvailableMonths(): Promise<AtpAvailableMonthsResponse> {
    const expenses = await this.expenseProfileService.findAllUnpaginated();
    const monthSet = new Set<string>();
    let salesCount = 0;

    for (const e of expenses) {
      if (String(e.sheetType ?? '').trim() !== '客户销额') continue;
      salesCount++;
      for (const [key, value] of Object.entries(e.extras)) {
        const parsedKey = this.parseAtpMonthStrict(key);
        if (parsedKey) monthSet.add(parsedKey);

        const strValue = String(value ?? '').trim();
        // 仅当字段名看起来是月份字段，或值明显为中文月份时，才解析值
        if (this.isMonthLikeKey(key) || /^\d{1,2}月\s*\d{4}$/.test(strValue)) {
          const parsedValue = this.parseAtpMonthStrict(strValue);
          if (parsedValue) monthSet.add(parsedValue);
        }
      }
    }

    const months = Array.from(monthSet).sort();
    this.logger.log(`ATP 可用月份: 客户销额记录=${salesCount}, 提取到月份=[${months.join(', ')}]`);
    return { months };
  }

  private isMonthLikeKey(key: string): boolean {
    const lower = String(key ?? '').toLowerCase();
    const keywords = ['月', '时间', '期间', 'yearmonth', 'month', 'period'];
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  private parseAtpMonthStrict(value: string): string | null {
    const s = String(value ?? '').trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    m = s.match(/^(\d{4})\/(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    m = s.match(/^(\d{4})年(\d{1,2})月$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    m = s.match(/^(\d{1,2})月\s*(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

    // 从完整日期字符串中提取年月
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    return null;
  }

  /** ATP 绩效：以客户资料 + 费用资料（客户销额）按客户编码关联汇总 */
  async getAtpPerformance(
    dateFrom: string,
    dateTo: string,
    _granularity: TimeGranularity,
    filters?: HeatmapFilterParams,
    thresholds?: AtpThresholdParams,
  ): Promise<AtpPerformanceResponse> {
    const [customers, expenses] = await Promise.all([
      this.customerProfileService.findAllUnpaginated(),
      this.expenseProfileService.findAllUnpaginated(),
    ]);

    // 自定义分档参数（缺省用系统默认值）
    const feeLe10Threshold = thresholds?.feeLe10 ?? 0.1;
    const feeGt15Threshold = thresholds?.feeGt15 ?? 0.15;
    const salesLt1000Threshold = thresholds?.salesLt1000 ?? 1000;
    const salesLt2000Threshold = thresholds?.salesLt2000 ?? 2000;

    // 按所选月份范围过滤费用资料
    const startYm = String(dateFrom ?? '').slice(0, 7);
    const endYm = String(dateTo ?? '').slice(0, 7);
    const selectedMonthCount = this.countMonths(startYm, endYm);

    // 1. 构建客户编码 -> 门店销额 映射（仅取 sheetType 为「客户销额」且在月份范围内的记录）
    const salesMap = new Map<string, { totalSales: number }>();
    for (const e of expenses) {
      if (String(e.sheetType ?? '').trim() !== '客户销额') continue;

      const monthValue = String(e.extras['时间-年/月'] ?? '').trim();
      const recordYm = monthValue ? this.parseAtpMonthStrict(monthValue) : null;
      if (recordYm && (recordYm < startYm || recordYm > endYm)) continue;

      const code = this.normalizeAtpCustomerCode(String(e.customerCode ?? '').trim());
      if (!code) continue;
      const sales = this.parseNumeric(
        e.extras['回单金额'] ?? e.extras['客户销额'] ?? e.extras['门店销额'] ?? e.extras['销额'] ?? 0,
      );
      const cur = salesMap.get(code) ?? { totalSales: 0 };
      cur.totalSales += sales;
      salesMap.set(code, cur);
    }

    // 2. 按（所别、阶层、业代）分组聚合
    const groupMap = new Map<string, AtpPerformanceRow>();
    for (const c of customers) {
      const code = this.normalizeAtpCustomerCode(String(c.customerCode ?? '').trim());
      const region = String(c.region ?? '').trim();
      const tier = String(c.tier ?? '').trim();
      const salesRep = String(c.extras['客户经理'] ?? c.extras['业代'] ?? '').trim();
      if (!region || !tier || !salesRep) continue;

      const totalPoints = this.parseNumeric(c.extras['总点数'] ?? 1);
      const paidAmount = this.parseNumeric(c.extras['付费金额'] ?? 0);
      const paidPoints = this.parseNumeric(c.extras['付费点数'] ?? (paidAmount > 0 ? 1 : 0));
      const storeSales = salesMap.get(code)?.totalSales ?? 0;
      const paidStoreSales = paidAmount > 0 ? storeSales : 0;

      // 单门店费比分档统计
      let feeLe10 = 0;
      let fee10to15 = 0;
      let feeGt15 = 0;
      let feeNoDeal = 0;
      let salesLt1000 = 0;
      let salesLt2000 = 0;
      if (paidAmount > 0) {
        if (storeSales <= 0) {
          feeNoDeal = 1;
        } else {
          const storeFeeRatio = (paidAmount * selectedMonthCount) / storeSales;
          if (storeFeeRatio <= feeLe10Threshold) feeLe10 = 1;
          else if (storeFeeRatio <= feeGt15Threshold) fee10to15 = 1;
          else feeGt15 = 1;
        }
        if (storeSales < salesLt1000Threshold) salesLt1000 = 1;
        if (storeSales < salesLt2000Threshold) salesLt2000 = 1;
      }

      const key = `${region}||${tier}||${salesRep}`;
      const row = groupMap.get(key) ?? {
        region,
        tier,
        salesRep,
        totalPoints: 0,
        paidPoints: 0,
        paidAmount: 0,
        totalStoreSales: 0,
        paidStoreSales: 0,
        paidPointFeeRatio: 0,
        paidPointSalesRatio: 0,
        feeRatioLe10: 0,
        feeRatio10to15: 0,
        feeRatioGt15: 0,
        feeRatioNoDeal: 0,
        feeRatioLe10Ratio: 0,
        feeRatio10to15Ratio: 0,
        feeRatioGt15Ratio: 0,
        feeRatioNoDealRatio: 0,
        salesLt1000Count: 0,
        salesLt2000Count: 0,
      };
      row.totalPoints += totalPoints;
      row.paidPoints += paidPoints;
      row.paidAmount += paidAmount;
      row.totalStoreSales += storeSales;
      row.paidStoreSales += paidStoreSales;
      row.feeRatioLe10 += feeLe10;
      row.feeRatio10to15 += fee10to15;
      row.feeRatioGt15 += feeGt15;
      row.feeRatioNoDeal += feeNoDeal;
      row.salesLt1000Count += salesLt1000;
      row.salesLt2000Count += salesLt2000;
      groupMap.set(key, row);
    }

    // 3. 应用前端筛选（一阶无付费点业代隐藏）
    let rows = Array.from(groupMap.values()).filter((r) => {
      if (filters?.region?.length && !filters.region.includes(r.region)) return false;
      if (filters?.tier?.length && !filters.tier.includes(r.tier)) return false;
      if (filters?.salesRep?.length && !filters.salesRep.includes(r.salesRep)) return false;
      if (r.tier === '一阶' && r.paidPoints === 0) return false;
      return true;
    });

    // 4. 计算派生指标并排序
    rows = rows
      .map((r) => ({
        ...r,
        paidPointFeeRatio:
          r.paidStoreSales > 0
            ? (r.paidAmount * selectedMonthCount) / r.paidStoreSales
            : 0,
        paidPointSalesRatio: r.totalStoreSales > 0 ? r.paidStoreSales / r.totalStoreSales : 0,
        feeRatioLe10Ratio: r.paidPoints > 0 ? r.feeRatioLe10 / r.paidPoints : 0,
        feeRatio10to15Ratio: r.paidPoints > 0 ? r.feeRatio10to15 / r.paidPoints : 0,
        feeRatioGt15Ratio: r.paidPoints > 0 ? r.feeRatioGt15 / r.paidPoints : 0,
        feeRatioNoDealRatio: r.paidPoints > 0 ? r.feeRatioNoDeal / r.paidPoints : 0,
        salesLt1000Ratio: r.paidPoints > 0 ? (r.salesLt1000Count ?? 0) / r.paidPoints : 0,
        salesLt2000Ratio: r.paidPoints > 0 ? (r.salesLt2000Count ?? 0) / r.paidPoints : 0,
      }))
      .sort((a, b) => a.region.localeCompare(b.region) || a.tier.localeCompare(b.tier) || a.salesRep.localeCompare(b.salesRep));

    return { rows };
  }

  /** ATP 绩效门店明细：不聚合到业代，每门店一行 */
  async getAtpPerformanceStoreDetail(
    dateFrom: string,
    dateTo: string,
    _granularity: TimeGranularity,
    filters?: HeatmapFilterParams,
    thresholds?: AtpThresholdParams,
  ): Promise<AtpPerformanceStoreDetailResponse> {
    const [customers, expenses] = await Promise.all([
      this.customerProfileService.findAllUnpaginated(),
      this.expenseProfileService.findAllUnpaginated(),
    ]);

    // 自定义分档参数（缺省用系统默认值）
    const feeLe10Threshold = thresholds?.feeLe10 ?? 0.1;
    const feeGt15Threshold = thresholds?.feeGt15 ?? 0.15;
    const salesLt1000Threshold = thresholds?.salesLt1000 ?? 1000;
    const salesLt2000Threshold = thresholds?.salesLt2000 ?? 2000;

    const startYm = String(dateFrom ?? '').slice(0, 7);
    const endYm = String(dateTo ?? '').slice(0, 7);
    const selectedMonthCount = this.countMonths(startYm, endYm);

    const salesMap = new Map<string, { totalSales: number }>();
    for (const e of expenses) {
      if (String(e.sheetType ?? '').trim() !== '客户销额') continue;

      const monthValue = String(e.extras['时间-年/月'] ?? '').trim();
      const recordYm = monthValue ? this.parseAtpMonthStrict(monthValue) : null;
      if (recordYm && (recordYm < startYm || recordYm > endYm)) continue;

      const code = this.normalizeAtpCustomerCode(String(e.customerCode ?? '').trim());
      if (!code) continue;
      const sales = this.parseNumeric(
        e.extras['回单金额'] ?? e.extras['客户销额'] ?? e.extras['门店销额'] ?? e.extras['销额'] ?? 0,
      );
      const cur = salesMap.get(code) ?? { totalSales: 0 };
      cur.totalSales += sales;
      salesMap.set(code, cur);
    }

    const rows: AtpPerformanceStoreRow[] = [];
    for (const c of customers) {
      const code = this.normalizeAtpCustomerCode(String(c.customerCode ?? '').trim());
      const region = String(c.region ?? '').trim();
      const tier = String(c.tier ?? '').trim();
      const salesRep = String(c.extras['客户经理'] ?? c.extras['业代'] ?? '').trim();
      if (!region || !tier || !salesRep) continue;

      const customerName = String(c.customerName ?? '').trim();
      const totalPoints = this.parseNumeric(c.extras['总点数'] ?? 1);
      const paidAmount = this.parseNumeric(c.extras['付费金额'] ?? 0);
      const paidPoints = this.parseNumeric(c.extras['付费点数'] ?? (paidAmount > 0 ? 1 : 0));
      const storeSales = salesMap.get(code)?.totalSales ?? 0;
      const paidStoreSales = paidAmount > 0 ? storeSales : 0;

      let feeRatioLe10 = 0;
      let feeRatio10to15 = 0;
      let feeRatioGt15 = 0;
      let feeRatioNoDeal = 0;
      let salesLt1000Count = 0;
      let salesLt2000Count = 0;
      if (paidAmount > 0) {
        if (storeSales <= 0) {
          feeRatioNoDeal = 1;
        } else {
          const storeFeeRatio = (paidAmount * selectedMonthCount) / storeSales;
          if (storeFeeRatio <= feeLe10Threshold) feeRatioLe10 = 1;
          else if (storeFeeRatio <= feeGt15Threshold) feeRatio10to15 = 1;
          else feeRatioGt15 = 1;
        }
        if (storeSales < salesLt1000Threshold) salesLt1000Count = 1;
        if (storeSales < salesLt2000Threshold) salesLt2000Count = 1;
      }

      const paidPointFeeRatio = paidStoreSales > 0
        ? (paidAmount * selectedMonthCount) / paidStoreSales
        : 0;
      const paidPointSalesRatio = storeSales > 0 ? paidStoreSales / storeSales : 0;

      rows.push({
        region,
        tier,
        salesRep,
        customerName,
        customerCode: code,
        totalPoints,
        paidPoints,
        paidAmount,
        totalStoreSales: storeSales,
        paidStoreSales,
        paidPointFeeRatio,
        paidPointSalesRatio,
        feeRatioLe10,
        feeRatio10to15,
        feeRatioGt15,
        feeRatioNoDeal,
        feeRatioLe10Ratio: paidPoints > 0 ? feeRatioLe10 / paidPoints : 0,
        feeRatio10to15Ratio: paidPoints > 0 ? feeRatio10to15 / paidPoints : 0,
        feeRatioGt15Ratio: paidPoints > 0 ? feeRatioGt15 / paidPoints : 0,
        feeRatioNoDealRatio: paidPoints > 0 ? feeRatioNoDeal / paidPoints : 0,
        salesLt1000Count,
        salesLt1000Ratio: paidPoints > 0 ? salesLt1000Count / paidPoints : 0,
        salesLt2000Count,
        salesLt2000Ratio: paidPoints > 0 ? salesLt2000Count / paidPoints : 0,
      });
    }

    const filtered = rows
      .filter((r) => {
        if (filters?.region?.length && !filters.region.includes(r.region)) return false;
        if (filters?.tier?.length && !filters.tier.includes(r.tier)) return false;
        if (filters?.salesRep?.length && !filters.salesRep.includes(r.salesRep)) return false;
        if (r.tier === '一阶' && r.paidPoints === 0) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.region.localeCompare(b.region) ||
          a.tier.localeCompare(b.tier) ||
          a.salesRep.localeCompare(b.salesRep) ||
          a.customerCode.localeCompare(b.customerCode),
      );

    return { rows: filtered };
  }

  private parseNumeric(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) || !Number.isFinite(num) ? 0 : num;
  }

  private normalizeAtpCustomerCode(code: string): string {
    const trimmed = String(code ?? '').trim();
    if (/^1201\//i.test(trimmed)) return trimmed;
    if (/^KH\d+/i.test(trimmed)) return trimmed;
    const m = trimmed.match(/^0+(\d+)$/);
    if (m) return `1201/${m[1]}`;
    return trimmed;
  }

  private countMonths(startYm: string, endYm: string): number {
    const [sy, sm] = startYm.split('-').map(Number);
    const [ey, em] = endYm.split('-').map(Number);
    if (!sy || !sm || !ey || !em) return 1;
    return (ey - sy) * 12 + (em - sm) + 1;
  }

}
