/**
 * 存储回退开关工具
 *
 * MEMORY_FALLBACK 环境变量控制数据库不可用时是否允许降级到内存存储。
 * - false（默认）：数据库不可用时直接抛错，拒绝静默降级，避免业务数据仅存内存而丢失
 * - true：保留内存降级能力（离线演示/开发场景），但数据在进程重启后会丢失
 */
export function isMemoryFallbackEnabled(): boolean {
  return String(process.env.MEMORY_FALLBACK ?? 'false').toLowerCase() === 'true';
}

/** 当回退被禁用时抛出数据库不可用错误 */
export function assertDatabaseAvailable(context: string, err: unknown): never {
  const message = (err as Error)?.message ?? String(err);
  if (isMemoryFallbackEnabled()) {
    // 理论上不会走到这里，仅在调用方未先检查开关时兜底
    throw new Error(`[${context}] 数据库不可用: ${message}`);
  }
  throw new Error(
    `[${context}] 数据库不可用且内存回退已禁用（MEMORY_FALLBACK=false），拒绝降级。原始错误: ${message}`,
  );
}

/**
 * 运行时数据库操作失败时的统一降级决策：
 * - MEMORY_FALLBACK=true  → 返回 true，调用方执行内存降级
 * - MEMORY_FALLBACK=false → 直接抛错，拒绝静默降级（调用方后续代码不会执行）
 */
export function shouldFallbackToMemory(context: string, err: unknown): boolean {
  if (isMemoryFallbackEnabled()) {
    return true;
  }
  const message = (err as Error)?.message ?? String(err);
  throw new Error(
    `[${context}] 数据库操作失败且内存回退已禁用（MEMORY_FALLBACK=false），拒绝降级。原始错误: ${message}`,
  );
}
