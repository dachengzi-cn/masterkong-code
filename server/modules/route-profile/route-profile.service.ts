import { Injectable, Inject, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { routeProfile } from '@server/database/schema';
import { eq, count, sql, and, or, like } from 'drizzle-orm';
import type {
  RouteProfile,
  UploadRouteResponse,
  GetRoutesResponse,
  DeleteRouteResponse,
  RouteUploadRecord,
} from '@shared/api.interface';

interface InMemoryRecord {
  customerCode: string;
  routeName: string;
  extras: Record<string, unknown>;
  _created_at: Date;
  _updated_at: Date;
  _created_by: string;
  _updated_by: string;
}

@Injectable()
export class RouteProfileService implements OnModuleInit {
  private readonly logger = new Logger(RouteProfileService.name);
  private useMemoryStorage = true;
  private memoryStore = new Map<string, InMemoryRecord>();

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
        .from(routeProfile)
        .limit(1);
      this.useMemoryStorage = false;
      this.logger.log(`数据库正常 (${result?.total ?? 0} 条记录)，使用数据库存储`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`数据库验证失败: ${message}`, err instanceof Error ? err.stack : String(err));
      this.useMemoryStorage = true;
    }
  }

  async getLatestUploadRecord(): Promise<RouteUploadRecord | null> {
    if (this.useMemoryStorage) {
      const records = Array.from(this.memoryStore.values());
      if (records.length === 0) return null;
      const sorted = records.sort((a, b) => b._updated_at.getTime() - a._updated_at.getTime());
      return {
        fileName: '数据模板-线路资料',
        uploadTime: sorted[0]._updated_at.toLocaleString('zh-CN', {
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }),
        rowCount: records.length,
      };
    }
    try {
      const [totalResult, latestResult] = await Promise.all([
        this.db.select({ total: count() }).from(routeProfile),
        this.db.execute(
          sql`SELECT _updated_at FROM route_profile ORDER BY _updated_at DESC LIMIT 1`,
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
      return { fileName: '数据模板-线路资料', uploadTime, rowCount: total };
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
  ): Promise<GetRoutesResponse> {
    if (this.useMemoryStorage) {
      let records = Array.from(this.memoryStore.values());
      if (keyword) {
        const kw = keyword.toLowerCase();
        records = records.filter(
          (r) => r.customerCode.toLowerCase().includes(kw) || r.routeName.toLowerCase().includes(kw),
        );
      }
      records.sort((a, b) => a.customerCode.localeCompare(b.customerCode));
      const total = records.length;
      const offset = (page - 1) * pageSize;
      const items = records.slice(offset, offset + pageSize).map((r) => ({
        customerCode: r.customerCode,
        routeName: r.routeName,
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
            like(routeProfile.customerCode, `%${keyword}%`),
            like(routeProfile.routeName, `%${keyword}%`),
          ),
        );
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, totalResult] = await Promise.all([
        this.db
          .select({
            customerCode: routeProfile.customerCode,
            routeName: routeProfile.routeName,
            extras: routeProfile.extras,
          })
          .from(routeProfile)
          .where(whereClause)
          .orderBy(routeProfile.customerCode)
          .limit(pageSize)
          .offset(offset),
        this.db.select({ total: count() }).from(routeProfile).where(whereClause),
      ]);
      const total = parseInt(String(totalResult[0]?.total ?? 0), 10);
      return {
        items: items.map((item) => ({
          customerCode: item.customerCode,
          routeName: item.routeName,
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

  async upsertBatch(
    routes: RouteProfile[],
    userId: string,
  ): Promise<UploadRouteResponse> {
    if (this.useMemoryStorage) {
      let inserted = 0;
      let updated = 0;
      const now = new Date();
      for (const r of routes) {
        const code = String(r.customerCode ?? '').trim();
        if (!code) continue;
        const existing = this.memoryStore.get(code);
        const extrasObj = (r.extras ?? {}) as Record<string, unknown>;
        const sanitizedExtras: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(extrasObj)) {
          if (v === undefined || v === null) sanitizedExtras[k] = '';
          else if (v instanceof Date) sanitizedExtras[k] = v.toISOString();
          else if (typeof v === 'object') sanitizedExtras[k] = JSON.stringify(v);
          else sanitizedExtras[k] = String(v);
        }
        if (existing) {
          existing.routeName = String(r.routeName ?? '').trim();
          existing.extras = sanitizedExtras;
          existing._updated_at = now;
          existing._updated_by = userId;
          updated++;
        } else {
          this.memoryStore.set(code, {
            customerCode: code,
            routeName: String(r.routeName ?? '').trim(),
            extras: sanitizedExtras,
            _created_at: now,
            _updated_at: now,
            _created_by: userId,
            _updated_by: userId,
          });
          inserted++;
        }
      }
      this.logger.log(`内存存储: 新增 ${inserted} 条，更新 ${updated} 条，共 ${routes.length} 条`);
      return { inserted, updated, total: routes.length };
    }

    try {
      const [beforeResult] = await this.db
        .select({ total: count() })
        .from(routeProfile);
      const beforeCount = parseInt(String(beforeResult?.total ?? 0), 10);
      const BATCH_SIZE = 200;
      let totalProcessed = 0;

      for (let i = 0; i < routes.length; i += BATCH_SIZE) {
        const batch = routes.slice(i, i + BATCH_SIZE);
        const rows = batch.map((r) => {
          const code = String(r.customerCode ?? '').trim();
          const name = String(r.routeName ?? '').trim();
          const extrasObj = (r.extras ?? {}) as Record<string, unknown>;
          const sanitizedExtras: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(extrasObj)) {
            if (v === undefined || v === null) sanitizedExtras[k] = '';
            else if (v instanceof Date) sanitizedExtras[k] = v.toISOString();
            else if (typeof v === 'object') sanitizedExtras[k] = JSON.stringify(v);
            else sanitizedExtras[k] = String(v);
          }
          return {
            customerCode: code,
            routeName: name,
            extras: sanitizedExtras,
            createdBy: userId,
            updatedBy: userId,
          };
        });

        await this.db
          .insert(routeProfile)
          .values(rows)
          .onConflictDoUpdate({
            target: routeProfile.customerCode,
            set: {
              routeName: sql`EXCLUDED.route_name`,
              extras: sql`EXCLUDED.extras`,
              updatedBy: sql`EXCLUDED._updated_by`,
            },
          });
        totalProcessed += batch.length;
        this.logger.log(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length} records (total ${totalProcessed}/${routes.length})`,
        );
      }

      const [afterResult] = await this.db
        .select({ total: count() })
        .from(routeProfile);
      const afterCount = parseInt(String(afterResult?.total ?? 0), 10);
      const inserted = Math.max(0, afterCount - beforeCount);
      const updated = Math.max(0, routes.length - inserted);
      this.logger.log(`Route upsert complete: ${inserted} inserted, ${updated} updated, total ${routes.length}`);
      return { inserted, updated, total: routes.length };
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[RouteProfileService] upsertBatch 数据库失败: ${message}`, err);
      this.logger.error(`upsertBatch 数据库失败: ${message}`);
      throw err;
    }
  }

  async removeAll(userId: string): Promise<DeleteRouteResponse> {
    if (this.useMemoryStorage) {
      const cnt = this.memoryStore.size;
      this.memoryStore.clear();
      this.logger.log(`内存存储: 清空 ${cnt} 条记录 (by ${userId})`);
      return { success: true };
    }
    try {
      await this.db.delete(routeProfile);
      this.logger.log(`All route profiles deleted by ${userId}`);
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeAll 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.removeAll(userId);
    }
  }

  async removeOne(id: string, userId: string): Promise<DeleteRouteResponse> {
    if (this.useMemoryStorage) {
      const exists = this.memoryStore.has(id);
      if (!exists) throw new NotFoundException(`Route ${id} not found`);
      this.memoryStore.delete(id);
      this.logger.log(`内存存储: 删除 ${id} (by ${userId})`);
      return { success: true };
    }
    try {
      const [deleted] = await this.db
        .delete(routeProfile)
        .where(eq(routeProfile.id, id))
        .returning({ id: routeProfile.id });
      if (!deleted) throw new NotFoundException(`Route ${id} not found`);
      this.logger.log(`Route profile deleted: ${id} by ${userId}`);
      return { success: true };
    } catch (err) {
      this.logger.warn(`removeOne 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return { success: true };
    }
  }

  /** 获取所有唯一的线路名称（供筛选器使用） */
  async getAllRouteNames(): Promise<string[]> {
    if (this.useMemoryStorage) {
      const names = new Set<string>();
      for (const r of this.memoryStore.values()) {
        if (r.routeName) names.add(r.routeName);
      }
      return Array.from(names).sort();
    }
    try {
      const result = await this.db
        .select({ routeName: routeProfile.routeName })
        .from(routeProfile)
        .where(sql`${routeProfile.routeName} IS NOT NULL AND ${routeProfile.routeName} != ''`);
      const names = new Set<string>();
      for (const row of result) {
        if (row.routeName) names.add(row.routeName);
      }
      return Array.from(names).sort();
    } catch (err) {
      this.logger.warn(`getAllRouteNames 失败: ${(err as Error).message}`);
      this.useMemoryStorage = true;
      return this.getAllRouteNames();
    }
  }
}
