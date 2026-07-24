import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { DistributionItem, ExpenseDimension } from './expense-overview.types';
import { DIMENSION_LABELS, formatCurrency } from './expense-overview.utils';

interface ExpenseDistributionChartProps {
  data: DistributionItem[];
  dimension: ExpenseDimension;
  loading: boolean;
  onDimensionChange: (dimension: ExpenseDimension) => void;
}

const CHART_COLORS = [
  'hsl(217, 85%, 52%)',
  'hsl(38, 85%, 48%)',
  'hsl(152, 60%, 42%)',
  'hsl(4, 72%, 52%)',
  'hsl(280, 60%, 52%)',
  'hsl(180, 60%, 42%)',
  'hsl(20, 80%, 52%)',
  'hsl(320, 60%, 52%)',
];

const DIMENSION_OPTIONS: { key: ExpenseDimension; label: string }[] = [
  { key: 'region', label: '所别' },
  { key: 'tier', label: '阶层' },
  { key: 'dealerType', label: '形态' },
  { key: 'business', label: '业务' },
  { key: 'specification', label: '规格' },
  { key: 'salesRep', label: '业代' },
];

const ExpenseDistributionChart: React.FC<ExpenseDistributionChartProps> = ({
  data,
  dimension,
  loading,
  onDimensionChange,
}) => {
  const useBar = data.length > 5;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload as DistributionItem;
    return (
      <div className="bg-background border border-border rounded-sm p-2 text-xs shadow-xl">
        <div className="font-medium mb-1">{item.name}</div>
        <div className="text-muted-foreground">
          合计：{formatCurrency(item.totalAmount)}
        </div>
        <div className="text-[hsl(217,85%,52%)]">
          临期费用：{formatCurrency(item.expiryAmount)}
        </div>
        <div className="text-[hsl(38,85%,48%)]">
          ATP付费金额：{formatCurrency(item.atpPaidAmount)}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-sm font-bold text-foreground">费用维度分布</div>
        <div className="flex flex-wrap items-center gap-1">
          {DIMENSION_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => onDimensionChange(option.key)}
              className={`px-2 py-0.5 text-xs rounded-sm border transition-colors ${
                dimension === option.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无{DIMENSION_LABELS[dimension]}分布数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的分布数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : useBar ? (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 40, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 15%, 88%)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{
                  fontSize: 11,
                  fill: 'hsl(220, 12%, 52%)',
                  fontFamily: 'Roboto Mono, monospace',
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v as number)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Bar
                dataKey="expiryAmount"
                name="临期费用"
                stackId="total"
                fill="hsl(217, 85%, 52%)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="atpPaidAmount"
                name="ATP付费金额"
                stackId="total"
                fill="hsl(38, 85%, 48%)"
                radius={[0, 2, 2, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="totalAmount"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={90}
                innerRadius={50}
                label={(entry) => `${entry.name}: ${((entry as any).percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ExpenseDistributionChart;
