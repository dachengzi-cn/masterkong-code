import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { datasetApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type {
  SalesRepDrilldownResponse,
  HeatmapDailyData,
  HeatmapColumnHeader,
} from '@shared/api.interface';

interface DrilldownRowProps {
  datasetId: string;
  salesRep: string;
  region: string;
  tier: string;
  dateFrom: string;
  dateTo: string;
  mode?: 'cumulative' | 'daily';
  dailyData?: HeatmapDailyData[];
  columns?: HeatmapColumnHeader[];
}

// Memoized breakdown table component - using union type to handle all variants
type BreakdownItem = {
  totalStores: number;
  dealtStores: number;
  dealRate: number;
  formatType?: string;
  brand?: string;
  specification?: string;
};

// 判断时间段是否为自然月：是→"全月"，否→"期间"
function getPeriodLabel(dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  if (from.getDate() !== 1) return '期间';
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  if (to.getFullYear() === from.getFullYear() && to.getMonth() === from.getMonth() && to.getDate() === lastDay) {
    return '全月';
  }
  return '期间';
}

const BreakdownTable = memo(({
  title,
  items,
  labelExtractor,
  periodLabel,
}: {
  title: string;
  items: BreakdownItem[];
  labelExtractor: (item: BreakdownItem) => string;
  periodLabel?: string;
}) => {
  const ROW_LABELS = useMemo(() => ['点数', '成交', '成交率'], []);
  const itemKeys = useMemo(() => items.map((_, i) => `item-${i}`), [items]);

  // 计算后20%和后50%阈值，用于达成率颜色编码
  const { bottom20Threshold, bottom50Threshold } = useMemo(() => {
    const rates = items.map((i) => i.dealRate).filter((r) => r > 0).sort((a, b) => a - b);
    if (rates.length < 2) return { bottom20Threshold: -1, bottom50Threshold: -1 };
    const idx20 = Math.max(0, Math.ceil(rates.length * 0.2) - 1);
    const idx50 = Math.max(0, Math.ceil(rates.length * 0.5) - 1);
    return { bottom20Threshold: rates[idx20], bottom50Threshold: rates[idx50] };
  }, [items]);

  const getRateBg = (rate: number): string => {
    if (rate <= 0 || bottom20Threshold < 0) return '';
    if (rate <= bottom20Threshold) return 'hsl(4, 72%, 90%)';
    if (rate <= bottom50Threshold) return 'hsl(48, 90%, 88%)';
    return '';
  };

  const titleEl = (
    <div className="flex items-center px-4 py-1.5 border-b border-border bg-accent/30">
      <p className="text-[12px] font-semibold text-foreground tracking-wide whitespace-nowrap">{title}</p>
      {periodLabel && (
        <span
          className="ml-9 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
          style={{ backgroundColor: 'hsl(152, 60%, 85%)', color: 'hsl(220, 25%, 12%)' }}
        >
          {periodLabel}
        </span>
      )}
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {titleEl}
        <div className="px-4 py-6 flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-xs font-normal text-muted-foreground">暂无数据</EmptyTitle>
              <EmptyDescription className="text-[11px]">当前筛选条件下没有匹配的下钻数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      {titleEl}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-accent/10">
              <th className="px-3 py-1 text-left font-medium text-muted-foreground min-w-[60px] whitespace-nowrap">
                <span className="text-[11px]">指标</span>
              </th>
              {items.map((item, idx) => (
                <th key={itemKeys[idx]} className="px-3 py-1 text-right font-medium text-foreground min-w-[70px]">
                  <span className="text-[11px] truncate block max-w-[100px]" title={labelExtractor(item)}>
                    {labelExtractor(item)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60 hover:bg-accent/5 transition-colors duration-150">
              <td className="px-3 py-1 text-muted-foreground font-medium text-[11px] whitespace-nowrap">{ROW_LABELS[0]}</td>
              {items.map((item, idx) => (
                <td key={itemKeys[idx]} className="px-3 py-1 text-right font-mono text-foreground text-[12px] tabular-nums">
                  {item.totalStores}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/60 hover:bg-accent/5 transition-colors duration-150">
              <td className="px-3 py-1 text-muted-foreground font-medium text-[11px] whitespace-nowrap">{ROW_LABELS[1]}</td>
              {items.map((item, idx) => (
                <td key={itemKeys[idx]} className="px-3 py-1 text-right font-mono text-foreground text-[12px] tabular-nums">
                  {item.dealtStores}
                </td>
              ))}
            </tr>
            <tr className="hover:bg-accent/5 transition-colors duration-150 bg-accent/5">
              <td className="px-3 py-1 text-muted-foreground font-medium text-[11px] whitespace-nowrap">{ROW_LABELS[2]}</td>
              {items.map((item, idx) => {
                const bg = getRateBg(item.dealRate);
                return (
                  <td
                    key={itemKeys[idx]}
                    className="px-3 py-1 text-right font-mono font-semibold text-primary text-[12px] tabular-nums"
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    {item.dealRate > 0 ? `${item.dealRate}%` : '-'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

BreakdownTable.displayName = 'BreakdownTable';

// 当日模式下钻：按日期展示当日点数、成交点数、当日订单箱数
const DailyBreakdownTable = memo(({
  dailyData,
  columns,
}: {
  dailyData: HeatmapDailyData[];
  columns: HeatmapColumnHeader[];
}) => {
  const colKeys = useMemo(() => dailyData.map((_, i) => `d-${i}`), [dailyData]);

  if (dailyData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <div className="px-4 py-1.5 border-b border-border bg-accent/30">
          <p className="text-[12px] font-semibold text-foreground tracking-wide">当日成交明细</p>
        </div>
        <div className="px-4 py-6 flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-xs font-normal text-muted-foreground">暂无数据</EmptyTitle>
              <EmptyDescription className="text-[11px]">当前筛选条件下没有匹配的当日成交明细</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  const renderRow = (label: string, extractor: (dd: HeatmapDailyData) => number | null, highlight?: boolean) => (
    <tr className={`border-b border-border/60 hover:bg-accent/5 transition-colors duration-150 ${highlight ? 'bg-accent/5' : ''}`}>
      <td className="px-3 py-1 text-muted-foreground font-medium text-[11px] whitespace-nowrap">{label}</td>
      {dailyData.map((dd, idx) => {
        const val = extractor(dd);
        return (
          <td
            key={colKeys[idx]}
            className={`px-2 py-1 text-right font-mono text-[12px] tabular-nums ${highlight ? 'font-semibold text-primary' : 'text-foreground'}`}
          >
            {val != null && val > 0 ? val : (val === 0 ? '-' : '')}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="px-4 py-1.5 border-b border-border bg-accent/30">
        <p className="text-[12px] font-semibold text-foreground tracking-wide">当日成交明细</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-accent/10">
              <th className="px-3 py-1 text-left font-medium text-muted-foreground min-w-[80px] sticky left-0 bg-accent/10 z-10">
                <span className="text-[11px]">日期</span>
              </th>
              {dailyData.map((dd, idx) => (
                <th key={colKeys[idx]} className="px-2 py-1 text-right font-medium text-foreground min-w-[50px]">
                  <span className="text-[11px]">{dd.label}</span>
                  {columns[idx]?.subLabel && (
                    <span className="text-[10px] text-muted-foreground ml-1">{columns[idx].subLabel}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderRow('当日点数', (dd) => dd.routeStores ?? null)}
            {renderRow('成交点数', (dd) => dd.stores ?? null)}
            {renderRow('当日订单箱数', (dd) => dd.orders ?? null, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
});

DailyBreakdownTable.displayName = 'DailyBreakdownTable';

const DrilldownRow: React.FC<DrilldownRowProps> = ({
  datasetId, salesRep, region, tier, dateFrom, dateTo,
  mode = 'cumulative',
  dailyData,
  columns,
}) => {
  const [data, setData] = useState<SalesRepDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (mode === 'daily' || data) return;
    setLoading(true);
    try {
      const result = await datasetApi.getSalesRepDrilldown(
        datasetId, salesRep, region, tier, dateFrom, dateTo,
      );
      setData(result);
    } catch (err: unknown) {
      logger.error('Failed to load drilldown:', err);
    } finally {
      setLoading(false);
    }
  }, [datasetId, salesRep, region, tier, dateFrom, dateTo, data, mode]);

  useEffect(() => { loadData(); }, [loadData]);

  // 当日模式：使用行内 dailyData 渲染
  if (mode === 'daily') {
    return (
      <tr>
        <td colSpan={100} className="border-b border-border bg-accent/5 px-4 py-4">
          <DailyBreakdownTable dailyData={dailyData ?? []} columns={columns ?? []} />
        </td>
      </tr>
    );
  }

  // 累计模式：使用 API 数据渲染形态/品牌/规格下钻
  if (loading) {
    return (
      <tr>
        <td colSpan={100} className="border-b border-border bg-accent/5 px-4 py-3">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载中...
          </div>
        </td>
      </tr>
    );
  }

  if (!data || (data.formatBreakdown.length === 0 && data.brandBreakdown.length === 0 && data.specificationBreakdown.length === 0)) {
    return (
      <tr>
        <td colSpan={100} className="border-b border-border bg-accent/5 px-4 py-3">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-xs font-normal text-muted-foreground">暂无下钻数据</EmptyTitle>
              <EmptyDescription className="text-[11px]">当前业代暂无形态别、品牌或规格下钻数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </td>
      </tr>
    );
  }

  const periodLabel = getPeriodLabel(dateFrom, dateTo);

  return (
    <tr>
      <td colSpan={100} className="border-b border-border bg-accent/5 px-4 py-4">
        <div className="flex flex-col gap-3">
          <BreakdownTable
            title="形态别成交率"
            items={data.formatBreakdown as BreakdownItem[]}
            labelExtractor={(item) => item.formatType ?? ''}
            periodLabel={periodLabel}
          />
          <BreakdownTable
            title="品牌别成交率"
            items={data.brandBreakdown as BreakdownItem[]}
            labelExtractor={(item) => item.brand ?? ''}
            periodLabel={periodLabel}
          />
          <BreakdownTable
            title="规格别成交率"
            items={data.specificationBreakdown as BreakdownItem[]}
            labelExtractor={(item) => item.specification ?? ''}
            periodLabel={periodLabel}
          />
        </div>
      </td>
    </tr>
  );
};

export default memo(DrilldownRow);
