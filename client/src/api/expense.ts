import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ExpenseProfile,
  ExpenseRecord,
  GetExpensesResponse,
  GetExpensesParams,
  UploadExpenseResponse,
  DeleteExpenseResponse,
  GetExpenseUploadRecordResponse,
  ExpiryAnalysisFilters,
  ExpiryAnalysisResult,
  ExpiryDrilldownResult,
  ExpiryOver500StoreDetail,
  ExpiryRankingExportResult,
  OverstockAnalysisFilters,
  OverstockAnalysisResult,
  OverstockAnalysisExportResult,
} from '@shared/api.interface';

export async function getExpenses(params?: GetExpensesParams) {
  const res = await axiosForBackend({
    url: '/api/expenses',
    method: 'GET',
    params,
  });
  return res.data as GetExpensesResponse;
}


export async function uploadExpenses(expenses: ExpenseRecord[], uploadMonths?: string[]) {
  const res = await axiosForBackend({
    url: '/api/expenses',
    method: 'POST',
    data: { expenses, uploadMonths },
  });
  return res.data as UploadExpenseResponse;
}

export async function overwriteExpenses(expenses: ExpenseRecord[], uploadMonths?: string[]) {
  const res = await axiosForBackend({
    url: '/api/expenses/overwrite',
    method: 'POST',
    data: { expenses, uploadMonths },
  });
  return res.data as UploadExpenseResponse;
}

export async function removeAllExpenses() {
  const res = await axiosForBackend({
    url: '/api/expenses',
    method: 'DELETE',
  });
  return res.data as DeleteExpenseResponse;
}

export async function removeExpense(id: string) {
  const res = await axiosForBackend({
    url: `/api/expenses/${id}`,
    method: 'DELETE',
  });
  return res.data as DeleteExpenseResponse;
}

export async function getExpenseUploadRecord() {
  const res = await axiosForBackend({
    url: '/api/expenses/upload-record',
    method: 'GET',
  });
  return res.data as GetExpenseUploadRecordResponse;
}

function buildExpiryParams(filters: ExpiryAnalysisFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) && value.length > 0) {
      params[key] = value.join(',');
    } else if (typeof value === 'string' && value) {
      params[key] = value;
    } else if (typeof value === 'number' && !Number.isNaN(value)) {
      params[key] = String(value);
    }
  }
  return params;
}

export async function getExpiryAnalysis(filters: ExpiryAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/expiry-analysis',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as ExpiryAnalysisResult;
}

export async function getExpiryDrilldown(filters: ExpiryAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/expiry-drilldown',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as ExpiryDrilldownResult;
}

export async function getExpiryOver500StoreDetails(filters: ExpiryAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/expiry-over500-stores',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as ExpiryOver500StoreDetail[];
}

export async function getExpiryRankingExport(filters: ExpiryAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/expiry-ranking-export',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as ExpiryRankingExportResult;
}

export async function getOverstockAnalysis(filters: OverstockAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/overstock-analysis',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as OverstockAnalysisResult;
}

export async function getOverstockAnalysisExport(filters: OverstockAnalysisFilters = {}) {
  const res = await axiosForBackend({
    url: '/api/expenses/overstock-analysis-export',
    method: 'GET',
    params: buildExpiryParams(filters),
  });
  return res.data as OverstockAnalysisExportResult;
}
