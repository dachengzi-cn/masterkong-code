import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { DbColumnStats, DbTableStatsResponse } from '@shared/api.interface';
import { columnKindLabel, formatNumber } from './db-table.utils';

interface DbTableChartPanelProps {
  stats: DbTableStatsResponse | null;
  loading: boolean;
}

type ChartType = 'bar' | 'line';

/** 可做图表的列 */
const CHARTABLE_KINDS = ['text', 'date', 'number', 'uuid', 'boolean'];

/** 压缩数值（如 1.2万） */
function compactNumber(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v));
}

function chartDataOf(stat: DbColumnStats): Array<{ name: string; 记录数: number }> {
  if (stat.kind === 'boolean') {
    return stat.topValues.map((t) => ({
      name: t.value === 'true' ? '是' : '否',
      记录数: t.count,
    }));
  }
  if (stat.topValues.length > 0) {
    return stat.topValues.map((t) => ({ name: t.value, 记录数: t.count }));
  }
  if (stat.histogram.length > 0) {
    return stat.histogram.map((h) => ({ name: h.bucket, 记录数: h.count }));
  }
  return [];
}

const DbTableChartPanel: React.FC<DbTableChartPanelProps> = ({ stats, loading }) => {
  const [dimCol, setDimCol] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('bar');

  // 默认选择第一个可做图表的列
  useEffect(() => {
    if (!stats) return;
    const first = stats.columns.find(
      (c) => CHARTABLE_KINDS.includes(c.kind) && c.count > 0,
    );
    setDimCol(first?.name ?? stats.columns[0]?.name ?? null);
  }, [stats]);

  const selected = useMemo(
    () => stats?.columns.find((c) => c.name === dimCol) ?? null,
    [stats, dimCol],
  );

  const chartData = useMemo(() => (selected ? chartDataOf(selected) : []), [selected]);

  const effectiveType: ChartType =
    chartType === 'line' && selected?.kind === 'text' ? 'bar' : chartType;

  const xInterval = useMemo(() => {
    if (chartData.length <= 12) return 0;
    return Math.max(1, Math.floor(chartData.length / 12));
  }, [chartData.length]);

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[180px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  if (!stats || stats.columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="emoji">📊</EmptyMedia>
            <EmptyTitle className="text-sm font-normal">暂无统计数据</EmptyTitle>
            <EmptyDescription className="text-xs">该表没有可统计的列</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      {/* KPI 卡片带 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="总行数" value={formatNumber(stats.totalRows)} tone="neutral" />
        {selected && (
          <>
            <KpiCard label="非空值" value={formatNumber(selected.count)} tone="neutral" />
            <KpiCard label="空值" value={formatNumber(selected.nullCount)} tone="neutral" />
            {selected.distinctCount !== null && (
              <KpiCard label="去重数" value={formatNumber(selected.distinctCount)} tone="neutral" />
            )}
            {selected.kind === 'number' && selected.min !== null && (
              <KpiCard label="最小值" value={formatNumber(selected.min)} tone="neutral" />
            )}
            {selected.kind === 'number' && selected.max !== null && (
              <KpiCard label="最大值" value={formatNumber(selected.max)} tone="neutral" />
            )}
            {selected.kind === 'number' && selected.avg !== null && (
              <KpiCard label="平均值" value={formatNumber(selected.avg)} tone="neutral" />
            )}
            {selected.kind === 'number' && selected.sum !== null && (
              <KpiCard label="合计" value={formatNumber(selected.sum)} tone="primary" />
            )}
          </>
        )}
      </div>

      {/* 图表配置 + 图表 */}
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="text-sm font-bold text-foreground">列分布图表</div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
              value={dimCol ?? ''}
              onChange={(e) => setDimCol(e.target.value)}
              aria-label="选择图表维度列"
            >
              {stats.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}（{columnKindLabel(c.kind)}）
                </option>
              ))}
            </select>
            <div className="flex h-8 items-center gap-0.5 rounded-full border border-border p-0.5">
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={cn(
                  'h-full rounded-full px-3 text-xs transition-colors duration-150 ease-out',
                  effectiveType === 'bar'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                柱状图
              </button>
              <button
                type="button"
                onClick={() => setChartType('line')}
                className={cn(
                  'h-full rounded-full px-3 text-xs transition-colors duration-150 ease-out',
                  effectiveType === 'line'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                折线图
              </button>
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center">
            <Empty className="border-none py-0">
              <EmptyHeader>
                <EmptyMedia variant="emoji">📊</EmptyMedia>
                <EmptyTitle className="text-sm font-normal text-muted-foreground">
                  该列暂无分布数据
                </EmptyTitle>
                <EmptyDescription className="text-xs">请选择其他列查看分布</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {effectiveType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    interval={xInterval}
                    tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
                    axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 8 ? `${v.slice(0, 8)}…` : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)', fontFamily: 'Roboto Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => compactNumber(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), '记录数']}
                    contentStyle={{
                      borderRadius: '2px',
                      border: '1px solid hsl(220, 15%, 88%)',
                      boxShadow: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="记录数" fill="hsl(217, 85%, 52%)" radius={[2, 2, 0, 0]} maxBarSize={48} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    interval={xInterval}
                    tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)' }}
                    axisLine={{ stroke: 'hsl(220, 15%, 88%)' }}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 10)}…` : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(220, 12%, 52%)', fontFamily: 'Roboto Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => compactNumber(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), '记录数']}
                    contentStyle={{
                      borderRadius: '2px',
                      border: '1px solid hsl(220, 15%, 88%)',
                      boxShadow: 'none',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="记录数"
                    stroke="hsl(217, 85%, 52%)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(217, 85%, 52%)' }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 列统计明细表 */}
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-4 text-sm font-bold text-foreground">列统计明细</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>列名</TableHead>
                <TableHead>类型</TableHead>
                <TableHead data-align="right">非空</TableHead>
                <TableHead data-align="right">空值</TableHead>
                <TableHead data-align="right">去重</TableHead>
                <TableHead data-align="right">最小</TableHead>
                <TableHead data-align="right">最大</TableHead>
                <TableHead data-align="right">平均</TableHead>
                <TableHead data-align="right">合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.columns.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                    {c.name}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {columnKindLabel(c.kind)}
                    </span>
                  </TableCell>
                  <TableCell data-align="right">{formatNumber(c.count)}</TableCell>
                  <TableCell data-align="right">{formatNumber(c.nullCount)}</TableCell>
                  <TableCell data-align="right">
                    {c.distinctCount !== null ? formatNumber(c.distinctCount) : '—'}
                  </TableCell>
                  <TableCell data-align="right">{c.min !== null ? formatNumber(c.min) : '—'}</TableCell>
                  <TableCell data-align="right">{c.max !== null ? formatNumber(c.max) : '—'}</TableCell>
                  <TableCell data-align="right">{c.avg !== null ? formatNumber(c.avg) : '—'}</TableCell>
                  <TableCell data-align="right">{c.sum !== null ? formatNumber(c.sum) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  tone: 'neutral' | 'primary';
}> = ({ label, value, tone }) => (
  <div
    className={cn(
      'bg-card border border-border rounded-sm p-4 border-l-2',
      tone === 'primary' ? 'border-l-primary' : 'border-l-border',
    )}
  >
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 truncate font-mono text-lg font-medium tabular-nums text-foreground">
      {value}
    </div>
  </div>
);

export default DbTableChartPanel;
