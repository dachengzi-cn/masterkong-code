/**
 * 前端版本缓存工具 — 基于 localStorage
 * 用于技能和文档的版本存档、历史回溯、单独删除和版本号自定义
 */

export interface CachedVersionEntry<T = Record<string, unknown>> {
  cacheId: string;
  scope: 'skill' | 'doc';
  scopeKey: string; // skillKey or docKey
  version: number;
  customLabel: string | null;
  snapshot: T;
  createdAt: string;
}

const STORAGE_PREFIX = 'version-cache:';

function getStorageKey(scope: 'skill' | 'doc', scopeKey: string): string {
  return `${STORAGE_PREFIX}${scope}:${scopeKey}`;
}

/** 保存一个版本快照到缓存 */
export function saveVersionCache<T = Record<string, unknown>>(
  scope: 'skill' | 'doc',
  scopeKey: string,
  version: number,
  snapshot: T,
  customLabel?: string,
): CachedVersionEntry<T> {
  const key = getStorageKey(scope, scopeKey);
  const entries = readCache<T>(scope, scopeKey);

  const entry: CachedVersionEntry<T> = {
    cacheId: `${scopeKey}-${version}-${Date.now()}`,
    scope,
    scopeKey,
    version,
    customLabel: customLabel ?? null,
    snapshot,
    createdAt: new Date().toISOString(),
  };

  entries.unshift(entry);
  // 最多保留 30 个版本
  const trimmed = entries.slice(0, 30);
  localStorage.setItem(key, JSON.stringify(trimmed));
  return entry;
}

/** 读取缓存的所有版本 */
export function readCache<T = Record<string, unknown>>(
  scope: 'skill' | 'doc',
  scopeKey: string,
): CachedVersionEntry<T>[] {
  const key = getStorageKey(scope, scopeKey);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as CachedVersionEntry<T>[];
  } catch {
    return [];
  }
}

/** 删除单个缓存版本 */
export function deleteVersionCache(
  scope: 'skill' | 'doc',
  scopeKey: string,
  cacheId: string,
): void {
  const key = getStorageKey(scope, scopeKey);
  const entries = readCache(scope, scopeKey);
  const filtered = entries.filter((e) => e.cacheId !== cacheId);
  localStorage.setItem(key, JSON.stringify(filtered));
}

/** 获取指定缓存版本 */
export function getVersionCache<T = Record<string, unknown>>(
  scope: 'skill' | 'doc',
  scopeKey: string,
  cacheId: string,
): CachedVersionEntry<T> | undefined {
  return readCache<T>(scope, scopeKey).find((e) => e.cacheId === cacheId);
}

/** 更新缓存版本的自定义版本号 */
export function updateVersionLabel(
  scope: 'skill' | 'doc',
  scopeKey: string,
  cacheId: string,
  customLabel: string,
): void {
  const key = getStorageKey(scope, scopeKey);
  const entries = readCache(scope, scopeKey);
  const idx = entries.findIndex((e) => e.cacheId === cacheId);
  if (idx >= 0) {
    entries[idx].customLabel = customLabel;
    localStorage.setItem(key, JSON.stringify(entries));
  }
}
