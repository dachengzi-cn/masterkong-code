import type { AtpPerformanceRow, HeatmapFilterParams } from '@shared/api.interface';

export type ServiceDimension = 'region' | 'tier' | 'salesRep';

export interface ServiceFilters {
  monthFrom?: string;
  monthTo?: string;
  region?: string[];
  tier?: string[];
  salesRep?: string[];
  dealerType?: string[];
  compositeFormat?: string[];
}

export interface ServiceFilterOptions {
  months: string[];
  regions: string[];
  tiers: string[];
  salesReps: string[];
  dealerTypes: string[];
  compositeFormats: string[];
}

export interface ServiceKpiData {
  totalPoints: number;
  paidPoints: number;
  coverageRate: number;
  salesPerPoint: number;
  activeRepCount: number;
  noDealPoints: number;
  paidAmount: number;
  totalStoreSales: number;
  paidStoreSales: number;
  avgPointsPerRep: number;
  noDealRate: number;
}

export interface ServiceTrendItem {
  month: string;
  totalPoints: number;
  paidPoints: number;
  coverageRate: number;
  noDealPoints: number;
}

export interface ServiceDistributionItem {
  name: string;
  totalPoints: number;
  paidPoints: number;
  coverageRate: number;
  totalStoreSales: number;
  noDealPoints: number;
}

export interface ServiceRankingRow {
  dimension: ServiceDimension;
  value: string;
  totalPoints: number;
  paidPoints: number;
  coverageRate: number;
  totalStoreSales: number;
  salesPerPoint: number;
  noDealPoints: number;
  noDealRate: number;
  share: number;
}

export interface ServiceCoverageRow {
  name: string;
  paidPoints: number;
  unpaidPoints: number;
  totalPoints: number;
  coverageRate: number;
}

export interface ServiceDetailRow {
  region: string;
  tier: string;
  salesRep: string;
  totalPoints: number;
  paidPoints: number;
  coverageRate: number;
  paidAmount: number;
  totalStoreSales: number;
  noDealPoints: number;
  feeRatio: number;
}

export type InsightType = 'warning' | 'positive' | 'info' | 'critical';

export interface ServiceInsight {
  type: InsightType;
  title: string;
  description: string;
  metric?: string;
}

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

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('zh-CN');
}

export function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%';
  return `${(value * 100).toFixed(2)}%`;
}

export function toAtpFilters(filters: ServiceFilters): HeatmapFilterParams {
  return {
    region: filters.region,
    tier: filters.tier,
    salesRep: filters.salesRep,
    dealerType: filters.dealerType,
    compositeFormat: filters.compositeFormat,
  };
}

export function hasActiveFilters(filters: ServiceFilters): boolean {
  return Object.values(filters).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  );
}

export const DIMENSION_LABELS: Record<ServiceDimension, string> = {
  region: '所别',
  tier: '阶层',
  salesRep: '业代',
};

export const DIMENSION_OPTIONS: { key: ServiceDimension; label: string }[] = [
  { key: 'region', label: '所别' },
  { key: 'tier', label: '阶层' },
  { key: 'salesRep', label: '业代' },
];

function getRowDimensionValue(
  row: AtpPerformanceRow,
  dimension: ServiceDimension,
): string {
  switch (dimension) {
    case 'region':
      return row.region;
    case 'tier':
      return row.tier;
    case 'salesRep':
      return row.salesRep;
  }
}

export function aggregateRows(
  rows: AtpPerformanceRow[],
): {
  totalPoints: number;
  paidPoints: number;
  paidAmount: number;
  totalStoreSales: number;
  paidStoreSales: number;
  noDealPoints: number;
  feeRatioLe10: number;
  feeRatio10to15: number;
  feeRatioGt15: number;
  feeRatioNoDeal: number;
} {
  return rows.reduce(
    (acc, row) => ({
      totalPoints: acc.totalPoints + row.totalPoints,
      paidPoints: acc.paidPoints + row.paidPoints,
      paidAmount: acc.paidAmount + row.paidAmount,
      totalStoreSales: acc.totalStoreSales + row.totalStoreSales,
      paidStoreSales: acc.paidStoreSales + row.paidStoreSales,
      noDealPoints: acc.noDealPoints + (row.feeRatioNoDeal ?? 0),
      feeRatioLe10: acc.feeRatioLe10 + (row.feeRatioLe10 ?? 0),
      feeRatio10to15: acc.feeRatio10to15 + (row.feeRatio10to15 ?? 0),
      feeRatioGt15: acc.feeRatioGt15 + (row.feeRatioGt15 ?? 0),
      feeRatioNoDeal: acc.feeRatioNoDeal + (row.feeRatioNoDeal ?? 0),
    }),
    {
      totalPoints: 0,
      paidPoints: 0,
      paidAmount: 0,
      totalStoreSales: 0,
      paidStoreSales: 0,
      noDealPoints: 0,
      feeRatioLe10: 0,
      feeRatio10to15: 0,
      feeRatioGt15: 0,
      feeRatioNoDeal: 0,
    },
  );
}

export function buildKpiData(rows: AtpPerformanceRow[]): ServiceKpiData {
  const agg = aggregateRows(rows);
  const repSet = new Set(
    rows.map((r) => r.salesRep).filter((s) => s && s.trim()),
  );
  const coverageRate =
    agg.totalPoints > 0 ? agg.paidPoints / agg.totalPoints : 0;
  const salesPerPoint =
    agg.totalPoints > 0 ? agg.totalStoreSales / agg.totalPoints : 0;
  const noDealRate =
    agg.totalPoints > 0 ? agg.noDealPoints / agg.totalPoints : 0;
  const avgPointsPerRep =
    repSet.size > 0 ? agg.totalPoints / repSet.size : 0;

  return {
    totalPoints: agg.totalPoints,
    paidPoints: agg.paidPoints,
    coverageRate,
    salesPerPoint,
    activeRepCount: repSet.size,
    noDealPoints: agg.noDealPoints,
    paidAmount: agg.paidAmount,
    totalStoreSales: agg.totalStoreSales,
    paidStoreSales: agg.paidStoreSales,
    avgPointsPerRep,
    noDealRate,
  };
}

export function buildDistributionData(
  rows: AtpPerformanceRow[],
  dimension: ServiceDimension,
): ServiceDistributionItem[] {
  const map = new Map<string, ServiceDistributionItem>();

  for (const row of rows) {
    const name = getRowDimensionValue(row, dimension);
    if (!name) continue;

    if (!map.has(name)) {
      map.set(name, {
        name,
        totalPoints: 0,
        paidPoints: 0,
        coverageRate: 0,
        totalStoreSales: 0,
        noDealPoints: 0,
      });
    }
    const item = map.get(name)!;
    item.totalPoints += row.totalPoints;
    item.paidPoints += row.paidPoints;
    item.totalStoreSales += row.totalStoreSales;
    item.noDealPoints += row.feeRatioNoDeal ?? 0;
  }

  const items = Array.from(map.values());
  for (const item of items) {
    item.coverageRate =
      item.totalPoints > 0 ? item.paidPoints / item.totalPoints : 0;
  }

  return items.sort((a, b) => b.totalPoints - a.totalPoints);
}

export function buildRankingData(
  rows: AtpPerformanceRow[],
  dimension: ServiceDimension,
): ServiceRankingRow[] {
  const dist = buildDistributionData(rows, dimension);
  const totalPoints = dist.reduce((s, d) => s + d.totalPoints, 0) || 1;

  return dist
    .map((item) => ({
      dimension,
      value: item.name,
      totalPoints: item.totalPoints,
      paidPoints: item.paidPoints,
      coverageRate: item.coverageRate,
      totalStoreSales: item.totalStoreSales,
      salesPerPoint:
        item.totalPoints > 0
          ? item.totalStoreSales / item.totalPoints
          : 0,
      noDealPoints: item.noDealPoints,
      noDealRate:
        item.totalPoints > 0 ? item.noDealPoints / item.totalPoints : 0,
      share: item.totalPoints / totalPoints,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export function buildCoverageData(
  rows: AtpPerformanceRow[],
  dimension: ServiceDimension = 'region',
): ServiceCoverageRow[] {
  const dist = buildDistributionData(rows, dimension);
  return dist
    .map((item) => ({
      name: item.name,
      paidPoints: item.paidPoints,
      unpaidPoints: item.totalPoints - item.paidPoints,
      totalPoints: item.totalPoints,
      coverageRate: item.coverageRate,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export function buildDetailRows(
  rows: AtpPerformanceRow[],
): ServiceDetailRow[] {
  return rows
    .map((row) => {
      const coverageRate =
        row.totalPoints > 0 ? row.paidPoints / row.totalPoints : 0;
      const feeRatio =
        row.paidStoreSales > 0 ? row.paidAmount / row.paidStoreSales : 0;
      return {
        region: row.region,
        tier: row.tier,
        salesRep: row.salesRep,
        totalPoints: row.totalPoints,
        paidPoints: row.paidPoints,
        coverageRate,
        paidAmount: row.paidAmount,
        totalStoreSales: row.totalStoreSales,
        noDealPoints: row.feeRatioNoDeal ?? 0,
        feeRatio,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export function buildInsights(
  rows: AtpPerformanceRow[],
  kpi: ServiceKpiData,
  trend: ServiceTrendItem[],
): ServiceInsight[] {
  const insights: ServiceInsight[] = [];

  if (rows.length === 0) return insights;

  // 1. Coverage rate insight
  const regionDist = buildDistributionData(rows, 'region');
  const sortedByCoverage = [...regionDist].sort(
    (a, b) => a.coverageRate - b.coverageRate,
  );
  const lowCoverageRegions = sortedByCoverage
    .filter((r) => r.totalPoints >= 10)
    .slice(0, 3);

  if (lowCoverageRegions.length > 0 && kpi.coverageRate > 0) {
    const names = lowCoverageRegions.map((r) => r.name).join('、');
    const lowest = lowCoverageRegions[0];
    insights.push({
      type: lowest.coverageRate < 0.3 ? 'critical' : 'warning',
      title: '覆盖率偏低所别预警',
      description: `${names} 覆盖率明显低于整体水平（${formatPercent(kpi.coverageRate)}），其中 ${lowest.name} 仅 ${formatPercent(lowest.coverageRate)}，建议优先排查付费点下沉不足的原因。`,
      metric: formatPercent(lowest.coverageRate),
    });
  }

  // 2. Overloaded reps insight
  const repDist = buildDistributionData(rows, 'salesRep');
  const avgPoints = kpi.avgPointsPerRep;
  const overloadedReps = repDist
    .filter((r) => r.totalPoints > avgPoints * 1.5 && r.totalPoints >= 20)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 3);

  if (overloadedReps.length > 0 && avgPoints > 0) {
    const names = overloadedReps
      .map((r) => `${r.name}（${formatInt(r.totalPoints)}点）`)
      .join('、');
    insights.push({
      type: 'warning',
      title: '业代服务点数过载',
      description: `${names} 服务点数显著高于均值（${formatInt(avgPoints)}点/人），存在覆盖质量下降风险，建议评估是否需要拆分线路或增加人员配置。`,
      metric: `${formatInt(overloadedReps[0].totalPoints)} 点`,
    });
  }

  // 3. No-deal points insight
  if (kpi.noDealPoints > 0 && kpi.noDealRate > 0.15) {
    const sortedByNoDeal = [...regionDist]
      .filter((r) => r.noDealPoints > 0)
      .sort((a, b) => b.noDealPoints - a.noDealPoints);
    if (sortedByNoDeal.length > 0) {
      const top = sortedByNoDeal[0];
      insights.push({
        type: 'critical',
        title: '未成交点数占比偏高',
        description: `整体未成交点数占比达 ${formatPercent(kpi.noDealRate)}，其中 ${top.name} 未成交 ${formatInt(top.noDealPoints)} 点，建议深入分析该区域门店经营状况与拜访频率。`,
        metric: formatPercent(kpi.noDealRate),
      });
    }
  }

  // 4. High performance insight
  const sortedBySales = [...repDist]
    .filter((r) => r.totalPoints >= 10)
    .sort(
      (a, b) =>
        b.totalStoreSales / b.totalPoints - a.totalStoreSales / a.totalPoints,
    );
  if (sortedBySales.length > 0) {
    const top = sortedBySales[0];
    const topSalesPerPoint = top.totalStoreSales / top.totalPoints;
    if (topSalesPerPoint > kpi.salesPerPoint * 1.3) {
      insights.push({
        type: 'positive',
        title: '点均销额标杆业代',
        description: `${top.name} 点均销额达 ${formatCurrency(topSalesPerPoint)}，为整体均值（${formatCurrency(kpi.salesPerPoint)}）的 ${(topSalesPerPoint / kpi.salesPerPoint).toFixed(1)} 倍，其拜访策略与客户经营经验值得复盘推广。`,
        metric: formatCurrency(topSalesPerPoint),
      });
    }
  }

  // 5. Trend insight
  if (trend.length >= 2) {
    const latest = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const pointsChange = latest.totalPoints - prev.totalPoints;
    const coverageChange = latest.coverageRate - prev.coverageRate;

    if (Math.abs(pointsChange) > 0 || Math.abs(coverageChange) > 0.01) {
      const pointsDir = pointsChange > 0 ? '增长' : '减少';
      const coverageDir = coverageChange > 0 ? '提升' : '下降';
      insights.push({
        type: coverageChange > 0 ? 'positive' : 'info',
        title: '环比趋势变化',
        description: `较上月，服务点数${pointsDir} ${formatInt(Math.abs(pointsChange))} 点，付费覆盖率${coverageDir} ${formatPercent(Math.abs(coverageChange))}，建议持续关注覆盖率变化趋势。`,
        metric: `${pointsDir} ${formatInt(Math.abs(pointsChange))}`,
      });
    }
  }

  // 6. Fee ratio distribution insight
  const agg = aggregateRows(rows);
  const totalPaid = agg.feeRatioLe10 + agg.feeRatio10to15 + agg.feeRatioGt15 + agg.feeRatioNoDeal;
  if (totalPaid > 0) {
    const gt15Rate = agg.feeRatioGt15 / totalPaid;
    if (gt15Rate > 0.2) {
      insights.push({
        type: 'warning',
        title: '高费比点数占比偏高',
        description: `费比>15% 的点数占比达 ${formatPercent(gt15Rate)}，共 ${formatInt(agg.feeRatioGt15)} 点，投入产出比存在失衡风险，建议检视该部分点位的费用投放结构。`,
        metric: formatPercent(gt15Rate),
      });
    }
  }

  return insights;
}
