import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

// ============ 趋势折线图 ============

interface TrendChartProps {
  title: string;
  data: Array<{ label: string; rate: number | null }>;
  color: string;
  loading: boolean;
}

const TrendChart: React.FC<TrendChartProps> = ({ title, data, color, loading }) => {
  const chartData = data.map((d) => ({ label: d.label, rate: d.rate != null ? Math.round(d.rate * 10000) / 100 : null }));
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <p className="text-[12px] font-semibold text-foreground tracking-wide mb-3">{title}</p>
      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : chartData.length === 0 ? (
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
              formatter={(v: number | null) => [v == null ? '-' : `${v}%`, '成交率']}
            />
            <Line type="monotone" dataKey="rate" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ============ 所别对比表格 ============

interface RegionCompareTableProps {
  cumulativeRegions: HeatmapRow[];
  dailyRegions: HeatmapRow[];
  loading: boolean;
}

const RegionCompareTable: React.FC<RegionCompareTableProps> = ({ cumulativeRegions, dailyRegions, loading }) => {
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

  const dailyMap = useMemo(() => {
    const m = new Map<string, HeatmapRow>();
    for (const r of dailyRegions) m.set(r.region, r);
    return m;
  }, [dailyRegions]);

  const rows = useMemo(() => {
    return cumulativeRegions.map((cum) => {
      const daily = dailyMap.get(cum.region);
      const cumRate = getOverallRate(cum, false);
      const dailyRate = daily ? getOverallRate(daily, true) : null;
      const diff = cumRate != null && dailyRate != null ? dailyRate - cumRate : null;
      return { region: cum.region, servicePoints: cum.servicePoints, cumRate, dailyRate, diff };
    });
  }, [cumulativeRegions, dailyMap]);

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-accent/30">
        <p className="text-[12px] font-semibold text-foreground tracking-wide">所别双模式对比</p>
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
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">服务点数</th>
                <th className="px-4 py-2 text-right font-medium text-foreground">累计成交率</th>
                <th className="px-4 py-2 text-right font-medium text-foreground">当日成交率</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">差值（当日-累计）</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.region} className={`border-b border-border/60 hover:bg-accent/5 transition-colors duration-150 ease-out ${i % 2 === 1 ? 'bg-accent/5' : ''}`}>
                  <td className="px-4 py-2 text-foreground font-medium whitespace-nowrap">{r.region}</td>
                  <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{r.servicePoints}</td>
                  <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{formatPercent(r.cumRate)}</td>
                  <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">{formatPercent(r.dailyRate)}</td>
                  <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${r.diff == null ? 'text-muted-foreground' : r.diff > 0 ? 'text-[hsl(152,60%,42%)]' : r.diff < 0 ? 'text-[hsl(4,72%,52%)]' : 'text-muted-foreground'}`}>
                    {r.diff == null ? '-' : `${r.diff > 0 ? '▲ ' : r.diff < 0 ? '▼ ' : ''}${(r.diff * 100).toFixed(1)}%`}
                  </td>
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

interface TierCompareChartProps {
  cumulativeTiers: HeatmapRow[];
  dailyTiers: HeatmapRow[];
  loading: boolean;
}

const TierCompareChart: React.FC<TierCompareChartProps> = ({ cumulativeTiers, dailyTiers, loading }) => {
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

  const dailyMap = useMemo(() => {
    const m = new Map<string, HeatmapRow>();
    for (const r of dailyTiers) m.set(r.tier, r);
    return m;
  }, [dailyTiers]);

  const chartData = useMemo(() => {
    const allTiers = Array.from(new Set([...cumulativeTiers.map(r => r.tier), ...dailyTiers.map(r => r.tier)])).sort();
    return allTiers.map((tier) => {
      const cum = cumulativeTiers.find(r => r.tier === tier);
      const daily = dailyMap.get(tier);
      return {
        tier,
        cumRate: cum ? getOverallRate(cum, false) : null,
        dailyRate: daily ? getOverallRate(daily, true) : null,
      };
    });
  }, [cumulativeTiers, dailyMap]);

  const formatted = chartData.map(d => ({
    tier: d.tier,
    累计成交率: d.cumRate != null ? Math.round(d.cumRate * 10000) / 100 : null,
    当日成交率: d.dailyRate != null ? Math.round(d.dailyRate * 10000) / 100 : null,
  }));

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <p className="text-[12px] font-semibold text-foreground tracking-wide mb-3">阶层成交率对比（%）</p>
      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : formatted.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无阶层对比数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={formatted} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
            <XAxis dataKey="tier" tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(220, 12%, 52%)' }} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 2, border: '1px solid hsl(220, 15%, 88%)' }}
              formatter={(v: number | null, name) => [v == null ? '-' : `${v}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="累计成交率" fill="hsl(217, 85%, 52%)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="当日成交率" fill="hsl(152, 60%, 42%)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
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

  // 趋势数据
  const cumTrend = useMemo(() => {
    if (!data?.cumulative.total) return [];
    return data.cumulative.total.dailyData?.map((d, i) => ({ label: data.cumulative.columns[i]?.label ?? String(d.day), rate: d.rate })) ?? [];
  }, [data]);
  const dailyTrend = useMemo(() => {
    if (!data?.daily.total) return [];
    return data.daily.total.dailyData?.map((d, i) => ({ label: data.daily.columns[i]?.label ?? String(d.day), rate: d.rate })) ?? [];
  }, [data]);

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
          loading={loading}
          value={
            <CountUp end={kpiValues.servicePoints} duration={0.6} decimals={0} separator="," />
          }
        />
        <KpiCard
          label="期间订单箱数"
          icon="📦"
          loading={loading}
          value={
            <CountUp end={kpiValues.orders} duration={0.6} decimals={0} separator="," />
          }
        />
      </div>

      {/* 区块2：双模式趋势对比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TrendChart title="累计成交率趋势" data={cumTrend} color="hsl(217, 85%, 52%)" loading={loading} />
        <TrendChart title="当日成交率趋势" data={dailyTrend} color="hsl(152, 60%, 42%)" loading={loading} />
      </div>

      {/* 区块3 & 4：所别表格 + 阶层柱状图 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RegionCompareTable cumulativeRegions={data?.cumulative.regions ?? []} dailyRegions={data?.daily.regions ?? []} loading={loading} />
        <TierCompareChart cumulativeTiers={data?.cumulative.tiers ?? []} dailyTiers={data?.daily.tiers ?? []} loading={loading} />
      </div>
    </div>
  );
};

export default DashboardOverviewPage;
