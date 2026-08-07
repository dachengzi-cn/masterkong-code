import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  GetDatasetsResponse,
  GetDatasetsParams,
  CreateDatasetRequest,
  CreateDatasetResponse,
  AppendRecordsRequest,
  AppendRecordsResponse,
  DeleteDatasetResponse,
  DatasetDetail,
  KpiData,
  TrendChartData,
  BarChartData,
  PieChartData,
  ChartFilterParams,
  HeatmapResponse,
  HeatmapFilterParams,
  TimeGranularity,
  GetUnconvertedStoresResponse,
  BrandSpecStatsResponse,
  BrandSpecMonthlyStatsResponse,
  SalesRepDrilldownResponse,
  SystemStatusResponse,
  CheckDuplicatesRequest,
  CheckDuplicatesResponse,
  DatasetSpecOptions,
  AtpPerformanceResponse,
  AtpPerformanceStoreDetailResponse,
  AtpAvailableMonthsResponse,
  AtpThresholdParams,
} from '@shared/api.interface';

export async function getDatasets(params?: GetDatasetsParams) {
  const res = await axiosForBackend({
    url: '/api/datasets',
    method: 'GET',
    params,
  });
  return res.data as GetDatasetsResponse;
}

export async function createDataset(data: CreateDatasetRequest) {
  const res = await axiosForBackend({
    url: '/api/datasets',
    method: 'POST',
    data,
  });
  return res.data as CreateDatasetResponse;
}

export async function checkDuplicates(data: CheckDuplicatesRequest) {
  const res = await axiosForBackend({
    url: '/api/datasets/check-duplicates',
    method: 'POST',
    data,
  });
  return res.data as CheckDuplicatesResponse;
}

export async function mergeByMonths(data: CreateDatasetRequest) {
  const res = await axiosForBackend({
    url: '/api/datasets/merge-by-months',
    method: 'POST',
    data,
  });
  return res.data as CreateDatasetResponse;
}

export async function appendRecords(id: string, data: AppendRecordsRequest) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/records`,
    method: 'POST',
    data,
  });
  return res.data as AppendRecordsResponse;
}

export async function deleteDataset(id: string) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}`,
    method: 'DELETE',
  });
  return res.data as DeleteDatasetResponse;
}

export async function getDatasetDetail(id: string) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}`,
    method: 'GET',
  });
  return res.data as DatasetDetail;
}

export async function getDatasetKpis(id: string, params?: ChartFilterParams) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/kpis`,
    method: 'GET',
    params,
  });
  return res.data as KpiData;
}

export async function getTrendChart(id: string, params?: ChartFilterParams) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/charts/trend`,
    method: 'GET',
    params,
  });
  return res.data as TrendChartData;
}

export async function getBarChart(id: string, params?: ChartFilterParams) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/charts/bar`,
    method: 'GET',
    params,
  });
  return res.data as BarChartData;
}

export async function getPieChart(id: string, params?: ChartFilterParams) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/charts/pie`,
    method: 'GET',
    params,
  });
  return res.data as PieChartData;
}

export async function getHeatmapData(
  id: string,
  dateFrom: string,
  dateTo: string,
  granularity: TimeGranularity,
  filters?: HeatmapFilterParams,
) {
  const safeId = String(id);
  const params: Record<string, string | number> = { dateFrom, dateTo, granularity };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'mode') continue;
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
    if (filters.mode) {
      params.mode = filters.mode;
    }
  }
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/heatmap`,
    method: 'GET',
    params,
  });
  return res.data as HeatmapResponse;
}

export async function getUnconvertedStores(
  id: string,
  dateFrom: string,
  dateTo: string,
  filters?: HeatmapFilterParams,
) {
  const safeId = String(id);
  const params: Record<string, string | number> = { dateFrom, dateTo };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
  }
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/unconverted-stores`,
    method: 'GET',
    params,
  });
  return res.data as GetUnconvertedStoresResponse;
}

export async function getBrandSpecStats(
  id: string,
  dateFrom: string,
  dateTo: string,
  filters?: HeatmapFilterParams,
) {
  const safeId = String(id);
  const params: Record<string, string | number> = { dateFrom, dateTo };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
  }
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/brand-spec-stats`,
    method: 'GET',
    params,
  });
  return res.data as BrandSpecStatsResponse;
}

export async function getBrandSpecMonthlyStats(
  id: string,
  salesRep: string,
  region: string,
  tier: string,
  filters?: HeatmapFilterParams,
) {
  const safeId = String(id);
  const params: Record<string, string> = { salesRep, region, tier };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'mode') continue;
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
  }
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/brand-spec-monthly`,
    method: 'GET',
    params,
  });
  return res.data as BrandSpecMonthlyStatsResponse;
}

export async function getSalesRepDrilldown(
  id: string,
  salesRep: string,
  region: string,
  tier: string,
  dateFrom: string,
  dateTo: string,
) {
  const safeId = String(id);
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/sales-rep-drilldown`,
    method: 'GET',
    params: { salesRep, region, tier, dateFrom, dateTo },
  });
  return res.data as SalesRepDrilldownResponse;
}

export async function getSystemStatus() {
  const res = await axiosForBackend({
    url: '/api/datasets/system-status',
    method: 'GET',
  });
  return res.data as SystemStatusResponse;
}

export async function getSpecOptions(
  id: string,
  sheetTypes?: string[],
  brands?: string[],
) {
  const safeId = String(id);
  const params: Record<string, string> = {};
  if (sheetTypes && sheetTypes.length > 0) params.sheetType = sheetTypes.join(',');
  if (brands && brands.length > 0) params.brand = brands.join(',');
  const res = await axiosForBackend({
    url: `/api/datasets/${safeId}/spec-options`,
    method: 'GET',
    params,
  });
  return res.data as DatasetSpecOptions;
}

export async function getAllBrandSpecOptions(): Promise<{ brands: string[]; specifications: string[] }> {
  const res = await axiosForBackend({
    url: '/api/datasets/brand-spec-options',
    method: 'GET',
  });
  return res.data as { brands: string[]; specifications: string[] };
}

export async function getAtpAvailableMonths(): Promise<AtpAvailableMonthsResponse> {
  const res = await axiosForBackend({
    url: '/api/datasets/atp-months',
    method: 'GET',
  });
  return res.data as AtpAvailableMonthsResponse;
}

export async function getAtpPerformance(
  dateFrom: string,
  dateTo: string,
  granularity: TimeGranularity,
  filters?: HeatmapFilterParams,
  thresholds?: AtpThresholdParams,
) {
  const params: Record<string, string | number> = { dateFrom, dateTo, granularity };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
  }
  if (thresholds) {
    for (const [key, val] of Object.entries(thresholds)) {
      if (val !== undefined && val !== null) {
        params[key] = val;
      }
    }
  }
  const res = await axiosForBackend({
    url: '/api/datasets/atp-performance',
    method: 'GET',
    params,
  });
  return res.data as AtpPerformanceResponse;
}

export async function getAtpPerformanceStoreDetail(
  dateFrom: string,
  dateTo: string,
  granularity: TimeGranularity,
  filters?: HeatmapFilterParams,
  thresholds?: AtpThresholdParams,
) {
  const params: Record<string, string | number> = { dateFrom, dateTo, granularity };
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val) && val.length > 0) {
        params[key] = val.join(',');
      } else if (typeof val === 'string' && val) {
        params[key] = val;
      }
    }
  }
  if (thresholds) {
    for (const [key, val] of Object.entries(thresholds)) {
      if (val !== undefined && val !== null) {
        params[key] = val;
      }
    }
  }
  const res = await axiosForBackend({
    url: '/api/datasets/atp-performance-store-detail',
    method: 'GET',
    params,
  });
  return res.data as AtpPerformanceStoreDetailResponse;
}


