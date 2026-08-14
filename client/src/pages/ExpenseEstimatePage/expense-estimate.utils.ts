/** 费用预估模块公共工具 */

/** 金额格式化：千分位 + 最多 2 位小数（mono 排版数字） */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '¥0';
  const rounded = Math.round(value * 100) / 100;
  const str = rounded.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `¥${str}`;
}

/** 百分比格式化（rate 为 -1 表示无预估金额） */
export function formatUsageRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return '—';
  return `${rate.toFixed(1)}%`;
}

/** 使用率状态：'empty' 无预估 | 'ok' 正常 | 'over' 超支 */
export type UsageStatus = 'empty' | 'ok' | 'over';

export function getUsageStatus(rate: number): UsageStatus {
  if (!Number.isFinite(rate) || rate < 0) return 'empty';
  if (rate >= 100) return 'over';
  return 'ok';
}

export function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
