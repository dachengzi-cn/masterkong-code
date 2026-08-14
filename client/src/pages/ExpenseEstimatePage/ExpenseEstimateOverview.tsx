import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MultiSelect from '@/components/ui/multi-select';
import FilterBar from '@/components/business-ui/filter-bar';
import KpiCard from '@/components/business-ui/kpi-card';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  expenseEstimateApi,
} from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  ExpenseEstimateSummary,
  ExpenseEstimateOptions,
  ExpenseEstimateFilterParams,
} from '@shared/api.interface';

import SplitTable from './SplitTable';
import ExpenseEstimateDetailTable from './ExpenseEstimateDetailTable';
import { formatMoney, formatUsageRate, getCurrentMonth } from './expense-estimate.utils';

interface OverviewFilters {
  monthFrom?: string;
  monthTo?: string;
  region?: string[];
  department?: string[];
  subject?: string[];
  activity?: string[];
}

const emptyOptions: ExpenseEstimateOptions = {
  months: [],
  regions: [],
  departments: [],
  subjects: [],
  activities: [],
};

const formatCompactCurrency = (value: number): string => {
  if (Math.abs(value) >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
};

const ExpenseEstimateOverview: React.FC = () => {
  const navigate = useNavigate();
  const [pendingFilters, setPendingFilters] = useState<OverviewFilters>(() => ({
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
  }));
  const [confirmedFilters, setConfirmedFilters] = useState<OverviewFilters>({});
  const [options, setOptions] = useState<ExpenseEstimateOptions>(emptyOptions);
  const [summary, setSummary] = useState<ExpenseEstimateSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConfirmedOnce, setHasConfirmedOnce] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const initialAutoConfirmRef = useRef(false);

  // 加载全局筛选项（不受筛选影响）
  useEffect(() => {
    expenseEstimateApi
      .getExpenseEstimateOptions()
      .then((data: ExpenseEstimateOptions) => {
        setOptions(data);
        // 首次加载：当前月份无数据时自动对齐到最新可用月份并确认
        if (!initialAutoConfirmRef.current) {
          initialAutoConfirmRef.current = true;
          const cur = getCurrentMonth();
          const latest = data.months.length > 0 ? data.months[data.months.length - 1] : cur;
          const target = data.months.includes(cur) ? cur : latest;
          setPendingFilters((prev) => ({ ...prev, monthFrom: target, monthTo: target }));
          setConfirmedFilters((prev) => (prev.monthFrom ? prev : { ...pendingFilters, monthFrom: target, monthTo: target }));
          setHasConfirmedOnce(true);
        }
      })
      .catch((err: unknown) =>
        logger.error('Failed to load expense estimate options:', err),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canConfirm = useMemo(
    () => !!pendingFilters.monthFrom && !!pendingFilters.monthTo,
    [pendingFilters.monthFrom, pendingFilters.monthTo],
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) {
      toast.warning('请先配置完整的筛选条件（年月区间）后再确认查询');
      return;
    }
    setConfirmedFilters({ ...pendingFilters });
    setHasConfirmedOnce(true);
  }, [canConfirm, pendingFilters]);

  const handleReset = useCallback(() => {
    const cur = getCurrentMonth();
    const fallback = options.months.length > 0 ? options.months[options.months.length - 1] : cur;
    const target = options.months.includes(cur) ? cur : fallback;
    const reset: OverviewFilters = { monthFrom: target, monthTo: target };
    setPendingFilters(reset);
    setConfirmedFilters(reset);
    setHasConfirmedOnce(true);
    setError(null);
  }, [options.months]);

  // 拉取汇总数据
  useEffect(() => {
    if (!confirmedFilters.monthFrom || !confirmedFilters.monthTo) return;
    setLoading(true);
    setError(null);
    const params: ExpenseEstimateFilterParams = { ...confirmedFilters };
    expenseEstimateApi
      .getExpenseEstimateSummary(params)
      .then((data: ExpenseEstimateSummary) => setSummary(data))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to load expense estimate summary:', err);
        setError(msg);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [confirmedFilters, reloadKey]);

  const hasAnyData = useMemo(() => {
    return !!summary && (summary.kpis.recordCount > 0 || summary.kpis.totalEstimated > 0);
  }, [summary]);

  const updateArrayFilter = useCallback(
    (key: keyof OverviewFilters, value: string[]) => {
      setPendingFilters((prev) => ({
        ...prev,
        [key]: value.length > 0 ? value : undefined,
      }));
    },
    [],
  );

  const kpis = summary?.kpis;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight">费用预估 · 达成预估</h1>
          <p className="text-xs text-muted-foreground mt-1">
            按促销活动与费用科目登记费用，系统自动汇总计算各所别 / 部别的预估使用状况
          </p>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={() => navigate('/expense-estimate/register')}
          className="h-8"
        >
          <span className="inline-flex items-center justify-center text-base leading-none mr-1">＋</span>
          登记费用
        </Button>
      </div>

      <FilterBar>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">筛选条件</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="ml-auto h-6 px-2 text-xs"
          >
            <span className="inline-flex items-center justify-center text-base leading-none mr-1">❌</span>
            重置
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">年月区间</span>
            <Select
              value={pendingFilters.monthFrom ?? ''}
              onValueChange={(v) => {
                setPendingFilters((prev) => ({ ...prev, monthFrom: v, monthTo: prev.monthTo && v > prev.monthTo ? v : prev.monthTo }));
              }}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="起始月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.months.length > 0 ? (
                    options.months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value={getCurrentMonth()}>{getCurrentMonth()}</SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">~</span>
            <Select
              value={pendingFilters.monthTo ?? ''}
              onValueChange={(v) => {
                setPendingFilters((prev) => ({ ...prev, monthTo: v, monthFrom: prev.monthFrom && v < prev.monthFrom ? v : prev.monthFrom }));
              }}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="结束月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.months.length > 0 ? (
                    options.months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value={getCurrentMonth()}>{getCurrentMonth()}</SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">所别</span>
            <MultiSelect
              label="所别"
              options={options.regions}
              value={pendingFilters.region ?? []}
              onChange={(v: string[]) => updateArrayFilter('region', v)}
              triggerClassName="h-8 w-[120px] rounded-full"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">部别</span>
            <MultiSelect
              label="部别"
              options={options.departments}
              value={pendingFilters.department ?? []}
              onChange={(v: string[]) => updateArrayFilter('department', v)}
              triggerClassName="h-8 w-[120px] rounded-full"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">费用科目</span>
            <MultiSelect
              label="费用科目"
              options={options.subjects}
              value={pendingFilters.subject ?? []}
              onChange={(v: string[]) => updateArrayFilter('subject', v)}
              triggerClassName="h-8 w-[120px] rounded-full"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">促销活动</span>
            <MultiSelect
              label="促销活动"
              options={options.activities}
              value={pendingFilters.activity ?? []}
              onChange={(v: string[]) => updateArrayFilter('activity', v)}
              triggerClassName="h-8 w-[120px] rounded-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-end mt-3 gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleConfirm}
            disabled={loading}
            className="h-6 px-3 text-xs"
          >
            {loading ? '计算中…' : '确认查询'}
          </Button>
        </div>
      </FilterBar>

      {error && (
        <div className="flex items-center justify-center min-h-[160px] rounded-sm border border-destructive/20 bg-destructive/10">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">⚠️</EmptyMedia>
              <EmptyTitle>加载失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                重试
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {!hasAnyData && !loading && !error && (
        <div className="flex items-center justify-center min-h-[40vh] rounded-sm border border-border bg-card">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🧾</EmptyMedia>
              <EmptyTitle>暂无费用预估数据</EmptyTitle>
              <EmptyDescription>
                请先在「费用登记」中登记促销活动费用，系统将自动汇总预估使用状况
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/expense-estimate/register')}>
                前往费用登记
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {hasAnyData && kpis && (
        <>
          {/* KPI 卡带 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<span>🧾</span>}
              label="预估总额"
              value={formatMoney(kpis.totalEstimated)}
              subText={`${kpis.subjectCount} 个费用科目 · ${kpis.activityCount} 个促销活动`}
              variant="primary"
              loading={loading}
            />
            <KpiCard
              icon={<span>📝</span>}
              label="已登记金额"
              value={formatMoney(kpis.totalActual)}
              subText={`${kpis.recordCount} 条登记记录`}
              variant="neutral"
              loading={loading}
            />
            <KpiCard
              icon={<span>📊</span>}
              label="整体使用率"
              value={
                kpis.overallUsageRate >= 0 ? (
                  <span className={kpis.overallUsageRate >= 100 ? 'text-[hsl(4,72%,52%)]' : ''}>
                    {formatUsageRate(kpis.overallUsageRate)}
                  </span>
                ) : (
                  '—'
                )
              }
              subText="已登记 ÷ 预估"
              variant={kpis.overallUsageRate >= 100 ? 'error' : 'primary'}
              loading={loading}
            />
            <KpiCard
              icon={<span>⚖️</span>}
              label="剩余额度"
              value={formatMoney(kpis.remainingAmount)}
              subText={
                kpis.remainingAmount < 0 ? '已超出预估额度' : '预估 − 已登记'
              }
              variant={kpis.remainingAmount < 0 ? 'error' : 'success'}
              loading={loading}
            />
          </div>

          {/* 所别 / 部别 拆分 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SplitTable
              title="按所别拆分"
              dimensionName="所别"
              rows={summary.regionBreakdown}
              loading={loading}
            />
            <SplitTable
              title="按部别拆分"
              dimensionName="部别"
              rows={summary.departmentBreakdown}
              loading={loading}
            />
          </div>

          {/* 科目 / 活动 拆分 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SplitTable
              title="按费用科目拆分"
              dimensionName="费用科目"
              rows={summary.subjectBreakdown}
              loading={loading}
            />
            <SplitTable
              title="按促销活动拆分"
              dimensionName="促销活动"
              rows={summary.activityBreakdown}
              loading={loading}
            />
          </div>

          {/* 月度预估趋势 */}
          <div className="bg-card border border-border rounded-sm p-5">
            <div className="text-sm font-bold text-foreground mb-4">月度预估趋势</div>
            {summary.monthTrend.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center">
                <Empty className="border-none py-0">
                  <EmptyHeader>
                    <EmptyMedia variant="emoji">📊</EmptyMedia>
                    <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无趋势数据</EmptyTitle>
                    <EmptyDescription className="text-xs">当前筛选条件下没有匹配的趋势数据</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary.monthTrend}
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
                      tickFormatter={(v) => formatCompactCurrency(v as number)}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatMoney(value),
                        name === '预估金额' ? '预估' : '已登记',
                      ]}
                      contentStyle={{
                        borderRadius: '2px',
                        border: '1px solid hsl(220, 15%, 88%)',
                        boxShadow: 'none',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar
                      dataKey="estimatedAmount"
                      name="预估金额"
                      fill="hsl(217, 85%, 52%)"
                      radius={[2, 2, 0, 0]}
                      barSize={18}
                    />
                    <Bar
                      dataKey="actualAmount"
                      name="已登记金额"
                      fill="hsl(220, 12%, 52%)"
                      radius={[2, 2, 0, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 预估明细 */}
          <ExpenseEstimateDetailTable
            filters={confirmedFilters}
            loading={loading}
            reloadKey={reloadKey}
          />
        </>
      )}
    </div>
  );
};

export default ExpenseEstimateOverview;
