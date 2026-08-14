import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateExpenseEstimateRequest,
  UpdateExpenseEstimateRequest,
  ExpenseEstimateListResponse,
  ExpenseEstimateFilterParams,
  ExpenseEstimateSummary,
  ExpenseEstimateOptions,
  ExpenseEstimateMutationResponse,
} from '@shared/api.interface';

function buildParams(filters: ExpenseEstimateFilterParams): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.monthFrom) params.monthFrom = filters.monthFrom;
  if (filters.monthTo) params.monthTo = filters.monthTo;
  for (const key of ['region', 'department', 'subject', 'activity'] as const) {
    const value = filters[key];
    if (Array.isArray(value) && value.length > 0) {
      params[key] = value.join(',');
    }
  }
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.page) params.page = String(filters.page);
  if (filters.pageSize) params.pageSize = String(filters.pageSize);
  return params;
}

export async function getExpenseEstimateList(
  filters: ExpenseEstimateFilterParams = {},
): Promise<ExpenseEstimateListResponse> {
  const res = await axiosForBackend({
    url: '/api/expense-estimates',
    method: 'GET',
    params: buildParams(filters),
  });
  return res.data as ExpenseEstimateListResponse;
}

export async function getExpenseEstimateSummary(
  filters: ExpenseEstimateFilterParams = {},
): Promise<ExpenseEstimateSummary> {
  const res = await axiosForBackend({
    url: '/api/expense-estimates/summary',
    method: 'GET',
    params: buildParams(filters),
  });
  return res.data as ExpenseEstimateSummary;
}

export async function getExpenseEstimateOptions(): Promise<ExpenseEstimateOptions> {
  const res = await axiosForBackend({
    url: '/api/expense-estimates/options',
    method: 'GET',
  });
  return res.data as ExpenseEstimateOptions;
}

export async function createExpenseEstimate(
  data: CreateExpenseEstimateRequest,
): Promise<ExpenseEstimateMutationResponse> {
  const res = await axiosForBackend({
    url: '/api/expense-estimates',
    method: 'POST',
    data,
  });
  return res.data as ExpenseEstimateMutationResponse;
}

export async function updateExpenseEstimate(
  id: string,
  data: UpdateExpenseEstimateRequest,
): Promise<ExpenseEstimateMutationResponse> {
  const res = await axiosForBackend({
    url: `/api/expense-estimates/${id}`,
    method: 'PUT',
    data,
  });
  return res.data as ExpenseEstimateMutationResponse;
}

export async function deleteExpenseEstimate(
  id: string,
): Promise<ExpenseEstimateMutationResponse> {
  const res = await axiosForBackend({
    url: `/api/expense-estimates/${id}`,
    method: 'DELETE',
  });
  return res.data as ExpenseEstimateMutationResponse;
}
