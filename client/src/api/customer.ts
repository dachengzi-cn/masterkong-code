import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CustomerSummary,
  UploadCustomerRequest,
  UploadCustomerResponse,
  GetCustomersParams,
  GetCustomersResponse,
  DeleteCustomerResponse,
  GetCustomerDimensionsResponse,
  GetClassificationResponse,
  FilterOptions,
  FormatDrilldownResponse,
  GetCustomerUploadRecordResponse,
} from '@shared/api.interface';

export async function getCustomerSummary(): Promise<CustomerSummary> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers/summary',
      method: 'GET',
    });
    return res.data as CustomerSummary;
  } catch (e) {
    logger.error('获取客户统计失败:', e);
    throw e;
  }
}

export async function getCustomers(params?: GetCustomersParams): Promise<GetCustomersResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers',
      method: 'GET',
      params,
    });
    return res.data as GetCustomersResponse;
  } catch (e) {
    logger.error('获取客户列表失败:', e);
    throw e;
  }
}

export async function uploadCustomers(
  data: UploadCustomerRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadCustomerResponse> {
  const CHUNK = 50;
  const all = data.customers;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    try {
      const res = await axiosForBackend({
        url: '/api/customers',
        method: 'POST',
        data: { customers: chunk },
      });
      const r = res.data as UploadCustomerResponse;
      inserted += r.inserted;
      updated += r.updated;
    } catch (e) {
      const errorMsg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && (e as any).message
            ? (e as any).message
            : '未知错误';
      const detail =
        e &&
        typeof e === 'object' &&
        (e as any).response &&
        (e as any).response.data
          ? (e as any).response.data.error?.message || errorMsg
          : errorMsg;
      logger.error(`上传客户资料失败 (chunk start=${i} size=${chunk.length}): ${detail}`);
      throw new Error(detail);
    }
    onProgress?.(Math.min(i + CHUNK, all.length), all.length);
  }

  return { inserted, updated, total: all.length };
}

export async function removeAllCustomers(): Promise<DeleteCustomerResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers',
      method: 'DELETE',
    });
    return res.data as DeleteCustomerResponse;
  } catch (e) {
    logger.error('清空客户资料失败:', e);
    throw e;
  }
}

export async function removeCustomer(id: string): Promise<DeleteCustomerResponse> {
  try {
    const res = await axiosForBackend({
      url: `/api/customers/${id}`,
      method: 'DELETE',
    });
    return res.data as DeleteCustomerResponse;
  } catch (e) {
    logger.error('删除客户资料失败:', e);
    throw e;
  }
}

export async function getCustomerDimensions(datasetId?: string): Promise<GetCustomerDimensionsResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers/dimensions',
      method: 'GET',
      params: datasetId ? { datasetId } : {},
    });
    return res.data as GetCustomerDimensionsResponse;
  } catch (e) {
    logger.error('获取客户维度失败:', e);
    throw e;
  }
}

export async function getCustomerClassification(): Promise<GetClassificationResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers/classification',
      method: 'GET',
    });
    return res.data as GetClassificationResponse;
  } catch (e) {
    logger.error('获取客户分类汇总失败:', e);
    throw e;
  }
}

export async function getFormatDrilldown(region: string): Promise<FormatDrilldownResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers/classification/drilldown',
      method: 'GET',
      params: { region },
    });
    return res.data as FormatDrilldownResponse;
  } catch (e) {
    logger.error('获取形态下钻数据失败:', e);
    throw e;
  }
}

export async function getFilterOptions(region?: string[]): Promise<FilterOptions> {
  const params: Record<string, string> = {};
  if (region && region.length > 0) params.region = region.join(',');
  const res = await axiosForBackend({
    url: '/api/customers/filter-options',
    method: 'GET',
    params,
  });
  return res.data as FilterOptions;
}

export async function getLatestUploadRecord(): Promise<GetCustomerUploadRecordResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/customers/upload-record',
      method: 'GET',
    });
    return res.data as GetCustomerUploadRecordResponse;
  } catch (e) {
    logger.error('获取客户资料上传记录失败:', e);
    return null;
  }
}
