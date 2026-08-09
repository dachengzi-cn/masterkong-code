import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { expenseApi, customerApi, reportApi } from '@client/src/api/index';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import type {
  OverstockAnalysisResult,
  FilterOptions,
  ReportRow,
  ReportCellStyle,
} from '@shared/api.interface';

import OverstockAnalysisPanel from './OverstockAnalysisPanel';
import ExpenseFilterBar from '../ExpensePage/ExpenseFilterBar';

import type {
  ExpenseOverviewFilters,
  CombinedFilterOptions,
} from '../ExpensePage/expense-overview.types';
import { toOverstockFilters } from '../ExpensePage/expense-overview.types';

const defaultOverstockResult: OverstockAnalysisResult = {
  summary: {
    totalPurchaseAmount: 0,
    totalExpiryAmount: 0,
    avgConversionRate: 0,
    flaggedStoreCount: 0,
    flaggedRepCount: 0,
    threshold: 0,
  },
  purchaseDrilldown: {
    totalPurchaseAmount: 0,
    totalPurchaseQuantity: 0,
    groups: [],
  },
  storeRisks: [],
  repRisks: [],
  specRisks: [],
  cohorts: [],
  availableFilters: {
    regions: [],
    tiers: [],
    dealerTypes: [],
    businesses: [],
    specifications: [],
    salesReps: [],
    months: [],
  },
};

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function unionUnique(...arrays: string[][]): string[] {
  const set = new Set<string>();
  arrays.forEach((arr) => arr.forEach((item) => set.add(item)));
  return Array.from(set);
}

const OverstockPage: React.FC = () => {
  const navigate = useNavigate();

  const [pendingFilters, setPendingFilters] = useState<ExpenseOverviewFilters>(() => ({
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
  }));
  const [confirmedFilters, setConfirmedFilters] = useState<ExpenseOverviewFilters>({});
  const [filterReady, setFilterReady] = useState(false);

  const [data, setData] = useState<OverstockAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConfirmedOnce, setHasConfirmedOnce] = useState(false);
  const hasAdjustedMonthRef = useRef(false);

  const [atpFilterOptions, setAtpFilterOptions] = useState<FilterOptions>({
    regions: [],
    tiers: [],
    dealerTypes: [],
    brands: [],
    salesReps: [],
    specifications: [],
  });
  const [expenseAvailableFilters, setExpenseAvailableFilters] = useState<{
    months: string[];
    specifications: string[];
  }>({ months: [], specifications: [] });

  // Load ATP filter options (regions and sales reps)
  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setAtpFilterOptions(data))
      .catch((err: unknown) =>
        logger.error('Failed to load ATP filter options:', err),
      );
  }, []);

  // Load expense analysis filter options (months, specifications) independently so dropdowns
  // are populated on first render even before a query is confirmed
  useEffect(() => {
    expenseApi
      .getAvailableFilters()
      .then((result) => setExpenseAvailableFilters(result))
      .catch((err: unknown) =>
        logger.error('Failed to load expense filter options:', err),
      );
  }, []);

  // 选项加载完成后，将默认年月对齐到可选范围内的最新月份（数据不含当月时回退），
  // 确保 Select 的受控 value 始终存在于选项中，下拉初次即可正常选择
  const didAlignMonthRef = useRef(false);
  useEffect(() => {
    if (didAlignMonthRef.current) return;
    const months = expenseAvailableFilters.months;
    if (!months.length) return;
    didAlignMonthRef.current = true;
    const current = getCurrentMonth();
    const target = months.includes(current)
      ? current
      : months[months.length - 1];
    setPendingFilters((prev) => ({ ...prev, monthFrom: target, monthTo: target }));
  }, [expenseAvailableFilters.months]);

  // Cascading update: region -> salesReps
  useEffect(() => {
    const region = pendingFilters.region;
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setAtpFilterOptions((prev: FilterOptions) => ({
          ...prev,
          salesReps: data.salesReps,
        }));
        if (pendingFilters.salesRep && pendingFilters.salesRep.length > 0) {
          const valid = pendingFilters.salesRep.filter((s: string) =>
            data.salesReps.includes(s),
          );
          if (valid.length !== pendingFilters.salesRep.length) {
            setPendingFilters((prev: ExpenseOverviewFilters) => ({
              ...prev,
              salesRep: valid.length > 0 ? valid : undefined,
            }));
          }
        }
      })
      .catch((err: unknown) =>
        logger.error('Failed to load cascaded ATP filter options:', err),
      );
  }, [pendingFilters.region?.join(',')]);

  const fetchData = useCallback(async () => {
    if (!confirmedFilters.monthFrom || !confirmedFilters.monthTo) return;
    setLoading(true);
    setError(null);
    try {
      const result = await expenseApi.getOverstockAnalysis(
        toOverstockFilters(confirmedFilters),
      );
      setData(result);

      // If the confirmed month has no data, auto-switch to the latest available month once
      const availableMonths = result.availableFilters?.months ?? [];
      if (
        !hasAdjustedMonthRef.current &&
        availableMonths.length > 0 &&
        confirmedFilters.monthFrom &&
        !availableMonths.includes(confirmedFilters.monthFrom)
      ) {
        const latestMonth = availableMonths[availableMonths.length - 1];
        hasAdjustedMonthRef.current = true;
        setConfirmedFilters({
          ...confirmedFilters,
          monthFrom: latestMonth,
          monthTo: latestMonth,
        });
        setPendingFilters((prev) => ({
          ...prev,
          monthFrom: latestMonth,
          monthTo: latestMonth,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load overstock analysis:', err);
      setError(msg);
      setData(defaultOverstockResult);
    } finally {
      setLoading(false);
    }
  }, [confirmedFilters, filterReady]);

  // Only fire a query when the user has explicitly confirmed/reset filters
  useEffect(() => {
    if (filterReady) {
      fetchData();
    }
  }, [filterReady, confirmedFilters, fetchData]);

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
    setFilterReady(true);
    setHasConfirmedOnce(true);
  }, [canConfirm, pendingFilters]);

  const handleReset = useCallback(() => {
    const currentMonth = getCurrentMonth();
    setPendingFilters({
      monthFrom: currentMonth,
      monthTo: currentMonth,
    });
    setConfirmedFilters({
      monthFrom: currentMonth,
      monthTo: currentMonth,
    });
    setFilterReady(true);
    setHasConfirmedOnce(true);
    hasAdjustedMonthRef.current = false;
  }, []);

  const filterOptions: CombinedFilterOptions = useMemo(() => {
    const overstockFilters = data?.availableFilters ?? {
      regions: [],
      tiers: [],
      dealerTypes: [],
      businesses: [],
      specifications: [],
      salesReps: [],
      months: [],
    };
    return {
      months:
        overstockFilters.months.length > 0
          ? overstockFilters.months
          : expenseAvailableFilters.months,
      regions: unionUnique(
        overstockFilters.regions,
        atpFilterOptions.regions,
      ),
      tiers: unionUnique(
        overstockFilters.tiers,
        atpFilterOptions.tiers,
      ),
      dealerTypes: unionUnique(
        overstockFilters.dealerTypes,
        atpFilterOptions.dealerTypes,
      ),
      specifications: unionUnique(
        overstockFilters.specifications.length
          ? overstockFilters.specifications
          : expenseAvailableFilters.specifications,
        atpFilterOptions.specifications,
      ),
      businesses: overstockFilters.businesses,
      salesReps: unionUnique(
        overstockFilters.salesReps,
        atpFilterOptions.salesReps,
      ),
      compositeFormats: [],
    };
  }, [data?.availableFilters, atpFilterOptions, expenseAvailableFilters]);

  const hasAnyData = useMemo(() => {
    return (data?.cohorts?.length ?? 0) > 0;
  }, [data]);

  const handleExport = useCallback(async () => {
    if (!data || loading || !hasAnyData) return;
    try {
      const result = await expenseApi.getOverstockAnalysisExport(
        toOverstockFilters(confirmedFilters),
      );
      const headerStyle: ReportCellStyle = {
        font: { bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'C6E0B4' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
      };
      const rows: ReportRow[] = [
        [
          '门店编码',
          '门店名称',
          '规格',
          '进货月',
          '进货金额',
          '进货数量',
          '第4月临期额',
          '第5月临期额',
          '临期金额',
          '转化率',
        ].map((h) => ({ v: h, s: headerStyle })),
        ...result.cohorts.map((c) => [
          c.customerCode,
          c.customerName,
          c.specification,
          c.purchaseMonth,
          c.purchaseAmount,
          c.purchaseQuantity,
          c.expiryMonth4Amount,
          c.expiryMonth5Amount,
          c.expiryAmount,
          { v: c.conversionRate, z: '0.00%' },
        ] as ReportRow),
      ];
      const fileName = `差异门店分析_${confirmedFilters.monthFrom ?? ''}_${confirmedFilters.monthTo ?? ''}`;
      await reportApi.generateReport({
        type: 'overstock',
        title: fileName,
        fileName,
        sheets: [
          {
            sheetName: '差异门店分析明细',
            rows,
            colWidths: [16, 20, 30, 12, 12, 12, 14, 14, 14, 12],
          },
        ],
      });
      toast.success('报表已生成，请点击右上角下载按钮查看/下载');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to export overstock analysis:', err);
      toast.error(`导出失败：${msg}`);
    }
  }, [data, loading, hasAnyData, confirmedFilters]);

  if (!hasAnyData && !loading && !error && hasConfirmedOnce) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle>暂无差异门店分析数据</EmptyTitle>
              <EmptyDescription>当前筛选条件下没有差异门店分析数据，请调整筛选条件</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/data')}>前往数据管理</Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  if (!hasConfirmedOnce && !loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-foreground">差异门店分析</h1>
        </div>

        <ExpenseFilterBar
          filters={pendingFilters}
          options={filterOptions}
          onChange={setPendingFilters}
          onReset={handleReset}
          onExport={handleExport}
          onConfirm={handleConfirm}
          canConfirm={canConfirm}
          loading={loading}
          exportDisabled={loading || !hasAnyData}
        />

        <div className="flex items-center justify-center min-h-[40vh]">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🔍</EmptyMedia>
              <EmptyTitle>尚未生成分析结果</EmptyTitle>
              <EmptyDescription>请完成筛选条件配置后，点击「确认查询」生成差异门店分析数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">差异门店分析</h1>
      </div>

      <ExpenseFilterBar
        filters={pendingFilters}
        options={filterOptions}
        onChange={setPendingFilters}
        onReset={handleReset}
        onExport={handleExport}
        onConfirm={handleConfirm}
        canConfirm={canConfirm}
        loading={loading}
        exportDisabled={loading || !hasAnyData}
      />

      {error && (
        <div className="flex items-center justify-center min-h-[160px] rounded-sm border border-destructive/20 bg-destructive/10">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">⚠️</EmptyMedia>
              <EmptyTitle>加载失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={fetchData}>
                重试
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      <OverstockAnalysisPanel
        data={data ?? defaultOverstockResult}
        loading={loading}
        filters={confirmedFilters}
      />
    </div>
  );
};

export default OverstockPage;
