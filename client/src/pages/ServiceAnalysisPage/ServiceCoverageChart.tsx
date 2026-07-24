import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ServiceCoverageRow } from './service-analysis.utils';
import { formatInt, formatPercent } from './service-analysis.utils';

interface ServiceCoverageChartProps {
  data: ServiceCoverageRow[];
  loading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload as ServiceCoverageRow;
  if (!item) return null;
  return (
    <div className="bg-background border border-border rounded-sm p-2 text-xs shadow-xl">
      <div className="font-medium mb-1">{label}</div>
      <div className="text-muted-foreground">
        总点数：{formatInt(item.totalPoints)}
      </div>
      <div className="text-[hsl(152,60%,55%)]">
        付费点数：{formatInt(item.paidPoints)}
      </div>
      <div className="text-[hsl(4,72%,62%)]">
        未付费点数：{formatInt(item.unpaidPoints)}
      </div>
      <div className="text-[hsl(38,85%,48%)]">
        覆盖率：{formatPercent(item.coverageRate)}
      </div>
    </div>
  );
};

const getCoverageColor = (rate: number): string => {
  if (rate >= 0.7) return 'hsl(152, 60%, 55%)';
  if (rate >= 0.4) return 'hsl(38, 85%, 58%)';
  return 'hsl(4, 72%, 62%)';
};

const ServiceCoverageChart: React.FC<ServiceCoverageChartProps> = ({
  data,
  loading,
}) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold text-foreground">
          各所别付费覆盖率
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-[hsl(152,60%,55%)]" />
            ≥70%
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-[hsl(38,85%,58%)]" />
            40%-70%
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-[hsl(4,72%,62%)]" />
            &lt;40%
          </span>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无覆盖率数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的覆盖率数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 15%, 88%)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
                axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
                tickLine={false}
                interval={0}
                angle={data.length > 6 ? -30 : 0}
                textAnchor={data.length > 6 ? 'end' : 'middle'}
                height={data.length > 6 ? 50 : 30}
              />
              <YAxis
                tick={{
                  fontSize: 11,
                  fill: 'hsl(220, 12%, 52%)',
                  fontFamily: 'Roboto Mono, monospace',
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatInt(v as number)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Bar
                dataKey="paidPoints"
                name="付费点数"
                stackId="total"
                radius={[0, 0, 0, 0]}
              >
                {data.map((row, index) => (
                  <Cell
                    key={`paid-${index}`}
                    fill={getCoverageColor(row.coverageRate)}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="unpaidPoints"
                name="未付费点数"
                stackId="total"
                fill="hsl(220, 15%, 85%)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ServiceCoverageChart;
