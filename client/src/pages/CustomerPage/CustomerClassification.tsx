import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

import { customerApi } from '@client/src/api/index';
import { toast } from 'sonner';
import type {
  GetClassificationResponse,
  ClassificationRow,
  StoreFormatItem,
  FormatDrilldownResponse,
} from '@shared/api.interface';
import FormatDrilldownPanel from './FormatDrilldownPanel';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { KpiCard } from '@/components/business-ui/kpi-card';

const CHART_COLORS = [
  '#3478f6', '#14c9c9', '#f7ba1e', '#f77474',
  '#52c4a0', '#975fe4', '#ff9845', '#5b8ff9',
];

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

type DetailRowType = 'data' | 'tierTotal' | 'regionTotal' | 'grandTotal';

interface DetailDisplayRow {
  region: string;
  tier: string;
  customerManager: string;
  storeCount: number;
  paidStoreCount: number;
  paidAmount: number;
  rowType: DetailRowType;
  rowLabel: string;
}

function aggregateDetailRows(rows: ClassificationRow[]) {
  return {
    storeCount: rows.reduce((s, r) => s + r.storeCount, 0),
    paidStoreCount: rows.reduce((s, r) => s + r.paidStoreCount, 0),
    paidAmount: round2(rows.reduce((s, r) => s + r.paidAmount, 0)),
  };
}

function buildDetailRowsWithTotals(rows: ClassificationRow[]): DetailDisplayRow[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.customerManager.localeCompare(b.customerManager);
  });

  const result: DetailDisplayRow[] = [];
  let currentRegion = '';
  let regionRows: ClassificationRow[] = [];

  const flushRegion = () => {
    if (regionRows.length === 0) return;
    const region = regionRows[0].region;

    const tierGroups = new Map<string, ClassificationRow[]>();
    for (const r of regionRows) {
      const list = tierGroups.get(r.tier) ?? [];
      list.push(r);
      tierGroups.set(r.tier, list);
    }

    for (const [tier, tierRows] of tierGroups) {
      for (const r of tierRows) {
        result.push({ ...r, rowType: 'data', rowLabel: '' });
      }
      const agg = aggregateDetailRows(tierRows);
      result.push({
        region, tier, customerManager: '',
        ...agg,
        rowType: 'tierTotal',
        rowLabel: `${tier}合计`,
      });
    }

    const regionAgg = aggregateDetailRows(regionRows);
    result.push({
      region, tier: '', customerManager: '',
      ...regionAgg,
      rowType: 'regionTotal',
      rowLabel: `${region}合计`,
    });
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

  const grandAgg = aggregateDetailRows(sorted);
  result.push({
    region: '', tier: '', customerManager: '',
    ...grandAgg,
    rowType: 'grandTotal',
    rowLabel: '部别合计',
  });

  return result;
}

function getDetailRowBg(rowType: DetailRowType): string {
  switch (rowType) {
    case 'tierTotal': return 'hsl(217, 60%, 94%)';
    case 'regionTotal': return 'hsl(220, 18%, 92%)';
    case 'grandTotal': return 'hsl(220, 18%, 86%)';
    default: return '';
  }
}

// Stable chart event handlers to prevent re-renders
const createChartEvents = (onClick?: (name: string) => void) => {
  if (!onClick) return undefined;
  return {
    click: (params: unknown) => {
      const p = params as { name?: string };
      if (p.name) onClick(p.name);
    },
  };
};


const CustomerClassification: React.FC = () => {
  const [data, setData] = useState<GetClassificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [drillRegion, setDrillRegion] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<FormatDrilldownResponse | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(true);

  // Use refs to store chart instances for manual control
  const formatChartRef = useRef<ReactECharts>(null);
  const regionChartRef = useRef<ReactECharts>(null);
  const tierChartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    customerApi
      .getCustomerClassification()
      .then((res: GetClassificationResponse) => setData(res))
      .catch(() => toast.error('获取分类汇总失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleDrilldown = useCallback((region: string) => {
    if (drillRegion === region) {
      setDrillRegion(null);
      setDrillData(null);
      return;
    }
    setDrillRegion(region);
    setDrillData(null);
    setDrillLoading(true);
    customerApi
      .getFormatDrilldown(region)
      .then((res: FormatDrilldownResponse) => setDrillData(res))
      .catch(() => toast.error('获取下钻数据失败'))
      .finally(() => setDrillLoading(false));
  }, [drillRegion]);

  const regions = useMemo(
    () => (data ? [...new Set(data.rows.map((r: ClassificationRow) => r.region))].sort() : []),
    [data],
  );
  const tiers = useMemo(
    () => (data ? [...new Set(data.rows.map((r: ClassificationRow) => r.tier))].sort() : []),
    [data],
  );

  const tier1Count = useMemo(() => {
    if (!data) return 0;
    const t = data.tierSummary.find((s) => s.tier === '一阶');
    return t?.storeCount ?? 0;
  }, [data]);

  const tier2Count = useMemo(() => {
    if (!data) return 0;
    const t = data.tierSummary.find((s) => s.tier === '二阶');
    return t?.storeCount ?? 0;
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r: ClassificationRow) => {
      if (regionFilter !== 'all' && r.region !== regionFilter) return false;
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      return true;
    });
  }, [data, regionFilter, tierFilter]);

  const detailDisplayRows = useMemo(
    () => buildDetailRowsWithTotals(filteredRows),
    [filteredRows],
  );

  const detailVisibleRows = useMemo(() => {
    if (!detailCollapsed) return detailDisplayRows;
    return detailDisplayRows.filter(
      (r) => r.rowType === 'regionTotal' || r.rowType === 'grandTotal',
    );
  }, [detailDisplayRows, detailCollapsed]);

  const tier1RegionData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { storeCount: number; paidStoreCount: number; paidAmount: number }>();
    for (const row of data.rows) {
      if (row.tier !== '一阶') continue;
      const v = map.get(row.region) ?? { storeCount: 0, paidStoreCount: 0, paidAmount: 0 };
      v.storeCount += row.storeCount;
      v.paidStoreCount += row.paidStoreCount;
      v.paidAmount += row.paidAmount;
      map.set(row.region, v);
    }
    return Array.from(map.entries())
      .map(([region, v]) => ({ region, ...v, paidAmount: round2(v.paidAmount) }))
      .sort((a, b) => b.storeCount - a.storeCount);
  }, [data]);

  const regionChartOption: EChartsOption = useMemo(() => {
    if (tier1RegionData.length === 0) return {};
    const labels = tier1RegionData.map((r) => r.region);
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = params as Array<{
            seriesName: string;
            value: number;
            marker: string;
          }>;
          const name = (params as Array<{ name: string }>)[0]?.name ?? '';
          const items = list
            .map((p) => {
              const v = p.seriesName === '付费金额'
                ? `¥${p.value.toLocaleString()}`
                : p.value.toLocaleString();
              return `${p.marker} ${p.seriesName}: ${v}`;
            })
            .join('<br/>');
          return `<strong>${name}</strong><br/>${items}`;
        },
      },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: '3%', right: '4%', bottom: '20%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: true,
        axisLabel: { fontSize: 10, rotate: labels.length > 10 ? 30 : 0 },
      },
      yAxis: [
        { type: 'value', name: '门店/付费店数', nameTextStyle: { fontSize: 10 } },
        { type: 'value', name: '付费金额', nameTextStyle: { fontSize: 10 } },
      ],
      color: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]],
      series: [
        {
          name: '一阶门店数',
          type: 'bar',
          data: tier1RegionData.map((r) => r.storeCount),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '付费店数',
          type: 'bar',
          data: tier1RegionData.map((r) => r.paidStoreCount),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '付费金额',
          type: 'bar',
          yAxisIndex: 1,
          data: tier1RegionData.map((r) => r.paidAmount),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [2, 2, 0, 0] },
        },
      ],
    };
  }, [tier1RegionData]);

  const tierChartOption: EChartsOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          return `${p.name}<br/>门店数: ${p.value.toLocaleString()} (${p.percent}%)`;
        },
      },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
      color: CHART_COLORS,
      series: [
        {
          name: '层级分布',
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '45%'],
          label: { show: false },
          emphasis: { label: { show: false } },
          data: data.tierSummary.map((t) => ({
            name: t.tier || '未分级',
            value: t.storeCount,
          })),
        },
      ],
    };
  }, [data]);

  const formatChartData = useMemo(() => {
    if (!data?.storeFormatSummary?.length) return null;
    const items = data.storeFormatSummary;
    const regionsList = [...new Set(items.map((i: StoreFormatItem) => i.region))].sort();
    const typesList = [...new Set(items.map((i: StoreFormatItem) => i.simpleType))].sort(
      (a: string, b: string) => {
        const totalA = items.filter((i: StoreFormatItem) => i.simpleType === a).reduce((s: number, i: StoreFormatItem) => s + i.storeCount, 0);
        const totalB = items.filter((i: StoreFormatItem) => i.simpleType === b).reduce((s: number, i: StoreFormatItem) => s + i.storeCount, 0);
        return totalB - totalA;
      },
    );
    const map = new Map<string, Map<string, number>>();
    for (const item of items) {
      const rm = map.get(item.region) ?? new Map<string, number>();
      rm.set(item.simpleType, (rm.get(item.simpleType) ?? 0) + item.storeCount);
      map.set(item.region, rm);
    }
    return { regions: regionsList, types: typesList, map };
  }, [data]);

  const formatChartOption: EChartsOption = useMemo(() => {
    if (!formatChartData) return {};
    const { regions, types, map } = formatChartData;
    const colorPool = [
      '#3478f6', '#14c9c9', '#f7ba1e', '#f77474',
      '#52c4a0', '#975fe4', '#ff9845', '#5b8ff9',
      '#36cfc9', '#b37feb', '#ff85c0', '#597ef7',
      '#73d13d', '#ffa940', '#40a9ff', '#ff4d4f',
      '#9254de', '#13c2c2', '#faad14', '#f5222d',
    ];
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as Array<{ seriesName: string; value: number; marker: string }>;
          const name = (params as Array<{ name: string }>)[0]?.name ?? '';
          let total = 0;
          const items = list
            .filter((p) => p.value > 0)
            .map((p) => { total += p.value; return `${p.marker} ${p.seriesName}: ${p.value}`; })
            .join('<br/>');
          return `<strong>${name}</strong> (合计 ${total})<br/>${items}`;
        },
      },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: '18%', right: '6%', bottom: '22%', top: '4%', containLabel: false },
      yAxis: {
        type: 'category',
        data: regions,
        boundaryGap: true,
        axisLabel: { fontSize: 10 },
        inverse: true,
      },
      xAxis: { type: 'value', name: '门店数', nameTextStyle: { fontSize: 10 } },
      color: colorPool,
      series: types.map((t: string) => ({
        name: t,
        type: 'bar' as const,
        stack: 'total',
        data: regions.map((r: string) => map.get(r)?.get(t) ?? 0),
        barMaxWidth: 28,
        itemStyle: { borderRadius: 0 },
      })),
    };
  }, [formatChartData]);

  const filteredSummary = useMemo(() => {
    const storeCount = filteredRows.reduce((s: number, r: ClassificationRow) => s + r.storeCount, 0);
    const paidStoreCount = filteredRows.reduce((s: number, r: ClassificationRow) => s + r.paidStoreCount, 0);
    const paidAmount = filteredRows.reduce((s: number, r: ClassificationRow) => s + r.paidAmount, 0);
    return { storeCount, paidStoreCount, paidAmount: round2(paidAmount) };
  }, [filteredRows]);

  const paidRatio = tier1Count > 0
    ? ((data?.totalPaidStoreCount ?? 0) / tier1Count * 100).toFixed(1)
    : '0';

  // Stable chart event handlers
  const formatChartEvents = useMemo(
    () => createChartEvents(handleDrilldown),
    [handleDrilldown],
  );

  if (loading) {
    return (
      <div className="rounded-sm border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">分类汇总</h3>
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">分类汇总</h3>
        <div className="flex items-center justify-center py-8">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">👥</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无客户数据</EmptyTitle>
              <EmptyDescription className="text-xs">请先上传客户资料</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-5">
        <div className="mb-4 grid grid-cols-3 gap-4">
          <KpiCard
            icon="🏬"
            label="总门店数"
            hoverEffect
            glowColor="hsl(217,85%,52%)"
            lineColor="bg-[hsl(217,85%,52%)]"
            value={data.totalStoreCount.toLocaleString()}
            subText={`一阶 ${tier1Count.toLocaleString()} 家 / 二阶 ${tier2Count.toLocaleString()} 家`}
          />
          <KpiCard
            icon="💳"
            label="付费门店数"
            hoverEffect
            glowColor="hsl(152,60%,42%)"
            lineColor="bg-[hsl(152,60%,42%)]"
            value={data.totalPaidStoreCount.toLocaleString()}
            subText={`占一阶 ${paidRatio}%`}
          />
          <KpiCard
            icon="💰"
            label="付费金额"
            hoverEffect
            glowColor="hsl(38,85%,48%)"
            lineColor="bg-[hsl(38,85%,48%)]"
            value={`¥${round2(data.totalPaidAmount).toLocaleString()}`}
            subText={`${regions.length} 个所别`}
          />
        </div>
        <div className="mb-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">一阶门店形态别分布（按所别）<span className="text-muted-foreground/60 ml-1">点击所别柱状图可展开详情</span></p>
          {formatChartOption && Object.keys(formatChartOption).length > 0 ? (
            <ReactECharts
              ref={formatChartRef}
              option={formatChartOption}
              notMerge={false}
              lazyUpdate
              theme="ud"
              className="h-[280px]"
              onEvents={formatChartEvents}
            />
          ) : (
            <div className="py-8 flex items-center justify-center">
              <Empty className="border-none py-0">
                <EmptyHeader>
                  <EmptyMedia variant="emoji">📊</EmptyMedia>
                  <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无形态别数据</EmptyTitle>
                  <EmptyDescription className="text-xs">请上传客户资料后查看形态别分布</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>

        {drillRegion && (
          <FormatDrilldownPanel
            region={drillRegion}
            data={drillData}
            loading={drillLoading}
            onClose={() => { setDrillRegion(null); setDrillData(null); }}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">各所别一阶门店数 / 付费店数 / 付费金额</p>
            <ReactECharts
              ref={regionChartRef}
              option={regionChartOption}
              notMerge={false}
              lazyUpdate
              theme="ud"
              className="h-[300px]"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">层级门店分布</p>
            <ReactECharts
              ref={tierChartRef}
              option={tierChartOption}
              notMerge={false}
              lazyUpdate
              theme="ud"
              className="h-[300px]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">人员点数概况</h3>
          <div className="flex items-center gap-2">
            <SearchableSelect
              value={regionFilter}
              onValueChange={setRegionFilter}
              options={['all', ...regions]}
              optionLabels={{ all: '全部所别' }}
              triggerClassName="h-8 w-[120px]"
            />
            <SearchableSelect
              value={tierFilter}
              onValueChange={setTierFilter}
              options={['all', ...tiers]}
              optionLabels={{ all: '全部层级' }}
              triggerClassName="h-8 w-[120px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-[120px] rounded-full px-3 text-xs font-normal gap-1.5 hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
              onClick={() => setDetailCollapsed((prev) => !prev)}
              disabled={detailDisplayRows.length === 0}
            >
              {detailCollapsed ? '展开明细' : '收起明细'}
              <span className={`inline-flex items-center justify-center text-base leading-none transition-transform ${detailCollapsed ? '' : 'rotate-180'}`}>▼</span>
            </Button>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-3 rounded-sm bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
          <span>合计门店数: <strong className="text-foreground">{filteredSummary.storeCount}</strong></span>
          <span>合计付费门店: <strong className="text-foreground">{filteredSummary.paidStoreCount}</strong></span>
          <span>合计付费金额: <strong className="text-foreground">¥{filteredSummary.paidAmount.toLocaleString()}</strong></span>
        </div>
        <div className="max-h-[400px] overflow-auto rounded-sm border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent">
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">所别</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">层级</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">业代</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">门店数</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">付费门店数</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-foreground">付费金额</th>
              </tr>
            </thead>
            <tbody>
              {detailVisibleRows.map((row: DetailDisplayRow, i: number) => {
                const isTotal = row.rowType !== 'data';
                const bg = getDetailRowBg(row.rowType);
                return (
                  <tr
                    key={`${row.rowType}-${row.region}-${row.tier}-${row.customerManager}-${i}`}
                    className={`border-b border-border last:border-0 transition-colors duration-150 ease-out ${isTotal ? 'font-semibold' : 'hover:bg-accent/20'}`}
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    {isTotal ? (
                      <td className="whitespace-nowrap px-3 py-1.5 text-foreground" colSpan={3}>
                        {row.rowLabel}
                      </td>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{row.region}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{row.tier || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{row.customerManager || '-'}</td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-foreground">{row.storeCount}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-foreground">{row.paidStoreCount}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                      {row.paidAmount > 0 ? `¥${round2(row.paidAmount).toLocaleString()}` : '-'}
                    </td>
                  </tr>
                );
              })}
              {detailVisibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    无匹配数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CustomerClassification;
