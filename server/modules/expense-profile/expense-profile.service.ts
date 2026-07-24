import { Injectable, Inject, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { expenseProfile } from '@server/database/schema';
import { eq, count, sql, and, or, like } from 'drizzle-orm';
import type {
  ExpenseRecord,
  UploadExpenseRequest,
  UploadExpenseResponse,
  GetExpensesResponse,
  DeleteExpenseResponse,
  GetExpenseUploadRecordResponse,
} from '@shared/api.interface';

interface InMemoryRecord {
  customerCode: string;
  customerName: string;
  sheetType: string;
  extras: Record<string, unknown>;
  _created_at: Date;
  _updated_at: Date;
  _created_by: string;
  _updated_by: string;
}

function extractMonthFromRecord(record: { extras?: Record<string, unknown> }): string | null {
  for (const v of Object.values(record.extras ?? {})) {
    const raw = String(v ?? '');
    const match = raw.match(/(\d+)月\s+(\d{4})/);
    if (match) {
      const m = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

@Injectable()
export class ExpenseProfileService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseProfileService.name);
  private useMemoryStorage = true;
  private memoryStore = new Map<string, InMemoryRecord[]>();

  // 短时 TTL 缓存：避免一次页面加载中多个 API 重复全表查询
  private unpaginatedCache: { data: ExpenseRecord[]; expires: number } | null = null;
  private static readonly CACHE_TTL_MS = 10_000;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.verifyDatabase();
  }

  private async verifyDatabase(): Promise<void> {
    try {
      const [result] = await this.db
        .select({ total: count() })
        .from(expenseProfile)
        .limit(1);
      this.useMemoryStorage = false;
      this.logger.log(`数据库正常 (${result?.total ?? 0} 条记录)，使用数据库存储`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`数据库验证失败: ${message}`, err instanceof Error ? err.stack : String(err));
      this.useMemoryStorage = true;
    }
  }

  async getLatestUploadRecord(): Promise<GetExpenseUploadRecordResponse> {
    if (this.useMemoryStorage) {
      const records = Array.from(this.memoryStore.values()).flat();
      if (records.length === 0) return { fileName: '', uploadTime: '', rowCount: 0 };
      const sorted = records.sort((a, b) => b._updated_at.getTime() - a._updated_at.getTime());
      return {
        fileName: '数据模板-费用资料',
        uploadTime: sorted[0]._updated_at.toLocaleString('zh-CN', {
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        rowCount: records.length,
      };
    }
    try {
      const [totalResult, latestResult] = await Promise.all([
        this.db.select({ total: count() }).from(expenseProfile),
        this.db.execute(
          sql`SELECT _updated_at FROM expense_profile ORDER BY _updated_at DESC LIMIT 1`,
        ),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      if (isNaN(total) || total === 0) return { fileName: '', uploadTime: '', rowCount: 0 };
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
      return { fileName: '数据模板-费用资料', uploadTime, rowCount: total };
    } catch (err) {
      this.logger.warn(`getLatestUploadRecord 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getLatestUploadRecord();
    }
  }

  async findAllUnpaginated(): Promise<ExpenseRecord[]> {
    // 检查缓存是否命中
    if (this.unpaginatedCache && this.unpaginatedCache.expires > Date.now()) {
      return this.unpaginatedCache.data;
    }

    if (this.useMemoryStorage) {
      const data = Array.from(this.memoryStore.values()).flat().map((r) => ({
        customerCode: r.customerCode,
        customerName: r.customerName,
        sheetType: r.sheetType,
        extras: r.extras,
      }));
      this.unpaginatedCache = { data, expires: Date.now() + ExpenseProfileService.CACHE_TTL_MS };
      return data;
    }
    try {
      const items = await this.db
        .select({
          customerCode: expenseProfile.customerCode,
          customerName: expenseProfile.customerName,
          sheetType: expenseProfile.sheetType,
          extras: expenseProfile.extras,
        })
        .from(expenseProfile)
        .orderBy(expenseProfile.customerCode);
      const data = items.map((item) => ({
        customerCode: item.customerCode,
        customerName: item.customerName,
        sheetType: item.sheetType,
        extras: (item.extras as Record<string, unknown>) ?? {},
      }));
      this.unpaginatedCache = { data, expires: Date.now() + ExpenseProfileService.CACHE_TTL_MS };
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

  async findAll(
    page: number = 1,
    pageSize: number = 20,
    keyword?: string,
    sheetType?: string,
  ): Promise<GetExpensesResponse> {
    if (this.useMemoryStorage) {
      let records = Array.from(this.memoryStore.values()).flat();
      if (keyword) {
        const kw = keyword.toLowerCase();
        records = records.filter(
          (r) => r.customerCode.toLowerCase().includes(kw) || r.customerName.toLowerCase().includes(kw),
        );
      }
      if (sheetType) {
        records = records.filter((r) => r.sheetType === sheetType);
      }
      records.sort((a, b) => a.customerCode.localeCompare(b.customerCode));
      const total = records.length;
      const offset = (page - 1) * pageSize;
      const items = records.slice(offset, offset + pageSize).map((r) => ({
        customerCode: r.customerCode,
        customerName: r.customerName,
        sheetType: r.sheetType,
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
            like(expenseProfile.customerCode, `%${keyword}%`),
            like(expenseProfile.customerName, `%${keyword}%`),
          ),
        );
      }
      if (sheetType) {
        conditions.push(eq(expenseProfile.sheetType, sheetType));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, totalResult] = await Promise.all([
        this.db
          .select({
            customerCode: expenseProfile.customerCode,
            customerName: expenseProfile.customerName,
            sheetType: expenseProfile.sheetType,
            extras: expenseProfile.extras,
          })
          .from(expenseProfile)
          .where(whereClause)
          .orderBy(expenseProfile.customerCode)
          .limit(pageSize)
          .offset(offset),
        this.db.select({ total: count() }).from(expenseProfile).where(whereClause),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      return {
        items: items.map((item) => ({
          customerCode: item.customerCode,
          customerName: item.customerName,
          sheetType: item.sheetType,
          extras: (item.extras as Record<string, unknown>) ?? {},
        })),
        total,
      };
    } catch (err) {
      this.logger.warn(`findAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.findAll(page, pageSize, keyword, sheetType);
    }
  }

  async upsertBatch(
    expenses: ExpenseRecord[],
    userId: string,
    clearExisting: boolean = false,
    uploadMonths?: string[],
  ): Promise<UploadExpenseResponse> {
    // 只处理选定年月的记录；无年月信息的记录不上传
    const filteredExpenses = uploadMonths?.length
      ? expenses.filter((r) => {
          const month = extractMonthFromRecord(r);
          return month && uploadMonths.includes(month);
        })
      : expenses;

    const sanitizeExtras = (extrasObj: Record<string, unknown>) => {
      const sanitizedExtras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extrasObj)) {
        if (v === undefined || v === null) sanitizedExtras[k] = '';
        else if (v instanceof Date) sanitizedExtras[k] = v.toISOString();
        else if (typeof v === 'object') sanitizedExtras[k] = JSON.stringify(v);
        else sanitizedExtras[k] = String(v);
      }
      return sanitizedExtras;
    };

    if (this.useMemoryStorage) {
      let inserted = 0;
      let updated = 0;
      const now = new Date();
      const sheetTypes = new Set(filteredExpenses.map((r) => String(r.sheetType ?? '').trim() || '默认'));

      // 覆盖上传时，删除选定年月的旧数据
      if (clearExisting && uploadMonths?.length) {
        for (const [sheetType, list] of this.memoryStore.entries()) {
          this.memoryStore.set(
            sheetType,
            list.filter((r) => {
              const month = extractMonthFromRecord(r);
              return !month || !uploadMonths.includes(month);
            }),
          );
        }
      }

      for (const r of filteredExpenses) {
        const code = String(r.customerCode ?? '').trim();
        if (!code) continue;
        const sheetType = String(r.sheetType ?? '').trim() || '默认';
        const sanitizedExtras = sanitizeExtras((r.extras ?? {}) as Record<string, unknown>);
        const list = this.memoryStore.get(sheetType) ?? [];
        list.push({
          customerCode: code,
          customerName: String(r.customerName ?? '').trim(),
          sheetType,
          extras: sanitizedExtras,
          _created_at: now,
          _updated_at: now,
          _created_by: userId,
          _updated_by: userId,
        });
        this.memoryStore.set(sheetType, list);
        inserted++;
      }
      this.logger.log(`内存存储: 覆盖 ${sheetTypes.size} 个 sheet，共 ${inserted} 条费用记录`);
      this.invalidateUnpaginatedCache();
      return { inserted, updated, total: filteredExpenses.length };
    }

    try {
      // 覆盖上传时，先删除数据库中选定年月的旧数据
      if (clearExisting && uploadMonths?.length) {
        await this.db.execute(sql`
          DELETE FROM expense_profile
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_each_text(${expenseProfile.extras}) AS kv
            WHERE kv.value ~ '^[0-9]+月\\s+[0-9]{4}$'
              AND to_char(
                to_date(regexp_replace(kv.value, '([0-9]+)月\\s+([0-9]{4})', '\\2-\\1'), 'YYYY-MM'),
                'YYYY-MM'
              ) = ANY(${sql.param(uploadMonths)}::text[])
          )
        `);
      }

      const BATCH_SIZE = 200;
      let totalProcessed = 0;

      for (let i = 0; i < filteredExpenses.length; i += BATCH_SIZE) {
        const batch = filteredExpenses.slice(i, i + BATCH_SIZE);
        const rows = batch.map((r) => {
          const code = String(r.customerCode ?? '').trim();
          const name = String(r.customerName ?? '').trim();
          const sheetType = String(r.sheetType ?? '').trim() || '默认';
          const sanitizedExtras = sanitizeExtras((r.extras ?? {}) as Record<string, unknown>);
          return {
            customerCode: code,
            customerName: name,
            sheetType,
            extras: sanitizedExtras,
            createdBy: userId,
            updatedBy: userId,
          };
        });

        await this.db.insert(expenseProfile).values(rows);
        totalProcessed += batch.length;
        this.logger.log(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length} records (total ${totalProcessed}/${filteredExpenses.length})`,
        );
      }

      this.logger.log(`Expense upsert complete: ${totalProcessed} records`);
      this.invalidateUnpaginatedCache();
      return { inserted: totalProcessed, updated: 0, total: filteredExpenses.length };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`upsertBatch 数据库失败: ${message}`, err instanceof Error ? err.stack : String(err));
      throw err;
    }
  }

  async removeAll(userId: string): Promise<DeleteExpenseResponse> {
    if (this.useMemoryStorage) {
      const cnt = Array.from(this.memoryStore.values()).flat().length;
      this.memoryStore.clear();
      this.logger.log(`内存存储: 清空 ${cnt} 条记录 (by ${userId})`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    }
    try {
      await this.db.delete(expenseProfile);
      this.logger.log(`All expense profiles deleted by ${userId}`);
      this.invalidateUnpaginatedCache();
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.removeAll(userId);
    }
  }

  async removeOne(id: string, userId: string): Promise<DeleteExpenseResponse> {
    if (this.useMemoryStorage) {
      for (const [sheetType, list] of this.memoryStore.entries()) {
        const idx = list.findIndex((r) => r.customerCode === id);
        if (idx !== -1) {
          list.splice(idx, 1);
          this.logger.log(`内存存储: 删除 ${id} (by ${userId})`);
          return { success: true };
        }
      }
      throw new NotFoundException(`Expense ${id} not found`);
    }
    try {
      const [deleted] = await this.db
        .delete(expenseProfile)
        .where(eq(expenseProfile.id, id))
        .returning({ id: expenseProfile.id });
      if (!deleted) throw new NotFoundException(`Expense ${id} not found`);
      this.logger.log(`Expense profile deleted: ${id} by ${userId}`);
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeOne 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { success: true };
    }
  }
}
