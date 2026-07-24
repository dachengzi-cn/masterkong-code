import type {
  ExpiryAnalysisFilters,
  HeatmapFilterParams,
  OverstockAnalysisFilters,
} from '@shared/api.interface';

export type ExpenseDimension =
  | 'region'
  | 'tier'
  | 'dealerType'
  | 'business'
  | 'specification'
  | 'salesRep';

export interface ExpenseOverviewFilters {
  monthFrom?: string;
  monthTo?: string;
  region?: string[];
  tier?: string[];
  dealerType?: string[];
  specification?: string[];
  business?: string[];
  salesRep?: string[];
  compositeFormat?: string[];
}

export interface CombinedFilterOptions {
  months: string[];
  regions: string[];
  tiers: string[];
  dealerTypes: string[];
  specifications: string[];
  businesses: string[];
  salesReps: string[];
  compositeFormats: string[];
}

export interface AtpMonthlyTrendItem {
  month: string;
  paidAmount: number;
}

export interface DistributionItem {
  name: string;
  expiryAmount: number;
  atpPaidAmount: number;
  totalAmount: number;
}

export interface RankingRow {
  dimension: string;
  value: string;
  expiryAmount: number;
  atpPaidAmount: number;
  totalAmount: number;
  recordCount: number;
  share: number;
}

export interface DetailRow {
  region: string;
  tier?: string;
  dealerType?: string;
  business?: string;
  specification?: string;
  salesRep?: string;
  expiryAmount: number;
  atpPaidAmount: number;
  totalAmount: number;
}

export function toExpiryFilters(
  filters: ExpenseOverviewFilters,
): ExpiryAnalysisFilters {
  return {
    monthFrom: filters.monthFrom,
    monthTo: filters.monthTo,
    region: filters.region,
    tier: filters.tier,
    dealerType: filters.dealerType,
    business: filters.business,
    specification: filters.specification,
  };
}

export function toAtpFilters(
  filters: ExpenseOverviewFilters,
): HeatmapFilterParams {
  return {
    region: filters.region,
    tier: filters.tier,
    dealerType: filters.dealerType,
    salesRep: filters.salesRep,
    specification: filters.specification,
    compositeFormat: filters.compositeFormat,
  };
}

export function toOverstockFilters(
  filters: ExpenseOverviewFilters,
): OverstockAnalysisFilters {
  return {
    monthFrom: filters.monthFrom,
    monthTo: filters.monthTo,
    region: filters.region,
    tier: filters.tier,
    dealerType: filters.dealerType,
    business: filters.business,
    specification: filters.specification,
    salesRep: filters.salesRep,
  };
}
