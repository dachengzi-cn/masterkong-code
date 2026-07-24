import React, { useEffect, useRef, useState } from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExpiryKpiData, ExpiryOfficeAmountMom, ExpiryOfficeStoreMom, ExpiryStoreOver500Item, ExpiryTopSpecificationItem, ExpiryTrendItem } from '@shared/api.interface';

type DrilldownType = 'store' | 'spec';

interface ExpiryKpiCardsProps {
  data: ExpiryKpiData | null;
  loading: boolean;
  monthFrom?: string;
  monthTo?: string;
  activeDrilldown?: DrilldownType | null;
  onDrillDown?: (type: DrilldownType) => void;
  trend?: ExpiryTrendItem[];
  amountThreshold?: number;
  onAmountThresholdChange?: (value: number) => void;
}

const ChangeIndicator: React.FC<{ value: number }> = ({ value }) => {
  if (value === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center justify-center text-base leading-none" >➖</span>
        持平
      </span>
    );
  }
  const isUp = value > 0;
  const color = isUp ? 'text-[hsl(4_72%_52%)]' : 'text-[hsl(152_60%_42%)]';
  const Icon = isUp ? '📈' : '📉';
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <span className="inline-flex items-center justify-center text-base leading-none">{Icon}</span>
      {isUp ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
};

const formatCurrency = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};

interface SparklinePoint {
  month: string;
  amount: number;
  momDifference?: number;
}

const MiniSparkline: React.FC<{ data: SparklinePoint[] }> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(260);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) return null;

  const w = Math.max(width, 100);
  const height = 36;
  const padX = 6;
  const padY = 8;
  const arrowOffset = 5;

  const amounts = data.map((d) => d.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (w - 2 * padX);
    const y = height - padY - ((d.amount - min) / range) * (height - 2 * padY);
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div ref={containerRef} className="w-full">
      <svg width={w} height={height} className="overflow-visible" role="img" aria-label="近6月临期费用趋势">
        <polyline
          points={polyline}
          fill="none"
          stroke="hsl(217, 85%, 52%)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => {
          if (i === 0) return null;
          const diff = p.momDifference;
          if (diff === undefined || diff === null || diff === 0) return null;
          const isUp = diff > 0;
          const color = isUp ? 'hsl(4, 72%, 52%)' : 'hsl(152, 60%, 42%)';
          const cy = isUp ? p.y - arrowOffset : p.y + arrowOffset;
          if (isUp) {
            return (
              <path
                key={i}
                d={`M${p.x},${cy + 3} l-2.5,-3 l5,0 z`}
                fill={color}
              />
            );
          }
          return (
            <path
              key={i}
              d={`M${p.x},${cy - 3} l-2.5,3 l5,0 z`}
              fill={color}
            />
          );
        })}
        {points.map((p, i) => (
          <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={1.5} fill="hsl(217, 85%, 52%)" />
        ))}
      </svg>
    </div>
  );
};

const OfficeStoreMomList: React.FC<{ items: ExpiryOfficeStoreMom[] }> = ({ items }) => (
  <div className="space-y-1">
    {items.length === 0 ? (
      <div className="text-xs text-muted-foreground">无数据</div>
    ) : (
      items.map((item) => (
        <div key={item.office} className="flex items-center text-xs">
          <span className="text-foreground truncate mr-2 flex-1" title={item.office}>
            {item.office}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono font-medium text-foreground w-10 text-left">{item.count}</span>
            <div className="w-20 shrink-0">
              <ChangeIndicator value={item.momChange} />
            </div>
          </div>
        </div>
      ))
    )}
  </div>
);

const OfficeAmountMomList: React.FC<{ items: ExpiryOfficeAmountMom[] }> = ({ items }) => (
  <div className="space-y-1">
    {items.length === 0 ? (
      <div className="text-xs text-muted-foreground">无数据</div>
    ) : (
      items.map((item) => (
        <div key={item.office} className="flex items-center text-xs">
          <span className="text-foreground truncate mr-2 flex-1" title={item.office}>
            {item.office}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono font-medium text-foreground w-20 text-left">{formatCurrency(item.amount)}</span>
            <div className="w-20 shrink-0">
              <ChangeIndicator value={item.momChange} />
            </div>
          </div>
        </div>
      ))
    )}
  </div>
);

const StoreOver500Card: React.FC<{ items: ExpiryStoreOver500Item[] }> = ({ items }) => (
  <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
    {items.length === 0 ? (
      <div className="text-xs text-muted-foreground">无达标门店</div>
    ) : (
      items.map((item) => (
        <div key={item.office} className="flex items-center justify-between text-xs">
          <span className="text-foreground truncate mr-2" title={item.office}>
            {item.office}
          </span>
          <span className="font-mono font-medium text-foreground shrink-0">{item.count} 家</span>
        </div>
      ))
    )}
  </div>
);

const TopSpecificationCard: React.FC<{ items: ExpiryTopSpecificationItem[] }> = ({ items }) => (
  <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
    {items.length === 0 ? (
      <div className="text-xs text-muted-foreground">暂无规格数据</div>
    ) : (
      items.map((item, index) => (
        <div key={item.specification} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`flex items-center justify-center size-4 rounded-sm text-[10px] font-mono font-medium shrink-0 ${
                index === 0
                  ? 'bg-error/10 text-error'
                  : index === 1
                    ? 'bg-warning/10 text-warning'
                    : index === 2
                      ? 'bg-primary/10 text-primary'
                      : 'bg-accent text-accent-foreground'
              }`}
            >
              {index + 1}
            </span>
            <span className="text-foreground truncate" title={item.specification}>
              {item.specification}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-foreground">{formatCurrency(item.amount)}</span>
            <span className="font-mono text-muted-foreground w-10 text-right">{(item.share * 100).toFixed(1)}%</span>
          </div>
        </div>
      ))
    )}
  </div>
);

const formatMonthRange = (from?: string, to?: string): string => {
  if (from && to && from === to) return from;
  if (from && to) return `${from} ~ ${to}`;
  if (from) return `${from} 起`;
  if (to) return `截至 ${to}`;
  return '全部月份';
};

const ExpiryKpiCards: React.FC<ExpiryKpiCardsProps> = ({
  data,
  loading,
  monthFrom,
  monthTo,
  activeDrilldown,
  onDrillDown,
  trend,
  amountThreshold = 500,
  onAmountThresholdChange,
}) => {
  const sparklineData: SparklinePoint[] = React.useMemo(() => {
    if (!trend || trend.length === 0) return [];
    return trend.slice(-6).map((t) => ({
      month: t.month,
      amount: t.amount,
      momDifference: t.momDifference,
    }));
  }, [trend]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* 临期费用总额 + 年月 */}
      <KpiCard
        label="临期费用总额"
        icon="👛"
        loading={loading || !data}
        value={
          data ? (
            <span title={formatCurrency(data.totalAmount)}>
              <CountUp
                end={data.totalAmount}
                duration={0.6}
                decimals={2}
                separator=","
                prefix="¥"
              />
            </span>
          ) : null
        }
        subText={
          !loading && data ? (
            <>
              <div className="truncate">{formatMonthRange(monthFrom, monthTo)}</div>
              {sparklineData.length >= 2 && (
                <div className="mt-1">
                  <MiniSparkline data={sparklineData} />
                </div>
              )}
            </>
          ) : null
        }
      />

      {/* 执行门店数 + 各所门店数 */}
      <div className="bg-card border border-border rounded-sm p-4 relative overflow-hidden md:col-span-2">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[hsl(217,85%,52%)]" />
        {loading || !data ? (
          <Skeleton className="h-[80px] w-full" />
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <span className="inline-flex items-center justify-center text-base leading-none">🏬</span>
                执行门店数
              </div>
              <div className="text-xl font-medium font-['Roboto_Mono',monospace] tabular-nums truncate">
                <CountUp
                  end={data.involvedStoreCount}
                  duration={0.6}
                  decimals={0}
                  separator=","
                />
              </div>
            </div>
            <div className="flex-[2] min-w-0 border-l border-border pl-3">
              <OfficeStoreMomList items={data.officeStoreMom} />
            </div>
          </div>
        )}
      </div>

      {/* 费用环比变化 + 各所金额环比 */}
      <div className="bg-card border border-border rounded-sm p-4 relative overflow-hidden md:col-span-2">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[hsl(217,85%,52%)]" />
        {loading || !data ? (
          <Skeleton className="h-[80px] w-full" />
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <span className="inline-flex items-center justify-center text-base leading-none">↔️</span>
                费用环比变化
              </div>
              <div className="text-xl font-medium font-['Roboto_Mono',monospace] tabular-nums truncate">
                <CountUp
                  end={data.monthOverMonthChange}
                  duration={0.6}
                  decimals={1}
                  separator=","
                  suffix="%"
                />
              </div>
              <div className="mt-0.5">
                <ChangeIndicator value={data.monthOverMonthChange} />
              </div>
            </div>
            <div className="flex-[2] min-w-0 border-l border-border pl-3">
              <OfficeAmountMomList items={data.officeAmountMom} />
            </div>
          </div>
        )}
      </div>

      {/* &gt;500元门店数 */}
      <div
        className={`bg-card border rounded-sm p-4 relative overflow-hidden cursor-pointer transition-colors ${
          activeDrilldown === 'store' ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'
        }`}
        onClick={() => onDrillDown?.('store')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onDrillDown?.('store');
          }
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[hsl(217,85%,52%)]" />
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <span className="inline-flex items-center justify-center text-base leading-none">🏬</span>
          <span className="shrink-0">≥</span>
          <input
            type="number"
            min={0}
            step={100}
            value={amountThreshold}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isNaN(value) && value >= 0) {
                onAmountThresholdChange?.(value);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-14 h-5 px-1 text-xs bg-background border border-border rounded-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground tabular-nums"
          />
          <span className="shrink-0">元门店数</span>
          <span className="ml-auto text-[10px] text-primary">点击下钻</span>
        </div>
        {loading || !data ? (
          <Skeleton className="h-[80px] w-full" />
        ) : (
          <StoreOver500Card items={data.storeOver500ByOffice} />
        )}
      </div>

      {/* 规格TOP5 */}
      <div
        className={`bg-card border rounded-sm p-4 relative overflow-hidden cursor-pointer transition-colors ${
          activeDrilldown === 'spec' ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'
        }`}
        onClick={() => onDrillDown?.('spec')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onDrillDown?.('spec');
          }
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[hsl(217,85%,52%)]" />
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <span className="inline-flex items-center justify-center text-base leading-none">📦</span>
          规格TOP5
          <span className="ml-auto text-[10px] text-primary">点击下钻</span>
        </div>
        {loading || !data ? (
          <Skeleton className="h-[80px] w-full" />
        ) : (
          <TopSpecificationCard items={data.topSpecifications} />
        )}
      </div>
    </div>
  );
};

export default ExpiryKpiCards;
