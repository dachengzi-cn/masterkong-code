import { Injectable, Inject, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { expenseEstimateRecord } from '@server/database/schema';
import { eq, and, desc, like, or, sql, inArray, type SQL } from 'drizzle-orm';
import type {
  CreateExpenseEstimateRequest,
  UpdateExpenseEstimateRequest,
  ExpenseEstimateRecord as ExpenseEstimateRecordDto,
  ExpenseEstimateListResponse,
  ExpenseEstimateFilterParams,
  ExpenseEstimateSummary,
  ExpenseEstimateSplitRow,
  ExpenseEstimateMonthTrendItem,
  ExpenseEstimateOptions,
  ExpenseEstimateMutationResponse,
} from '@shared/api.interface';

/** 数据库行 → DTO：numeric 列返回字符串，统一转为 number */
function toDto(row: Record<string, unknown>): ExpenseEstimateRecordDto {
  return {
    id: String(row.id),
    month: String(row.month ?? ''),
    region: String(row.region ?? ''),
    department: String(row.department ?? ''),
    activityName: String(row.activityName ?? ''),
    expenseSubject: String(row.expenseSubject ?? ''),
    estimatedAmount: Number(row.estimatedAmount ?? 0),
    actualAmount: Number(row.actualAmount ?? 0),
    remark: row.remark ? String(row.remark) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
  };
}

function normalizeAmount(value: number | string | undefined | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeUsageRate(estimated: number, actual: number): number {
  if (estimated <= 0) return -1;
  return Math.round((actual / estimated) * 1000) / 10;
}

@Injectable()
export class ExpenseEstimateService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseEstimateService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 启动时确保表存在（幂等）；anon_ 权限由 LocalDatabaseModule 启动引导自动授予 */
  async onModuleInit(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS expense_estimate_record (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          month varchar(7) NOT NULL,
          region varchar(255) NOT NULL,
          department varchar(255) NOT NULL,
          activity_name varchar(255) NOT NULL,
          expense_subject varchar(255) NOT NULL,
          estimated_amount numeric(14, 2) NOT NULL DEFAULT 0,
          actual_amount numeric(14, 2) NOT NULL DEFAULT 0,
          remark text,
          _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          _created_by user_profile,
          _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          _updated_by user_profile
        )
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_expense_estimate_month ON expense_estimate_record(month)
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_expense_estimate_region ON expense_estimate_record(region)
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_expense_estimate_subject ON expense_estimate_record(expense_subject)
      `);
      this.logger.log('expense_estimate_record 表已就绪');
    } catch (err) {
      // 受限环境中建表 DDL 可能被拒绝（表已由迁移脚本创建）；仅告警不阻断启动
      this.logger.warn(
        `expense_estimate_record 建表失败（可能已存在或缺少 DDL 权限）: ${(err as Error).message}`,
      );
    }
  }

  /** 聚合指定维度拆分数据（JS 侧聚合，与临期分析一致） */
  private aggregateBreakdown(
    rows: ExpenseEstimateRecordDto[],
    keyFn: (r: ExpenseEstimateRecordDto) => string,
  ): ExpenseEstimateSplitRow[] {
    const map = new Map<
      string,
      { estimatedAmount: number; actualAmount: number }
    >();
    for (const row of rows) {
      const key = keyFn(row).trim();
      if (!key) continue;
      const item = map.get(key) ?? { estimatedAmount: 0, actualAmount: 0 };
      item.estimatedAmount += row.estimatedAmount;
      item.actualAmount += row.actualAmount;
      map.set(key, item);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        estimatedAmount: v.estimatedAmount,
        actualAmount: v.actualAmount,
        usageRate: computeUsageRate(v.estimatedAmount, v.actualAmount),
        remainingAmount: v.estimatedAmount - v.actualAmount,
      }))
      .sort((a, b) => b.actualAmount - a.actualAmount);
  }

  private buildWhere(filters: ExpenseEstimateFilterParams): SQL | undefined {
    const conds: SQL[] = [];
    const split = (v?: string[] | string) =>
      typeof v === 'string' ? v.split(',').filter(Boolean) : v;
    if (filters.monthFrom || filters.monthTo) {
      conds.push(
        sql`${expenseEstimateRecord.month} >= ${filters.monthFrom ?? '0000-00'}
          AND ${expenseEstimateRecord.month} <= ${filters.monthTo ?? '9999-12'}`,
      );
    }
    const regions = split(filters.region);
    if (regions && regions.length > 0) {
      conds.push(inArray(expenseEstimateRecord.region, regions));
    }
    const departments = split(filters.department);
    if (departments && departments.length > 0) {
      conds.push(inArray(expenseEstimateRecord.department, departments));
    }
    const subjects = split(filters.subject);
    if (subjects && subjects.length > 0) {
      conds.push(inArray(expenseEstimateRecord.expenseSubject, subjects));
    }
    const activities = split(filters.activity);
    if (activities && activities.length > 0) {
      conds.push(inArray(expenseEstimateRecord.activityName, activities));
    }
    if (filters.keyword && filters.keyword.trim()) {
      const kw = `%${filters.keyword.trim()}%`;
      const kwCond = or(
        like(expenseEstimateRecord.activityName, kw),
        like(expenseEstimateRecord.expenseSubject, kw),
        like(expenseEstimateRecord.region, kw),
        like(expenseEstimateRecord.department, kw),
      );
      if (kwCond) conds.push(kwCond as SQL);
    }
    return conds.length > 0 ? and(...conds) : undefined;
  }

  async list(filters: ExpenseEstimateFilterParams): Promise<ExpenseEstimateListResponse> {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize ?? 20) || 20));
    const where = this.buildWhere(filters);

    const totalRows = where
      ? await this.db
          .select({ total: sql<number>`count(*)::int` })
          .from(expenseEstimateRecord)
          .where(where)
      : await this.db
          .select({ total: sql<number>`count(*)::int` })
          .from(expenseEstimateRecord);

    const total = Number(totalRows[0]?.total ?? 0);

    const base = this.db
      .select()
      .from(expenseEstimateRecord)
      .orderBy(desc(expenseEstimateRecord.month), desc(expenseEstimateRecord.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const rows = where ? await base.where(where) : await base;

    return {
      items: rows.map((r) => toDto(r as unknown as Record<string, unknown>)),
      total,
      page,
      pageSize,
    };
  }

  async getOptions(): Promise<ExpenseEstimateOptions> {
    const rows = await this.db.select().from(expenseEstimateRecord);
    const uniq = (key: keyof ExpenseEstimateRecordDto) =>
      Array.from(
        new Set(rows.map((r) => String(r[key] ?? '')).filter(Boolean)),
      ).sort();
    return {
      months: uniq('month'),
      regions: uniq('region'),
      departments: uniq('department'),
      subjects: uniq('expenseSubject'),
      activities: uniq('activityName'),
    };
  }

  async summary(filters: ExpenseEstimateFilterParams): Promise<ExpenseEstimateSummary> {
    const where = this.buildWhere(filters);
    const base = this.db.select().from(expenseEstimateRecord);
    const rows = where
      ? await base.where(where)
      : await base;
    const dtos = rows.map((r) => toDto(r as unknown as Record<string, unknown>));

    const totalEstimated = dtos.reduce((s, r) => s + r.estimatedAmount, 0);
    const totalActual = dtos.reduce((s, r) => s + r.actualAmount, 0);

    const monthMap = new Map<string, { estimatedAmount: number; actualAmount: number }>();
    for (const r of dtos) {
      const item = monthMap.get(r.month) ?? { estimatedAmount: 0, actualAmount: 0 };
      item.estimatedAmount += r.estimatedAmount;
      item.actualAmount += r.actualAmount;
      monthMap.set(r.month, item);
    }
    const monthTrend: ExpenseEstimateMonthTrendItem[] = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return {
      kpis: {
        totalEstimated,
        totalActual,
        overallUsageRate: computeUsageRate(totalEstimated, totalActual),
        remainingAmount: totalEstimated - totalActual,
        recordCount: dtos.length,
        activityCount: new Set(dtos.map((r) => r.activityName)).size,
        subjectCount: new Set(dtos.map((r) => r.expenseSubject)).size,
      },
      regionBreakdown: this.aggregateBreakdown(dtos, (r) => r.region),
      departmentBreakdown: this.aggregateBreakdown(dtos, (r) => r.department),
      subjectBreakdown: this.aggregateBreakdown(dtos, (r) => r.expenseSubject),
      activityBreakdown: this.aggregateBreakdown(dtos, (r) => r.activityName),
      monthTrend,
      options: {
        months: Array.from(monthMap.keys()).sort().reverse(),
        regions: Array.from(new Set(dtos.map((r) => r.region))).sort(),
        departments: Array.from(new Set(dtos.map((r) => r.department))).sort(),
        subjects: Array.from(new Set(dtos.map((r) => r.expenseSubject))).sort(),
        activities: Array.from(new Set(dtos.map((r) => r.activityName))).sort(),
      },
    };
  }

  async create(
    data: CreateExpenseEstimateRequest,
    userId: string,
  ): Promise<ExpenseEstimateMutationResponse> {
    const month = String(data.month ?? '').trim();
    if (!month) {
      throw new Error('月份不能为空');
    }
    const [row] = await this.db
      .insert(expenseEstimateRecord)
      .values({
        month,
        region: String(data.region ?? '').trim() || '未分配',
        department: String(data.department ?? '').trim() || '未分配',
        activityName: String(data.activityName ?? '').trim() || '未命名活动',
        expenseSubject: String(data.expenseSubject ?? '').trim() || '未分类',
        estimatedAmount: String(normalizeAmount(data.estimatedAmount).toFixed(2)),
        actualAmount: String(normalizeAmount(data.actualAmount).toFixed(2)),
        remark: data.remark?.trim() ? data.remark.trim() : null,
        createdBy: userId as never,
        updatedBy: userId as never,
      })
      .returning({ id: expenseEstimateRecord.id });
    this.logger.log(`费用登记成功: id=${row?.id}, month=${month}`);
    return { success: true, id: row?.id };
  }

  async update(
    id: string,
    data: UpdateExpenseEstimateRequest,
    userId: string,
  ): Promise<ExpenseEstimateMutationResponse> {
    const existing = await this.db
      .select({ id: expenseEstimateRecord.id })
      .from(expenseEstimateRecord)
      .where(eq(expenseEstimateRecord.id, id))
      .limit(1);
    if (existing.length === 0) {
      throw new NotFoundException(`费用登记记录不存在: ${id}`);
    }
    const patch: Record<string, unknown> = { updatedBy: userId as never };
    if (data.month !== undefined) patch.month = data.month;
    if (data.region !== undefined) patch.region = data.region;
    if (data.department !== undefined) patch.department = data.department;
    if (data.activityName !== undefined) patch.activityName = data.activityName;
    if (data.expenseSubject !== undefined) patch.expenseSubject = data.expenseSubject;
    if (data.estimatedAmount !== undefined) {
      patch.estimatedAmount = String(normalizeAmount(data.estimatedAmount).toFixed(2));
    }
    if (data.actualAmount !== undefined) {
      patch.actualAmount = String(normalizeAmount(data.actualAmount).toFixed(2));
    }
    if (data.remark !== undefined) patch.remark = data.remark.trim() ? data.remark.trim() : null;

    await this.db
      .update(expenseEstimateRecord)
      .set(patch as never)
      .where(eq(expenseEstimateRecord.id, id));
    return { success: true, id };
  }

  async remove(id: string): Promise<ExpenseEstimateMutationResponse> {
    const existing = await this.db
      .select({ id: expenseEstimateRecord.id })
      .from(expenseEstimateRecord)
      .where(eq(expenseEstimateRecord.id, id))
      .limit(1);
    if (existing.length === 0) {
      throw new NotFoundException(`费用登记记录不存在: ${id}`);
    }
    await this.db
      .delete(expenseEstimateRecord)
      .where(eq(expenseEstimateRecord.id, id));
    return { success: true, id };
  }
}
