import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { routeMapping } from '@server/database/schema';
import { eq, or, ilike, and, sql } from 'drizzle-orm';
import type {
  RouteMappingItem,
  GetRouteMappingsResponse,
  UploadRouteMappingResponse,
  DeleteRouteMappingResponse,
} from '@shared/api.interface';

@Injectable()
export class RouteMappingService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getRouteMappings(
    page: number,
    pageSize: number,
    keyword?: string,
  ): Promise<GetRouteMappingsResponse> {
    const conditions = [];
    if (keyword) {
      conditions.push(
        or(
          ilike(routeMapping.customerCode, `%${keyword}%`),
          ilike(routeMapping.routeCode, `%${keyword}%`),
          ilike(routeMapping.routeName, `%${keyword}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      this.db
        .select({
          id: routeMapping.id,
          customerCode: routeMapping.customerCode,
          routeCode: routeMapping.routeCode,
          routeName: routeMapping.routeName,
          createdAt: routeMapping.createdAt,
        })
        .from(routeMapping)
        .where(whereClause)
        .orderBy(routeMapping.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(routeMapping)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: items.map((item: typeof items[0]) => ({
        ...item,
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      })),
      total,
    };
  }

  async uploadRouteMappings(
    mappings: Array<{ customerCode: string; routeCode: string; routeName?: string }>,
    userId: string,
  ): Promise<UploadRouteMappingResponse> {
    let inserted = 0;
    let updated = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
      const batch = mappings.slice(i, i + BATCH_SIZE);
      for (const mapping of batch) {
        const existing = await this.db
          .select({ id: routeMapping.id })
          .from(routeMapping)
          .where(
            and(
              eq(routeMapping.customerCode, mapping.customerCode),
              eq(routeMapping.routeCode, mapping.routeCode),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await this.db
            .update(routeMapping)
            .set({
              routeName: mapping.routeName ?? null,
              updatedAt: new Date(),
              updatedBy: userId,
            })
            .where(eq(routeMapping.id, existing[0].id));
          updated++;
        } else {
          await this.db.insert(routeMapping).values({
            customerCode: mapping.customerCode,
            routeCode: mapping.routeCode,
            routeName: mapping.routeName ?? null,
            createdBy: userId,
            updatedBy: userId,
          });
          inserted++;
        }
      }
    }

    return { inserted, updated, total: mappings.length };
  }

  async deleteRouteMapping(id: string): Promise<DeleteRouteMappingResponse> {
    await this.db.delete(routeMapping).where(eq(routeMapping.id, id));
    return { success: true };
  }
}
