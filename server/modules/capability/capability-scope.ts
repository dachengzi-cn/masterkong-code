import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { capabilityUserScope } from '@server/database/schema';

/**
 * 业务综合能力评估 —— RBAC 数据范围（本阶段仅预留）
 *
 * 规则：若 capability_user_scope 表存在该用户的所别授权记录，则评估接口仅返回
 * 授权所别范围内的数据；无任何配置（或表不存在）时放行全量。
 * 后续接入角色体系时，在 capability.service 调用处追加角色校验（见 TODO 注记）。
 */

export interface ScopeContext {
  /** 允许的所别列表；null 表示全量可见 */
  regions: string[] | null;
}

/**
 * 获取用户的所别数据范围。
 * 数据库不可用或表不存在时视为全量可见（不阻断评估流程）。
 */
export async function getScopeContext(db: PostgresJsDatabase, userId: string | null | undefined): Promise<ScopeContext> {
  if (!userId) return { regions: null };
  try {
    const rows = await db
      .select({ region: capabilityUserScope.region })
      .from(capabilityUserScope)
      .where(eq(capabilityUserScope.userId, userId));
    if (rows.length === 0) return { regions: null };
    return { regions: rows.map((r) => r.region) };
  } catch {
    // 表不存在/DB 未就绪 → 全量可见
    return { regions: null };
  }
}

/** 判断所别是否在授权范围内（regions 为 null 表示全量放行） */
export function isRegionAllowed(scope: ScopeContext, region: string): boolean {
  if (scope.regions === null) return true;
  return scope.regions.includes(region);
}
