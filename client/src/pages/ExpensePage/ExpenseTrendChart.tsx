import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ExpiryTrendItem } from '@shared/api.interface';
import type { AtpMonthlyTrendItem } from './expense-overview.types';

interface ExpenseTrendChartProps {
  expiryTrend: ExpiryTrendItem[];
  atpMonthlyTrend: AtpMonthlyTrendItem[];
  loading: boolean;
}

const formatCurrency = (value: number): string => {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
};

const ExpenseTrendChart: React.FC<ExpenseTrendChartProps> = ({
  expiryTrend,
  atpMonthlyTrend,
  loading,
}) => {
  const months = new Set<string>();
  expiryTrend.forEach((item) => months.add(item.month));
  atpMonthlyTrend.forEach((item) => months.add(item.month));
  const sortedMonths = Array.from(months).sort();

  const data = sortedMonths.map((month) => ({
    month,
    临期费用:
      expiryTrend.find((item) => item.month === month)?.amount ?? 0,
    ATP付费金额:
      atpMonthlyTrend.find((item) => item.month === month)?.paidAmount ?? 0,
  }));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4">
          月度费用趋势
        </div>
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4">
          月度费用趋势
        </div>
        <div className="h-[260px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无趋势数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的费用趋势数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="text-sm font-bold text-foreground mb-4">
        月度费用趋势
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(220, 15%, 88%)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
              axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
              tickLine={false}
            />
            <YAxis
              tick={{
                fontSize: 11,
                fill: 'hsl(220, 12%, 52%)',
                fontFamily: 'Roboto Mono, monospace',
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCurrency(v as number)}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), '']}
              labelFormatter={(label) => `${label}`}
              contentStyle={{
                borderRadius: '2px',
                border: '1px solid hsl(220, 15%, 88%)',
                boxShadow: 'none',
                fontSize: '12px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            />
            <Bar
              dataKey="临期费用"
              fill="hsl(217, 85%, 52%)"
              radius={[2, 2, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="ATP付费金额"
              stroke="hsl(38, 85%, 48%)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(38, 85%, 48%)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExpenseTrendChart;
