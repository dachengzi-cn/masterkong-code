import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CapabilityDimensionMeta,
  CapabilityDimensionUpdateRequest,
  CapabilityDimensionUpdateResponse,
  CapabilityExportParams,
  CapabilityExportResult,
  CapabilityInsightsParams,
  CapabilityInsightsResult,
  CapabilityOptions,
  CapabilityScoreParams,
  CapabilityScoreResult,
} from '@shared/api.interface';

/** 序列化可选参数：跳过空值，数组以逗号连接 */
function buildCapabilityParams(params: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) out[key] = value.join(',');
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/** 下拉选项：可选所别 / 业代（随所别联动）/ 有数据月份 */
export async function getCapabilityOptions(): Promise<CapabilityOptions> {
  const res = await axiosForBackend({
    url: '/api/capability/options',
    method: 'GET',
  });
  return res.data as CapabilityOptions;
}

/** 维度元信息 + 当前权重/阈值/启用状态 */
export async function getCapabilityDimensions(): Promise<CapabilityDimensionMeta[]> {
  const res = await axiosForBackend({
    url: '/api/capability/dimensions',
    method: 'GET',
  });
  return res.data as CapabilityDimensionMeta[];
}

/** 保存维度权重/阈值/启用配置 */
export async function updateCapabilityDimensions(
  body: CapabilityDimensionUpdateRequest,
): Promise<CapabilityDimensionUpdateResponse> {
  const res = await axiosForBackend({
    url: '/api/capability/dimensions',
    method: 'PUT',
    data: body,
  });
  return res.data as CapabilityDimensionUpdateResponse;
}

/** 核心评估：各维度得分 + 总分/战力等级 + 环比/同比对比 */
export async function getCapabilityScore(
  params: CapabilityScoreParams = {},
): Promise<CapabilityScoreResult> {
  const res = await axiosForBackend({
    url: '/api/capability/score',
    method: 'GET',
    params: buildCapabilityParams(params),
  });
  return res.data as CapabilityScoreResult;
}

/** 解读与建议：优势/短板/评估结论/改进建议 */
export async function getCapabilityInsights(
  params: CapabilityInsightsParams = {},
): Promise<CapabilityInsightsResult> {
  const res = await axiosForBackend({
    url: '/api/capability/insights',
    method: 'GET',
    params: buildCapabilityParams(params),
  });
  return res.data as CapabilityInsightsResult;
}

/** 导出评估报告（xlsx 附件直下：维度得分 + 原始指标 + 评估结论） */
export async function exportCapabilityReport(
  params: CapabilityExportParams = {},
): Promise<CapabilityExportResult> {
  const res = await axiosForBackend({
    url: '/api/capability/export',
    method: 'GET',
    params: buildCapabilityParams(params),
    responseType: 'blob',
  });
  const blob = res.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `能力评估报告-${params.region ?? '全部'}-${params.monthFrom ?? ''}${params.monthTo ? `~${params.monthTo}` : ''}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { fileName: a.download, sheetNames: ['维度得分', '原始指标', '评估结论'] };
}
