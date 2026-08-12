import dayjs from 'dayjs';
import type { DbColumnInfo, DbColumnKind } from '@shared/api.interface';

/** 列默认宽度（px） */
export function defaultColumnWidth(col: DbColumnInfo): number {
  switch (col.kind) {
    case 'number':
      return 130;
    case 'date':
      return 160;
    case 'boolean':
      return 90;
    case 'uuid':
      return 220;
    case 'json':
      return 200;
    case 'text':
      return 180;
    default:
      return 150;
  }
}

/** 列类型中文标签 */
export function columnKindLabel(kind: DbColumnKind): string {
  switch (kind) {
    case 'number':
      return '数值';
    case 'date':
      return '日期';
    case 'boolean':
      return '布尔';
    case 'json':
      return 'JSON';
    case 'uuid':
      return 'UUID';
    case 'text':
      return '文本';
    default:
      return '其他';
  }
}

/** 数值格式化（千分位，最多两位小数） */
export function formatNumber(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  });
}

/** 日期格式化 */
export function formatDateValue(v: unknown, withTime: boolean): string {
  if (v === null || v === undefined) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return withTime
    ? dayjs(d).format('YYYY-MM-DD HH:mm:ss')
    : dayjs(d).format('YYYY-MM-DD');
}

/** 单元格展示文本 */
export function formatCell(value: unknown, col: DbColumnInfo): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (col.kind) {
    case 'number':
      return formatNumber(value);
    case 'date':
      return formatDateValue(value, col.dataType.includes('timestamp') || col.dataType.includes('time'));
    case 'boolean':
      return value === true || value === 'true' ? '是' : '否';
    case 'json': {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value) as unknown;
          return JSON.stringify(parsed);
        } catch {
          return value;
        }
      }
      return JSON.stringify(value);
    }
    default:
      return String(value);
  }
}

/** 单元格对齐方式 */
export function cellAlignment(col: DbColumnInfo): 'left' | 'right' {
  return col.kind === 'number' ? 'right' : 'left';
}

/** 单元格等宽字体（数字/日期列强制 tabular-nums） */
export function cellMonoClass(col: DbColumnInfo): string {
  return col.kind === 'number' || col.kind === 'date'
    ? 'font-mono tabular-nums'
    : '';
}

/** 是否可做图表维度（有统计数据的列） */
export function isChartable(col: DbColumnInfo): boolean {
  return ['text', 'date', 'number', 'uuid', 'boolean'].includes(col.kind);
}

/** 下载 Blob 文件 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 从 localStorage 读取列宽配置 */
export function loadWidths(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

/** 保存列宽配置到 localStorage */
export function saveWidths(key: string, widths: Record<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // 忽略存储失败
  }
}

/** 从 localStorage 读取列显隐配置（返回 null 表示未配置过） */
export function loadVisibleColumns(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 保存列显隐配置到 localStorage */
export function saveVisibleColumns(key: string, names: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // 忽略存储失败
  }
}

export const TABLE_CACHE_PREFIX = 'db-table-viewer';
