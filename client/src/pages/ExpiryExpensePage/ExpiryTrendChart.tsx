import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ExpiryTrendItem } from '@shared/api.interface';

interface ExpiryTrendChartProps {
  data: ExpiryTrendItem[];
  loading: boolean;
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function formatDifference(value?: number): string {
  if (value === undefined || value === null) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

const MomLabel: React.FC<{ x?: number; y?: number; value?: number; index?: number }> = ({
  x = 0,
  y = 0,
  value,
}) => {
  if (value === undefined || value === null) return null;
  const isUp = value > 0;
  const color = isUp ? 'hsl(4, 72%, 52%)' : 'hsl(152, 60%, 42%)';
  return (
    <text x={x} y={y - 4} fill={color} fontSize={10} fontFamily="Roboto Mono, monospace" textAnchor="middle">
      {formatDifference(value)}
    </text>
  );
};

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ExpiryTrendItem }>;
  label?: string;
}

const TrendTooltip: React.FC<TrendTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  const total = data.amount;
  const tier1 = data.tier1Amount ?? 0;
  const tier2 = data.tier2Amount ?? 0;
  const tier1Pct = total > 0 ? ((tier1 / total) * 100).toFixed(1) : '0.0';
  const tier2Pct = total > 0 ? ((tier2 / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-card border border-border rounded-sm p-3 text-xs shadow-sm">
      <div className="font-medium text-foreground mb-1.5">{label}</div>
      <div className="space-y-0.5 font-mono">
        <div className="text-foreground">
          <span className="text-muted-foreground">总金额：</span>{formatCurrency(total)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: 'hsl(217, 85%, 52%)' }} />
          <span className="text-muted-foreground">一阶：</span>
          <span className="text-foreground">{formatCurrency(tier1)}</span>
          <span className="text-muted-foreground">({tier1Pct}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: 'hsl(152, 60%, 42%)' }} />
          <span className="text-muted-foreground">二阶：</span>
          <span className="text-foreground">{formatCurrency(tier2)}</span>
          <span className="text-muted-foreground">({tier2Pct}%)</span>
        </div>
      </div>
    </div>
  );
};

const ExpiryTrendChart: React.FC<ExpiryTrendChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4">月度临期费用趋势</div>
        <Skeleton className="h-[240px] w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4">月度临期费用趋势</div>
        <div className="h-[240px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无趋势数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的临期费用趋势数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold text-foreground">月度临期费用趋势</div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: 'hsl(217, 85%, 52%)' }} />
            <span className="text-muted-foreground">一阶</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: 'hsl(152, 60%, 42%)' }} />
            <span className="text-muted-foreground">二阶</span>
          </span>
        </div>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
              axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)', fontFamily: 'Roboto Mono, monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `¥${(v as number).toLocaleString('zh-CN')}`}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'hsl(220, 18%, 97%)' }} />
            <Bar
              dataKey="tier1Amount"
              stackId="tiers"
              fill="hsl(217, 85%, 52%)"
              radius={[0, 0, 0, 0]}
              name="一阶"
            />
            <Bar
              dataKey="tier2Amount"
              stackId="tiers"
              fill="hsl(152, 60%, 42%)"
              radius={[2, 2, 0, 0]}
              name="二阶"
            >
              <LabelList dataKey="momDifference" content={<MomLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExpiryTrendChart;
