import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DbTableListResponse,
  DbTableStructureResponse,
  DbTableDataResponse,
  DbTableDataParams,
  DbTableFilter,
  DbTableStatsResponse,
  DbTableExportJsonResponse,
} from '@shared/api.interface';

/** 表列表 + 数据库连接信息 */
export async function getDbTables(): Promise<DbTableListResponse> {
  const res = await axiosForBackend({
    url: '/api/db-tables',
    method: 'GET',
  });
  return res.data as DbTableListResponse;
}

/** 表结构（列信息 + 行数） */
export async function getDbTableStructure(
  table: string,
): Promise<DbTableStructureResponse> {
  const res = await axiosForBackend({
    url: `/api/db-tables/${encodeURIComponent(table)}`,
    method: 'GET',
  });
  return res.data as DbTableStructureResponse;
}

/** 分页数据（服务端排序/过滤/搜索） */
export async function getDbTableData(
  table: string,
  params: DbTableDataParams,
): Promise<DbTableDataResponse> {
  const { filters, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (filters && Object.keys(filters).length > 0) {
    query.filters = JSON.stringify(filters);
  }
  const res = await axiosForBackend({
    url: `/api/db-tables/${encodeURIComponent(table)}/data`,
    method: 'GET',
    params: query,
  });
  return res.data as DbTableDataResponse;
}

/** 列统计（统计表 + 图表数据） */
export async function getDbTableStats(
  table: string,
): Promise<DbTableStatsResponse> {
  const res = await axiosForBackend({
    url: `/api/db-tables/${encodeURIComponent(table)}/stats`,
    method: 'GET',
  });
  return res.data as DbTableStatsResponse;
}

/** 导出 CSV（Blob） */
export async function exportDbTableCsv(
  table: string,
  params?: { q?: string; filters?: Record<string, DbTableFilter>; sortBy?: string; sortDir?: 'asc' | 'desc' },
): Promise<Blob> {
  const query: Record<string, unknown> = { format: 'csv' };
  if (params?.q) query.q = params.q;
  if (params?.sortBy) {
    query.sortBy = params.sortBy;
    query.sortDir = params.sortDir ?? 'asc';
  }
  if (params?.filters && Object.keys(params.filters).length > 0) {
    query.filters = JSON.stringify(params.filters);
  }
  const res = await axiosForBackend({
    url: `/api/db-tables/${encodeURIComponent(table)}/export`,
    method: 'GET',
    params: query,
    responseType: 'blob',
  });
  return res.data as Blob;
}

/** 导出全量数据 JSON（供前端生成 Excel） */
export async function exportDbTableJson(
  table: string,
  params?: { q?: string; filters?: Record<string, DbTableFilter> },
): Promise<DbTableExportJsonResponse> {
  const query: Record<string, unknown> = { format: 'json' };
  if (params?.q) query.q = params.q;
  if (params?.filters && Object.keys(params.filters).length > 0) {
    query.filters = JSON.stringify(params.filters);
  }
  const res = await axiosForBackend({
    url: `/api/db-tables/${encodeURIComponent(table)}/export`,
    method: 'GET',
    params: query,
  });
  return res.data as DbTableExportJsonResponse;
}
