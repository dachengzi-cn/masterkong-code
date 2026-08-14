import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import * as XLSX from 'xlsx-js-style';
import type {
  GenerateReportRequest,
  GenerateReportResponse,
  GetReportsParams,
  GetReportsResponse,
  ReportRecord,
} from '@shared/api.interface';

/** 报表列表刷新事件名（生成报表后全局下载按钮需刷新） */
export const REPORT_GENERATED_EVENT = 'report-generated';
export const REPORT_LIST_CHANGED_EVENT = 'report-list-changed';

export function notifyReportListChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REPORT_LIST_CHANGED_EVENT));
}

/**
 * 从 axios 错误中提取服务端返回的可读错误信息，
 * 避免前端只显示笼统的 "Request failed with status code 500"。
 */
function extractErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === 'object') {
    const msg = (data as { error?: { message?: unknown } })?.error?.message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return err instanceof Error ? err.message : String(err);
}

/** 生成报表（后端生成 Excel 并持久化，可在全局下载按钮中查看/下载） */
export async function generateReport(request: GenerateReportRequest) {
  try {
    const res = await axiosForBackend({
      url: '/api/reports/generate',
      method: 'POST',
      data: request,
    });
    notifyReportListChanged();
    return res.data as GenerateReportResponse;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

/** 报表列表 */
export async function getReports(params: GetReportsParams = {}) {
  try {
    const res = await axiosForBackend({
      url: '/api/reports',
      method: 'GET',
      // 报表列表是高频变化资源，禁用 HTTP 缓存，避免浏览器返回过期的空列表
      headers: { 'Cache-Control': 'no-cache' },
      params: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        ...(params.type ? { type: params.type } : {}),
      },
    });
    return res.data as GetReportsResponse;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

/** 删除报表（文件 + 记录） */
export async function deleteReport(id: string) {
  try {
    const res = await axiosForBackend({
      url: `/api/reports/${id}`,
      method: 'DELETE',
    });
    notifyReportListChanged();
    return res.data as { success: boolean };
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

/** 删除全部报表（文件 + 记录） */
export async function deleteAllReports() {
  try {
    const res = await axiosForBackend({
      url: '/api/reports',
      method: 'DELETE',
    });
    notifyReportListChanged();
    return res.data as { success: boolean; deletedCount: number };
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export function getReportDownloadUrl(id: string) {
  return `/api/reports/${id}/download`;
}

export function getReportPreviewUrl(id: string) {
  return `/api/reports/${id}/preview`;
}

/** 下载报表到本地 */
export async function downloadReportFile(report: ReportRecord) {
  try {
    const res = await axiosForBackend({
      url: getReportDownloadUrl(report.id),
      method: 'GET',
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.fileName || 'report.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

/**
 * 在线查看报表。
 *
 * 浏览器原生不支持在标签页内渲染 xlsx（即使 Content-Disposition: inline，
 * 也会因无内置查看器而自动下载）。因此这里在前端用 xlsx-js-style 解析
 * 报表文件，返回每个 sheet 的 HTML 表格，供弹窗渲染，保证跨浏览器一致。
 */
export interface ReportSheetPreview {
  name: string;
  html: string;
}

export interface ReportWorkbookPreview {
  fileName: string;
  sheets: ReportSheetPreview[];
}

/** 预览最多渲染的行数（超出部分提示下载查看，避免 DOM 过大卡顿） */
const MAX_PREVIEW_ROWS = 500;

export async function fetchReportWorkbook(
  report: ReportRecord,
): Promise<ReportWorkbookPreview> {
  const res = await axiosForBackend({
    url: getReportPreviewUrl(report.id),
    method: 'GET',
    responseType: 'blob',
  });
  const arrayBuffer = await (res.data as Blob).arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const sheets: ReportSheetPreview[] = (wb.SheetNames || []).map((name) => {
    const ws = wb.Sheets[name];
    if (!ws) {
      return { name, html: '' };
    }
    let html = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
    // 超大表格截断，仅展示前 MAX_PREVIEW_ROWS 行
    const parts = html.split('<tr');
    if (parts.length - 1 > MAX_PREVIEW_ROWS) {
      const kept = parts.slice(0, MAX_PREVIEW_ROWS + 1).join('<tr');
      html = `${kept}<tr><td colspan="99" style="padding:10px;text-align:center;color:#8a93a6;font-size:12px;">仅展示前 ${MAX_PREVIEW_ROWS} 行，完整数据请下载报表查看</td></tr>`;
    }
    return { name, html };
  });

  return { fileName: report.fileName || 'report.xlsx', sheets };
}
