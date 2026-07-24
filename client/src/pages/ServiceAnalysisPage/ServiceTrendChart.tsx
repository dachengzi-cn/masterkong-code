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
import type { ServiceTrendItem } from './service-analysis.utils';
import { formatInt, formatPercent } from './service-analysis.utils';

interface ServiceTrendChartProps {
  data: ServiceTrendItem[];
  loading: boolean;
}

const formatMonthLabel = (month: string): string => {
  const m = parseInt(month.split('-')[1], 10);
  return `${m}月`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload as ServiceTrendItem;
  if (!item) return null;
  return (
    <div className="bg-background border border-border rounded-sm p-2 text-xs shadow-xl">
      <div className="font-medium mb-1">{label}</div>
      <div className="text-muted-foreground">
        总点数：{formatInt(item.totalPoints)}
      </div>
      <div className="text-[hsl(217,85%,52%)]">
        付费点数：{formatInt(item.paidPoints)}
      </div>
      <div className="text-[hsl(38,85%,48%)]">
        覆盖率：{formatPercent(item.coverageRate)}
      </div>
      <div className="text-[hsl(4,72%,52%)]">
        未成交：{formatInt(item.noDealPoints)}
      </div>
    </div>
  );
};

const ServiceTrendChart: React.FC<ServiceTrendChartProps> = ({
  data,
  loading,
}) => {
  const chartData = data.map((item) => ({
    ...item,
    monthLabel: formatMonthLabel(item.month),
  }));

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="text-sm font-bold text-foreground mb-4">
        月度服务点数趋势
      </div>
      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无趋势数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的趋势数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 15%, 88%)"
                vertical={false}
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
                axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{
                  fontSize: 11,
                  fill: 'hsl(220, 12%, 52%)',
                  fontFamily: 'Roboto Mono, monospace',
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatInt(v as number)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{
                  fontSize: 11,
                  fill: 'hsl(220, 12%, 52%)',
                  fontFamily: 'Roboto Mono, monospace',
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
                domain={[0, 1]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Bar
                yAxisId="left"
                dataKey="totalPoints"
                name="总服务点数"
                fill="hsl(217, 85%, 52%)"
                radius={[2, 2, 0, 0]}
                barSize={20}
              />
              <Bar
                yAxisId="left"
                dataKey="paidPoints"
                name="付费点数"
                fill="hsl(152, 60%, 55%)"
                radius={[2, 2, 0, 0]}
                barSize={20}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="coverageRate"
                name="付费覆盖率"
                stroke="hsl(38, 85%, 48%)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(38, 85%, 48%)' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ServiceTrendChart;
