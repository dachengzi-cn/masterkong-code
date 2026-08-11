import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import CountUp from 'react-countup';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/business-ui/kpi-card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { datasetApi } from '@client/src/api/index';
import { DEFAULT_SHEET_TYPES } from './FilterBar';
import type { DateRangeValue } from './FilterBar';
import type {
  HeatmapRow, HeatmapColumnHeader, HeatmapFilterParams,
} from '@shared/api.interface';

// ============ 工具函数 ============

const formatDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatPercent = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (v === 0) return '-';
  return `${Math.round(v * 100)}%`;
};

// 年月多选调色板（多选叠加时区分曲线颜色）
const MONTH_COLORS = [
  'hsl(217, 85%, 52%)',
  'hsl(152, 60%, 42%)',
  'hsl(38, 85%, 48%)',
  'hsl(262, 80%, 58%)',
  'hsl(4, 72%, 52%)',
  'hsl(200, 90%, 45%)',
  'hsl(330, 80%, 55%)',
  'hsl(30, 90%, 50%)',
];

interface MonthOption {
  year: number;
  month: number;
}

const monthKey = (m: MonthOption): string => `${m.year}-${String(m.month).padStart(2, '0')}`;
const monthLabel = (m: MonthOption): string => `${m.year}年${String(m.month).padStart(2, '0')}月`;

/** 生成候选年月（当月与近期月份在前，未来月份置后） */
function buildMonthOptions(yearOptions: number[]): MonthOption[] {
  const opts: MonthOption[] = [];
  for (const y of yearOptions) {
    for (let m = 1; m <= 12; m++) opts.push({ year: y, month: m });
  }
  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + (now.getMonth()); // month-1 → 0 基
  return opts.sort((a, b) => {
    const ka = a.year * 12 + (a.month - 1);
    const kb = b.year * 12 + (b.month - 1);
    const isFutureA = ka > nowIdx;
    const isFutureB = kb > nowIdx;
    // 当月及过去月份在前（近期在前），未来月份置后
    if (isFutureA !== isFutureB) return isFutureA ? 1 : -1;
    return kb - ka;
  });
}

// 聚合行：从原始数据行计算合计行（复用 SalesRepHeatmap 逻辑）
function aggregateRows(
  rows: HeatmapRow[],
  columns: HeatmapColumnHeader[],
  rowType: 'data' | 'tier' | 'region' | 'total',
  region: string,
  tier: string,
  salesRep: string,
  isDailyMode?: boolean,
): HeatmapRow {
  const servicePoints = rows.reduce((s, r) => s + (r.servicePoints ?? 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.totalOrders ?? 0), 0);
  const dailyData = columns.map((col, ci) => {
    const stores = rows.reduce((s, r) => s + (r.dailyData?.[ci]?.stores ?? 0), 0);
    if (isDailyMode) {
      const routeStores = rows.reduce((s, r) => s + (r.dailyData?.[ci]?.routeStores ?? 0), 0);
      const orders = rows.reduce((s, r) => s + (r.dailyData?.[ci]?.orders ?? 0), 0);
      if (routeStores === 0) {
        return { day: col.index, label: col.label, rate: null, stores: null, routeStores: null, orders: null };
      }
      return { day: col.index, label: col.label, rate: stores / routeStores, stores: stores > 0 ? stores : null, routeStores, orders };
    }
    const hasAnyData = rows.some((r) => r.dailyData?.[ci]?.stores !== null);
    const rate = hasAnyData && servicePoints > 0 ? stores / servicePoints : null;
    return { day: col.index, label: col.label, rate, stores: hasAnyData && stores > 0 ? stores : null };
  });
  return { salesRep, region, tier, servicePoints, totalOrders, dailyData, rowType };
}

function buildTotals(rows: HeatmapRow[], columns: HeatmapColumnHeader[], isDailyMode?: boolean) {
  if (rows.length === 0) {
    return { total: null as HeatmapRow | null, regions: [] as HeatmapRow[], tiers: [] as HeatmapRow[] };
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.salesRep.localeCompare(b.salesRep);
  });

  const regions: HeatmapRow[] = [];
  const tiers: HeatmapRow[] = [];
  let currentRegion = '';
  let regionRows: HeatmapRow[] = [];

  const flushRegion = () => {
    if (regionRows.length === 0) return;
    const region = regionRows[0].region;
    const tierGroups = new Map<string, HeatmapRow[]>();
    for (const r of regionRows) {
      const list = tierGroups.get(r.tier) ?? [];
      list.push(r);
      tierGroups.set(r.tier, list);
    }
    for (const [tier, tierRows] of tierGroups) {
      tiers.push(aggregateRows(tierRows, columns, 'tier', region, tier, `${tier}合计`, isDailyMode));
    }
    regions.push(aggregateRows(regionRows, columns, 'region', region, '', `${region}合计`, isDailyMode));
    regionRows = [];
  };

  for (const row of sorted) {
    if (row.region !== currentRegion) {
      flushRegion();
      currentRegion = row.region;
    }
    regionRows.push(row);
  }
  flushRegion();

  const total = aggregateRows(sorted, columns, 'total', '', '', '部别合计', isDailyMode);
  return { total, regions, tiers };
}

// ============ 数据 Hook ============

interface OverviewData {
  cumulative: { total: HeatmapRow | null; regions: HeatmapRow[]; tiers: HeatmapRow[]; columns: HeatmapColumnHeader[] };
  daily: { total: HeatmapRow | null; regions: HeatmapRow[]; tiers: HeatmapRow[]; columns: HeatmapColumnHeader[] };
}

function useOverviewData(datasetId: string | undefined, dateFrom: string, dateTo: string) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!datasetId) { setLoading(false); setData(null); return; }
    setLoading(true);
    setError(null);
    try {
      const baseFilters: HeatmapFilterParams = { sheetType: DEFAULT_SHEET_TYPES };
      const [cumRes, dailyRes] = await Promise.all([
        datasetApi.getHeatmapData(datasetId, dateFrom, dateTo, 'day', { ...baseFilters, mode: 'cumulative' }),
        datasetApi.getHeatmapData(datasetId, dateFrom, dateTo, 'day', { ...baseFilters, mode: 'daily' }),
      ]);
      const cumTotals = buildTotals(cumRes.rows, cumRes.columns, false);
      const dailyTotals = buildTotals(dailyRes.rows, dailyRes.columns, true);
      setData({
        cumulative: { ...cumTotals, columns: cumRes.columns },
        daily: { ...dailyTotals, columns: dailyRes.columns },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load overview:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [datasetId, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refetch: fetchData };
}

/**
 * 按多个年月拉取总览数据（带缓存），返回 Map<monthKey, OverviewData>
 * 同一月份只请求一次，后续直接命中缓存
 */
function useOverviewByMonths(
  datasetId: string | undefined,
  months: MonthOption[],
) {
  const [cache, setCache] = useState<Map<string, OverviewData>>(new Map());
  const [loadingMap, setLoadingMap] = useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = useState<Map<string, string>>(new Map());
  // 已发起请求的月份集合（含失败），避免重复请求
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!datasetId) return;

    const unique = Array.from(new Map(months.map((m) => [monthKey(m), m])).values());
    const pending = unique.filter((m) => !requestedRef.current.has(monthKey(m)));
    if (pending.length === 0) return;

    for (const m of pending) requestedRef.current.add(monthKey(m));
    setLoadingMap((prev) => {
      const next = new Set(prev);
      for (const m of pending) next.add(monthKey(m));
      return next;
    });

    for (const m of pending) {
      const k = monthKey(m);
      const y = m.year;
      const mm = m.month;
      (async () => {
        try {
          const from = formatDateStr(new Date(y, mm - 1, 1));
          const to = formatDateStr(new Date(y, mm, 0));
          const baseFilters: HeatmapFilterParams = { sheetType: DEFAULT_SHEET_TYPES };
          const [cumRes, dailyRes] = await Promise.all([
            datasetApi.getHeatmapData(datasetId, from, to, 'day', { ...baseFilters, mode: 'cumulative' }),
            datasetApi.getHeatmapData(datasetId, from, to, 'day', { ...baseFilters, mode: 'daily' }),
          ]);
          const cumTotals = buildTotals(cumRes.rows, cumRes.columns, false);
          const dailyTotals = buildTotals(dailyRes.rows, dailyRes.columns, true);
          const d: OverviewData = {
            cumulative: { ...cumTotals, columns: cumRes.columns },
            daily: { ...dailyTotals, columns: dailyRes.columns },
          };
          setCache((prev) => {
            const next = new Map(prev);
            next.set(k, d);
            return next;
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to load overview for ${k}:`, err);
          setErrorMap((prev) => {
            const next = new Map(prev);
            next.set(k, msg);
            return next;
          });
        } finally {
          setLoadingMap((prev) => {
            const next = new Set(prev);
            next.delete(k);
            return next;
          });
        }
      })();
    }
    // 依赖 datasetId / months 变化时重新评估（requestedRef 防止重复请求）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, months]);

  return { cache, loadingMap, errorMap };
}

// ============ 趋势折线图 ============

interface TrendSeries {
  label: string;
  color: string;
  data: Array<{ label: string; rate: number | null }>;
}

interface TrendChartProps {
  title: string;
  series: TrendSeries[];
  loading: boolean;
  /** 右上角自定义区（年月多选筛选器） */
  children?: React.ReactNode;
}

const TrendChart: React.FC<TrendChartProps> = ({ title, series, loading, children }) => {
  // 统一 X 轴标签：heatmap 的每月1号 label 为 "M/1" 格式（如 "7/1"、"8/1"），
  // 多序列叠加时需归一化为纯日期数字（"1"），避免 "7/1" 被当作 7 与 8 之间的点
  const normalizeLabel = useCallback((l: string): string => {
    const slash = l.indexOf('/');
    return slash >= 0 ? l.slice(slash + 1) : l;
  }, []);

  // 统一 X 轴：所有序列 label 并集（按数字排序）
  const labels = useMemo(() => {
    const set = new Set<string>();
    series.forEach((s) => s.data.forEach((d) => set.add(normalizeLabel(d.label))));
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'zh-CN', { numeric: true });
    });
  }, [series, normalizeLabel]);

  const chartData = useMemo(() => {
    return labels.map((l) => {
      const row: Record<string, string | number | null> = { label: l };
      for (const s of series) {
        const found = s.data.find((d) => normalizeLabel(d.label) === l);
        row[s.label] = found && found.rate != null ? Math.round(found.rate * 10000) / 100 : null;
      }
      return row;
    });
  }, [labels, series, normalizeLabel]);

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-[12px] font-semibold text-foreground tracking-wide shrink-0">{title}</p>
        {children}
      </div>
      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : chartData.length === 0 || series.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无趋势数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(220, 12%, 52%)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(220, 12%, 52%)' }} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 2, border: '1px solid hsl(220, 15%, 88%)' }}
              formatter={(v: number | null, name) => [v == null ? '-' : `${v}%`, name]}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Line key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ============ 所别对比表格 ============

interface RegionMonthData {
  label: string;
  color: string;
  cumulativeRegions: HeatmapRow[];
  dailyRegions: HeatmapRow[];
}

interface RegionCompareTableProps {
  months: RegionMonthData[];
  loading: boolean;
  children?: React.ReactNode;
}

const RegionCompareTable: React.FC<RegionCompareTableProps> = ({ months, loading, children }) => {
  // 累计成交率取区间内最后一天有效 rate；当日成交率跨日累加
  const getOverallRate = (row: HeatmapRow, isDaily: boolean): number | null => {
    if (isDaily) {
      const totalStores = row.dailyData?.reduce((s, d) => s + (d.stores ?? 0), 0) ?? 0;
      const totalRoute = row.dailyData?.reduce((s, d) => s + (d.routeStores ?? 0), 0) ?? 0;
      return totalRoute > 0 ? totalStores / totalRoute : null;
    }
    if (!row.dailyData?.length) return null;
    for (let i = row.dailyData.length - 1; i >= 0; i--) {
      const rate = row.dailyData[i].rate;
      if (rate != null) return rate;
    }
    return null;
  };

  const single = months.length === 1;
  const monthData = months[0];

  const dailyMap = useMemo(() => {
    const m = new Map<string, HeatmapRow>();
    for (const r of monthData?.dailyRegions ?? []) m.set(r.region, r);
    return m;
  }, [monthData]);

  const allRegions = useMemo(() => {
    const set = new Set<string>();
    months.forEach((mo) => mo.cumulativeRegions.forEach((r) => set.add(r.region)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [months]);

  const rows = useMemo(() => {
    return allRegions.map((region) => {
      const entry: Record<string, string | number | null> = { region };
      if (single && monthData) {
        const cum = monthData.cumulativeRegions.find((r) => r.region === region);
        const daily = dailyMap.get(region);
        entry.servicePoints = cum?.servicePoints ?? 0;
        entry.cumRate = cum ? getOverallRate(cum, false) : null;
        entry.dailyRate = daily ? getOverallRate(daily, true) : null;
        entry.diff = entry.cumRate != null && entry.dailyRate != null
          ? (entry.dailyRate as number) - (entry.cumRate as number)
          : null;
      } else {
        for (const mo of months) {
          const cum = mo.cumulativeRegions.find((r) => r.region === region);
          entry[mo.label] = cum ? getOverallRate(cum, false) : null;
        }
      }
      return entry;
    });
  }, [allRegions, months, single, monthData, dailyMap]);

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-accent/30 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-foreground tracking-wide shrink-0">所别双模式对比</p>
        {children}
      </div>
      {loading ? (
        <div className="p-5 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无所别对比数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">所别</th>
                {single ? (
                  <>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">服务点数</th>
                    <th className="px-4 py-2 text-right font-medium text-foreground">累计成交率</th>
                    <th className="px-4 py-2 text-right font-medium text-foreground">当日成交率</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">差值（当日-累计）</th>
                  </>
                ) : (
                  months.map((mo) => (
                    <th key={mo.label} className="px-4 py-2 text-right font-medium text-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: mo.color }} />
                        {mo.label}累计成交率
                      </span>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r.region)} className={`border-b border-border/60 hover:bg-accent/5 transition-colors duration-150 ease-out ${i % 2 === 1 ? 'bg-accent/5' : ''}`}>
                  <td className="px-4 py-2 text-foreground font-medium whitespace-nowrap">{String(r.region)}</td>
                  {single ? (
                    <>
                      <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{String(r.servicePoints)}</td>
                      <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{formatPercent(r.cumRate as number | null)}</td>
                      <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{formatPercent(r.dailyRate as number | null)}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${r.diff == null ? 'text-muted-foreground' : (r.diff as number) > 0 ? 'text-[hsl(152,60%,42%)]' : (r.diff as number) < 0 ? 'text-[hsl(4,72%,52%)]' : 'text-muted-foreground'}`}>
                        {r.diff == null ? '-' : `${(r.diff as number) > 0 ? '▲ ' : (r.diff as number) < 0 ? '▼ ' : ''}${((r.diff as number) * 100).toFixed(1)}%`}
                      </td>
                    </>
                  ) : (
                    months.map((mo) => (
                      <td key={mo.label} className="px-4 py-2 text-right font-mono text-foreground tabular-nums whitespace-nowrap">
                        {formatPercent(r[mo.label] as number | null)}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============ 阶层对比柱状图 ============

interface TierMonthData {
  label: string;
  color: string;
  cumulativeTiers: HeatmapRow[];
  dailyTiers: HeatmapRow[];
}

interface TierCompareChartProps {
  months: TierMonthData[];
  loading: boolean;
  children?: React.ReactNode;
}

const TierCompareChart: React.FC<TierCompareChartProps> = ({ months, loading, children }) => {
  const getOverallRate = (row: HeatmapRow, isDaily: boolean): number | null => {
    if (isDaily) {
      const ts = row.dailyData?.reduce((s, d) => s + (d.stores ?? 0), 0) ?? 0;
      const tr = row.dailyData?.reduce((s, d) => s + (d.routeStores ?? 0), 0) ?? 0;
      return tr > 0 ? ts / tr : null;
    }
    if (!row.dailyData?.length) return null;
    for (let i = row.dailyData.length - 1; i >= 0; i--) {
      const rate = row.dailyData[i].rate;
      if (rate != null) return rate;
    }
    return null;
  };

  const allTiers = useMemo(() => {
    const set = new Set<string>();
    months.forEach((mo) => {
      mo.cumulativeTiers.forEach((r) => set.add(r.tier));
      mo.dailyTiers.forEach((r) => set.add(r.tier));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [months]);

  const chartData = useMemo(() => {
    return allTiers.map((tier) => {
      const entry: Record<string, string | number | null> = { tier };
      for (const mo of months) {
        const cum = mo.cumulativeTiers.find((r) => r.tier === tier);
        const daily = mo.dailyTiers.find((r) => r.tier === tier);
        const cumRate = cum ? getOverallRate(cum, false) : null;
        const dailyRate = daily ? getOverallRate(daily, true) : null;
        entry[`${mo.label}累计`] = cumRate != null ? Math.round(cumRate * 10000) / 100 : null;
        entry[`${mo.label}当日`] = dailyRate != null ? Math.round(dailyRate * 10000) / 100 : null;
      }
      return entry;
    });
  }, [allTiers, months]);

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-[12px] font-semibold text-foreground tracking-wide shrink-0">阶层成交率对比（%）</p>
        {children}
      </div>
      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : chartData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无阶层对比数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
            <XAxis dataKey="tier" tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(220, 12%, 52%)' }} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 2, border: '1px solid hsl(220, 15%, 88%)' }}
              formatter={(v: number | null, name) => [v == null ? '-' : `${v}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {months.map((mo) => (
              <React.Fragment key={mo.label}>
                <Bar dataKey={`${mo.label}累计`} fill={mo.color} radius={[2, 2, 0, 0]} />
                <Bar dataKey={`${mo.label}当日`} fill={mo.color} fillOpacity={0.35} radius={[2, 2, 0, 0]} />
              </React.Fragment>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ============ 年月多选筛选器 ============

interface MonthMultiPickerProps {
  options: MonthOption[];
  value: MonthOption[];
  onChange: (v: MonthOption[]) => void;
}

const MonthMultiPicker: React.FC<MonthMultiPickerProps> = ({ options, value, onChange }) => {
  const selectedKeys = new Set(value.map(monthKey));
  const single = value.length === 1;

  const toggle = (opt: MonthOption) => {
    const k = monthKey(opt);
    if (selectedKeys.has(k)) {
      // 保持至少选择一个月
      if (value.length <= 1) return;
      onChange(value.filter((v) => monthKey(v) !== k));
    } else {
      onChange([...value, opt].sort((a, b) => monthKey(a).localeCompare(monthKey(b))));
    }
  };

  const label = single ? monthLabel(value[0]) : `${monthLabel(value[0])} +${value.length - 1}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 rounded-full gap-1 text-xs font-normal font-mono tabular-nums shrink-0 hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
        >
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: single ? MONTH_COLORS[0] : 'transparent' }}
            />
            {label}
          </span>
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="max-h-[260px] overflow-auto space-y-0.5">
          {options.map((opt) => {
            const k = monthKey(opt);
            const checked = selectedKeys.has(k);
            const colorIdx = value.findIndex((v) => monthKey(v) === k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-accent/40 text-foreground text-left"
              >
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 border rounded-sm shrink-0"
                  style={checked
                    ? { backgroundColor: MONTH_COLORS[colorIdx % MONTH_COLORS.length], borderColor: 'transparent' }
                    : { borderColor: 'hsl(220, 15%, 80%)' }}
                >
                  {checked && <span className="text-[9px] leading-none text-white">✓</span>}
                </span>
                <span className="font-mono tabular-nums">{monthLabel(opt)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ============ 主页面 ============

const DashboardOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [resolvedId, setResolvedId] = useState<string | undefined>(undefined);
  const [resolving, setResolving] = useState(true);

  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  // 生成可选择的年份范围（过去 3 年到未来 1 年）
  const yearOptions = Array.from({ length: 5 }, (_, i) => defaultYear - 2 + i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const [selectYear, setSelectYear] = useState<string>(String(defaultYear));
  const [selectMonth, setSelectMonth] = useState<string>(String(defaultMonth));

  // 根据年月选择计算日期范围
  const dateRange = useMemo(() => {
    const y = parseInt(selectYear, 10);
    const m = parseInt(selectMonth, 10);
    return {
      from: new Date(y, m - 1, 1),
      to: new Date(y, m, 0),
    };
  }, [selectYear, selectMonth]);

  const dateFrom = formatDateStr(dateRange.from);
  const dateTo = formatDateStr(dateRange.to);

  useEffect(() => {
    setResolving(true);
    datasetApi.getDatasets({ page: 1, pageSize: 1 })
      .then((res: { items: Array<{ id: string }> }) => {
        setResolvedId(res.items.length > 0 ? String(res.items[0].id) : undefined);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load datasets:', err);
        setResolvedId(undefined);
      })
      .finally(() => setResolving(false));
  }, []);

  const { data, loading, error, refetch } = useOverviewData(resolvedId, dateFrom, dateTo);

  // KPI 数值
  const kpiValues = useMemo(() => {
    if (!data) return { cumRate: null, dailyRate: null, servicePoints: null, orders: null };
    const cumTotal = data.cumulative.total;
    const dailyTotal = data.daily.total;
    // 累计成交率 = 区间内最后一天有效累计成交率（避免跨日累加导致超过 100%）
    const cumRate = (() => {
      if (!cumTotal?.dailyData?.length) return null;
      for (let i = cumTotal.dailyData.length - 1; i >= 0; i--) {
        const rate = cumTotal.dailyData[i].rate;
        if (rate != null) return rate;
      }
      return null;
    })();
    const servicePoints = cumTotal?.servicePoints ?? 0;
    const dailyStores = dailyTotal?.dailyData?.reduce((s, d) => s + (d.stores ?? 0), 0) ?? 0;
    const dailyRoute = dailyTotal?.dailyData?.reduce((s, d) => s + (d.routeStores ?? 0), 0) ?? 0;
    const dailyRate = dailyRoute > 0 ? dailyStores / dailyRoute : null;
    const orders = dailyTotal?.dailyData?.reduce((s, d) => s + (d.orders ?? 0), 0) ?? 0;
    return { cumRate, dailyRate, servicePoints, orders };
  }, [data]);

  // ===== 卡片级年月多选（默认与顶部年月按钮首次加载同步） =====
  const defaultMonthOpt: MonthOption = { year: defaultYear, month: defaultMonth };
  const [cardMonths, setCardMonths] = useState<{
    cumTrend: MonthOption[];
    dailyTrend: MonthOption[];
    regionTable: MonthOption[];
    tierChart: MonthOption[];
  }>({
    cumTrend: [defaultMonthOpt],
    dailyTrend: [defaultMonthOpt],
    regionTable: [defaultMonthOpt],
    tierChart: [defaultMonthOpt],
  });

  // 卡片级年月多选的候选年月列表
  const monthMultiOptions = useMemo(() => buildMonthOptions(yearOptions), [yearOptions]);

  // 收集所有卡片选中的年月（去重）并按需拉取数据（带缓存）
  const allCardMonths = useMemo(() => {
    const map = new Map<string, MonthOption>();
    [...cardMonths.cumTrend, ...cardMonths.dailyTrend, ...cardMonths.regionTable, ...cardMonths.tierChart]
      .forEach((m) => map.set(monthKey(m), m));
    return Array.from(map.values());
  }, [cardMonths]);

  const { cache: monthCache, errorMap: monthErrorMap } = useOverviewByMonths(resolvedId, allCardMonths);

  const isCardLoading = (list: MonthOption[]): boolean => {
    return list.some((m) => {
      const k = monthKey(m);
      return !monthCache.has(k) && !monthErrorMap.has(k);
    });
  };

  // 构建折线图多序列（单月用卡片主题色，多选按月从调色板取色）
  const buildTrendSeries = (list: MonthOption[], mode: 'cumulative' | 'daily'): TrendSeries[] => {
    return list.map((m, i) => {
      const k = monthKey(m);
      const d = monthCache.get(k);
      const row = mode === 'cumulative' ? d?.cumulative.total : d?.daily.total;
      const columns = mode === 'cumulative' ? d?.cumulative.columns : d?.daily.columns;
      const color = list.length > 1
        ? MONTH_COLORS[i % MONTH_COLORS.length]
        : (mode === 'cumulative' ? 'hsl(217, 85%, 52%)' : 'hsl(152, 60%, 42%)');
      return {
        label: monthLabel(m),
        color,
        data: row?.dailyData?.map((dd, di) => ({
          label: columns?.[di]?.label ?? String(dd.day),
          rate: dd.rate,
        })) ?? [],
      };
    });
  };

  const buildRegionMonths = (list: MonthOption[]): RegionMonthData[] => {
    return list.map((m, i) => {
      const k = monthKey(m);
      const d = monthCache.get(k);
      return {
        label: monthLabel(m),
        color: list.length > 1 ? MONTH_COLORS[i % MONTH_COLORS.length] : MONTH_COLORS[0],
        cumulativeRegions: d?.cumulative.regions ?? [],
        dailyRegions: d?.daily.regions ?? [],
      };
    });
  };

  const buildTierMonths = (list: MonthOption[]): TierMonthData[] => {
    return list.map((m, i) => {
      const k = monthKey(m);
      const d = monthCache.get(k);
      return {
        label: monthLabel(m),
        color: list.length > 1 ? MONTH_COLORS[i % MONTH_COLORS.length] : MONTH_COLORS[0],
        cumulativeTiers: d?.cumulative.tiers ?? [],
        dailyTiers: d?.daily.tiers ?? [],
      };
    });
  };

  if (resolving) {
    return <div className="space-y-4 max-w-[1400px] mx-auto"><Skeleton className="h-14 w-full" /></div>;
  }

  if (!resolvedId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="emoji">📊</EmptyMedia>
            <EmptyTitle>暂无数据集</EmptyTitle>
            <EmptyDescription>请先在数据管理页上传并解析数据集</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button onClick={() => navigate('/')}>前往数据管理</Button></EmptyContent>
        </Empty>
      </div>
    );
  }

  const dateLabel = `${dateFrom.replace(/-/g, '/')} ~ ${dateTo.replace(/-/g, '/')}`;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">成交分析总览</h2>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <span className="inline-flex items-center justify-center text-base leading-none">📅</span>
            {dateLabel}
          </p>
        </div>
        {/* 统一年月选择器 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">年月</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-[140px] rounded-full gap-1 text-xs font-normal font-mono tabular-nums hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
              >
                {selectYear}年{String(selectMonth).padStart(2, '0')}月
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <div className="flex items-center gap-2">
                {/* 快速切换：上月 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const y = parseInt(selectYear, 10);
                    const m = parseInt(selectMonth, 10);
                    const prev = new Date(y, m - 2, 1);
                    setSelectYear(String(prev.getFullYear()));
                    setSelectMonth(String(prev.getMonth() + 1));
                  }}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                {/* 年份选择 */}
                <Select value={selectYear} onValueChange={setSelectYear}>
                  <SelectTrigger className="h-7 w-[96px] text-xs font-mono tabular-nums">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 月份选择 */}
                <Select value={selectMonth} onValueChange={setSelectMonth}>
                  <SelectTrigger className="h-7 w-[64px] text-xs font-mono tabular-nums">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}月</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 快速切换：下月 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const y = parseInt(selectYear, 10);
                    const m = parseInt(selectMonth, 10);
                    const next = new Date(y, m, 1);
                    setSelectYear(String(next.getFullYear()));
                    setSelectMonth(String(next.getMonth() + 1));
                  }}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-center min-h-[200px] bg-card border border-border rounded-sm">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">⚠️</EmptyMedia>
              <EmptyTitle>加载失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={refetch}>
                重试
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {/* 区块1：KPI 卡带 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="累计成交率"
          icon="📈"
          variant="primary"
          hoverEffect
          glowColor="hsl(217,85%,52%)"
          lineColor="bg-[hsl(217,85%,52%)]"
          loading={loading || kpiValues.cumRate == null}
          value={
            kpiValues.cumRate != null ? (
              <>
                <CountUp end={kpiValues.cumRate * 100} duration={0.6} decimals={1} separator="," />
                %
              </>
            ) : null
          }
        />
        <KpiCard
          label="当日成交率"
          icon="✅"
          variant="success"
          hoverEffect
          glowColor="hsl(152,60%,42%)"
          lineColor="bg-[hsl(152,60%,42%)]"
          loading={loading || kpiValues.dailyRate == null}
          value={
            kpiValues.dailyRate != null ? (
              <>
                <CountUp end={kpiValues.dailyRate * 100} duration={0.6} decimals={1} separator="," />
                %
              </>
            ) : null
          }
        />
        <KpiCard
          label="总服务点数"
          icon="🏬"
          hoverEffect
          glowColor="hsl(38,85%,48%)"
          lineColor="bg-[hsl(38,85%,48%)]"
          loading={loading}
          value={
            <CountUp end={kpiValues.servicePoints} duration={0.6} decimals={0} separator="," />
          }
        />
        <KpiCard
          label="期间订单箱数"
          icon="📦"
          hoverEffect
          glowColor="hsl(262,80%,58%)"
          lineColor="bg-[hsl(262,80%,58%)]"
          loading={loading}
          value={
            <CountUp end={kpiValues.orders} duration={0.6} decimals={0} separator="," />
          }
        />
      </div>

      {/* 区块2：双模式趋势对比（卡片右上角支持年月多选叠加） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TrendChart
          title="累计成交率趋势"
          series={buildTrendSeries(cardMonths.cumTrend, 'cumulative')}
          loading={isCardLoading(cardMonths.cumTrend)}
        >
          <MonthMultiPicker
            options={monthMultiOptions}
            value={cardMonths.cumTrend}
            onChange={(v) => setCardMonths((s) => ({ ...s, cumTrend: v }))}
          />
        </TrendChart>
        <TrendChart
          title="当日成交率趋势"
          series={buildTrendSeries(cardMonths.dailyTrend, 'daily')}
          loading={isCardLoading(cardMonths.dailyTrend)}
        >
          <MonthMultiPicker
            options={monthMultiOptions}
            value={cardMonths.dailyTrend}
            onChange={(v) => setCardMonths((s) => ({ ...s, dailyTrend: v }))}
          />
        </TrendChart>
      </div>

      {/* 区块3 & 4：所别表格 + 阶层柱状图（支持年月多选） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RegionCompareTable
          months={buildRegionMonths(cardMonths.regionTable)}
          loading={isCardLoading(cardMonths.regionTable)}
        >
          <MonthMultiPicker
            options={monthMultiOptions}
            value={cardMonths.regionTable}
            onChange={(v) => setCardMonths((s) => ({ ...s, regionTable: v }))}
          />
        </RegionCompareTable>
        <TierCompareChart
          months={buildTierMonths(cardMonths.tierChart)}
          loading={isCardLoading(cardMonths.tierChart)}
        >
          <MonthMultiPicker
            options={monthMultiOptions}
            value={cardMonths.tierChart}
            onChange={(v) => setCardMonths((s) => ({ ...s, tierChart: v }))}
          />
        </TierCompareChart>
      </div>
    </div>
  );
};

export default DashboardOverviewPage;
