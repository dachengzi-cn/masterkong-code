import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  TrendChartData,
  BarChartData,
  PieChartData,
  FieldConfig,
  CustomerDimension,
} from '@shared/api.interface';

const CHART_COLORS = ['#3370EB', '#E8833A', '#26BFA6', '#8B5CF6', '#F5A623'];

interface ChartCardProps {
  title: string;
  loading: boolean;
  dimension: string;
  dimensionOptions: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  onDimensionChange: (value: string) => void;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  loading,
  dimension,
  dimensionOptions,
  customerDimensions = [],
  onDimensionChange,
  children,
}) => (
  <div className="bg-card border border-border rounded-sm p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <Select value={dimension} onValueChange={onDimensionChange}>
        <SelectTrigger size="sm" className="w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dimensionOptions.map((f: FieldConfig) => (
            <SelectItem key={f.name} value={f.name}>
              {f.name}
            </SelectItem>
          ))}
          {customerDimensions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                客户维度
              </div>
              {customerDimensions.map((d: CustomerDimension) => (
                <SelectItem key={`cust_${d.field}`} value={d.field}>
                  {d.label}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
    {loading ? (
      <Skeleton className="h-[300px] w-full" />
    ) : (
      children
    )}
  </div>
);

interface TrendChartProps {
  data: TrendChartData | null;
  loading: boolean;
  dimension: string;
  dimensionOptions: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  onDimensionChange: (value: string) => void;
}

const TrendChart: React.FC<TrendChartProps> = ({
  data,
  loading,
  dimension,
  dimensionOptions,
  customerDimensions,
  onDimensionChange,
}) => {
  const option: EChartsOption = useMemo(() => {
    if (!data) return {};
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { containLabel: true, bottom: '20%' },
      xAxis: {
        type: 'category',
        data: data.xAxis,
        boundaryGap: false,
      },
      yAxis: { type: 'value' },
      series: data.series.map((s) => ({
        name: s.name,
        type: 'line',
        data: s.data,
        smooth: true,
      })),
    };
  }, [data]);

  return (
    <ChartCard
      title="趋势折线图"
      loading={loading}
      dimension={dimension}
      dimensionOptions={dimensionOptions}
      customerDimensions={customerDimensions}
      onDimensionChange={onDimensionChange}
    >
      {data && (
        <ReactECharts option={option} notMerge={false} lazyUpdate theme="ud" style={{ height: 300 }} />
      )}
    </ChartCard>
  );
};

interface BarChartProps {
  data: BarChartData | null;
  loading: boolean;
  dimension: string;
  dimensionOptions: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  onDimensionChange: (value: string) => void;
}

const BarChart: React.FC<BarChartProps> = ({
  data,
  loading,
  dimension,
  dimensionOptions,
  customerDimensions,
  onDimensionChange,
}) => {
  const option: EChartsOption = useMemo(() => {
    if (!data) return {};
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { containLabel: true, bottom: '20%' },
      xAxis: {
        type: 'category',
        data: data.categories,
        boundaryGap: true,
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: data.data,
        },
      ],
    };
  }, [data]);

  return (
    <ChartCard
      title="分布柱状图"
      loading={loading}
      dimension={dimension}
      dimensionOptions={dimensionOptions}
      customerDimensions={customerDimensions}
      onDimensionChange={onDimensionChange}
    >
      {data && (
        <ReactECharts option={option} notMerge={false} lazyUpdate theme="ud" style={{ height: 300 }} />
      )}
    </ChartCard>
  );
};

interface PieChartProps {
  data: PieChartData | null;
  loading: boolean;
  dimension: string;
  dimensionOptions: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  onDimensionChange: (value: string) => void;
}

const PieChart: React.FC<PieChartProps> = ({
  data,
  loading,
  dimension,
  dimensionOptions,
  customerDimensions,
  onDimensionChange,
}) => {
  const isTooManyCategories = (data?.items.length ?? 0) > 5;
  const option: EChartsOption = useMemo(() => {
    if (!data) return {};
    if (isTooManyCategories) {
      return {
        color: CHART_COLORS,
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { containLabel: true, bottom: '20%' },
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
          data: data.items.map((item) => item.name),
        },
        series: [
          {
            type: 'bar',
            data: data.items.map((item) => item.value),
          },
        ],
      };
    }
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: data.items.map((item) => ({
            name: item.name,
            value: item.value,
          })),
          label: { show: false },
          emphasis: { label: { show: false } },
        },
      ],
    };
  }, [data, isTooManyCategories]);

  return (
    <ChartCard
      title={isTooManyCategories ? '占比条形图' : '占比饼图'}
      loading={loading}
      dimension={dimension}
      dimensionOptions={dimensionOptions}
      customerDimensions={customerDimensions}
      onDimensionChange={onDimensionChange}
    >
      {data && (
        <ReactECharts option={option} notMerge={false} lazyUpdate theme="ud" style={{ height: 300 }} />
      )}
    </ChartCard>
  );
};

interface ComparisonChartProps {
  data: BarChartData | null;
  loading: boolean;
  dimension: string;
  dimensionOptions: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  onDimensionChange: (value: string) => void;
}

const ComparisonChart: React.FC<ComparisonChartProps> = ({
  data,
  loading,
  dimension,
  dimensionOptions,
  customerDimensions,
  onDimensionChange,
}) => {
  const option: EChartsOption = useMemo(() => {
    if (!data) return {};
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { containLabel: true, bottom: '20%' },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: data.categories,
      },
      series: [
        {
          type: 'bar',
          data: data.data,
        },
      ],
    };
  }, [data]);

  return (
    <ChartCard
      title="对比条形图"
      loading={loading}
      dimension={dimension}
      dimensionOptions={dimensionOptions}
      customerDimensions={customerDimensions}
      onDimensionChange={onDimensionChange}
    >
      {data && (
        <ReactECharts option={option} notMerge={false} lazyUpdate theme="ud" style={{ height: 300 }} />
      )}
    </ChartCard>
  );
};

interface ChartGridProps {
  trendData: TrendChartData | null;
  barData: BarChartData | null;
  pieData: PieChartData | null;
  comparisonData: BarChartData | null;
  loading: boolean;
  textFields: FieldConfig[];
  customerDimensions?: CustomerDimension[];
  trendDimension: string;
  barDimension: string;
  pieDimension: string;
  comparisonDimension: string;
  onTrendDimensionChange: (v: string) => void;
  onBarDimensionChange: (v: string) => void;
  onPieDimensionChange: (v: string) => void;
  onComparisonDimensionChange: (v: string) => void;
}

const ChartGrid: React.FC<ChartGridProps> = ({
  trendData,
  barData,
  pieData,
  comparisonData,
  loading,
  textFields,
  customerDimensions = [],
  trendDimension,
  barDimension,
  pieDimension,
  comparisonDimension,
  onTrendDimensionChange,
  onBarDimensionChange,
  onPieDimensionChange,
  onComparisonDimensionChange,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <TrendChart
        data={trendData}
        loading={loading}
        dimension={trendDimension}
        dimensionOptions={textFields}
        customerDimensions={customerDimensions}
        onDimensionChange={onTrendDimensionChange}
      />
      <BarChart
        data={barData}
        loading={loading}
        dimension={barDimension}
        dimensionOptions={textFields}
        customerDimensions={customerDimensions}
        onDimensionChange={onBarDimensionChange}
      />
      <PieChart
        data={pieData}
        loading={loading}
        dimension={pieDimension}
        dimensionOptions={textFields}
        customerDimensions={customerDimensions}
        onDimensionChange={onPieDimensionChange}
      />
      <ComparisonChart
        data={comparisonData}
        loading={loading}
        dimension={comparisonDimension}
        dimensionOptions={textFields}
        customerDimensions={customerDimensions}
        onDimensionChange={onComparisonDimensionChange}
      />
    </div>
  );
};

export default ChartGrid;
