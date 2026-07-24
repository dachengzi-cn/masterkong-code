import type {
  ExpiryAnalysisResult,
  ExpiryRankingItem,
  AtpPerformanceRow,
} from '@shared/api.interface';
import type {
  ExpenseDimension,
  ExpenseOverviewFilters,
  DistributionItem,
  RankingRow,
  DetailRow,
} from './expense-overview.types';

export function formatMonthStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getMonthLastDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

export function monthRangeToDates(
  monthFrom?: string,
  monthTo?: string,
): { from: string; to: string } {
  const now = new Date();
  const currentMonth = formatMonthStr(now);
  const from = monthFrom ? `${monthFrom}-01` : `${currentMonth}-01`;
  const to = monthTo ? getMonthLastDay(monthTo) : getMonthLastDay(currentMonth);
  return { from, to };
}

export function enumerateMonths(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];

  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

export function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function getExpiryRankByDimension(
  data: ExpiryAnalysisResult,
  dimension: ExpenseDimension,
): ExpiryRankingItem[] {
  switch (dimension) {
    case 'region':
      return data.regionRank;
    case 'tier':
      return data.tierRank;
    case 'dealerType':
      return data.dealerTypeRank;
    case 'business':
      return data.businessRank;
    case 'specification':
      return data.specificationRank;
    default:
      return [];
  }
}

const ATP_DIMENSIONS: ExpenseDimension[] = ['region', 'tier', 'salesRep'];

export function isAtpDimension(dimension: ExpenseDimension): boolean {
  return ATP_DIMENSIONS.includes(dimension);
}

export function aggregateAtpByDimension(
  rows: AtpPerformanceRow[],
  dimension: ExpenseDimension,
): Record<string, number> {
  if (!isAtpDimension(dimension)) return {};

  const result: Record<string, number> = {};
  for (const row of rows) {
    const key =
      dimension === 'salesRep'
        ? row.salesRep
        : dimension === 'region'
          ? row.region
          : row.tier;
    if (!key) continue;
    result[key] = (result[key] ?? 0) + row.paidAmount;
  }
  return result;
}

export function buildDistributionData(
  expiryData: ExpiryAnalysisResult,
  atpRows: AtpPerformanceRow[],
  dimension: ExpenseDimension,
): DistributionItem[] {
  const expiryRanks = getExpiryRankByDimension(expiryData, dimension);
  const atpMap = aggregateAtpByDimension(atpRows, dimension);

  const names = new Set<string>();
  expiryRanks.forEach((r) => names.add(r.value));
  Object.keys(atpMap).forEach((k) => names.add(k));

  const items: DistributionItem[] = Array.from(names).map((name) => {
    const expiryAmount =
      expiryRanks.find((r) => r.value === name)?.amount ?? 0;
    const atpPaidAmount = atpMap[name] ?? 0;
    return {
      name,
      expiryAmount,
      atpPaidAmount,
      totalAmount: expiryAmount + atpPaidAmount,
    };
  });

  return items.sort((a, b) => b.totalAmount - a.totalAmount);
}

export function buildRankingData(
  expiryData: ExpiryAnalysisResult,
  atpRows: AtpPerformanceRow[],
  dimension: ExpenseDimension,
): RankingRow[] {
  const expiryRanks = getExpiryRankByDimension(expiryData, dimension);
  const atpMap = aggregateAtpByDimension(atpRows, dimension);

  const names = new Set<string>();
  expiryRanks.forEach((r) => names.add(r.value));
  Object.keys(atpMap).forEach((k) => names.add(k));

  const rows: RankingRow[] = Array.from(names).map((value) => {
    const expiryRank = expiryRanks.find((r) => r.value === value);
    const expiryAmount = expiryRank?.amount ?? 0;
    const atpPaidAmount = atpMap[value] ?? 0;
    const totalAmount = expiryAmount + atpPaidAmount;
    return {
      dimension,
      value,
      expiryAmount,
      atpPaidAmount,
      totalAmount,
      recordCount: expiryRank?.recordCount ?? 0,
      share: 0,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.totalAmount, 0) || 1;
  rows.forEach((r) => {
    r.share = r.totalAmount / total;
  });

  return rows.sort((a, b) => b.totalAmount - a.totalAmount);
}

export function buildDetailRows(
  expiryData: ExpiryAnalysisResult,
  atpRows: AtpPerformanceRow[],
): DetailRow[] {
  const map = new Map<string, DetailRow>();

  for (const rank of expiryData.regionRank) {
    const key = rank.value;
    map.set(key, {
      region: rank.value,
      expiryAmount: rank.amount,
      atpPaidAmount: 0,
      totalAmount: rank.amount,
    });
  }

  for (const atpRow of atpRows) {
    const existing = map.get(atpRow.region);
    if (existing) {
      existing.atpPaidAmount += atpRow.paidAmount;
      existing.totalAmount = existing.expiryAmount + existing.atpPaidAmount;
    } else {
      map.set(atpRow.region, {
        region: atpRow.region,
        expiryAmount: 0,
        atpPaidAmount: atpRow.paidAmount,
        totalAmount: atpRow.paidAmount,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );
}

export function hasActiveFilters(filters: ExpenseOverviewFilters): boolean {
  return Object.values(filters).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  );
}

export const DIMENSION_LABELS: Record<ExpenseDimension, string> = {
  region: '所别',
  tier: '阶层',
  dealerType: '形态',
  business: '业务',
  specification: '规格',
  salesRep: '业代',
};
