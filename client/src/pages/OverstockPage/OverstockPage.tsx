import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { expenseApi, customerApi } from '@client/src/api/index';
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

  // Load ATP filter options (regions and sales reps)
  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setAtpFilterOptions(data))
      .catch((err: unknown) =>
        logger.error('Failed to load ATP filter options:', err),
      );
  }, []);

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
  }, [confirmedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canConfirm = useMemo(
    () => !!pendingFilters.monthFrom && !!pendingFilters.monthTo,
    [pendingFilters.monthFrom, pendingFilters.monthTo],
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    setConfirmedFilters({ ...pendingFilters });
    setHasConfirmedOnce(true);
  }, [canConfirm, pendingFilters]);

  // Auto-confirm initial pending filters so the page loads data on first visit
  useEffect(() => {
    if (
      !hasConfirmedOnce &&
      canConfirm &&
      (!confirmedFilters.monthFrom || !confirmedFilters.monthTo)
    ) {
      setConfirmedFilters({ ...pendingFilters });
      setHasConfirmedOnce(true);
    }
  }, [canConfirm, confirmedFilters, hasConfirmedOnce, pendingFilters]);

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
      months: overstockFilters.months,
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
        overstockFilters.specifications,
        atpFilterOptions.specifications,
      ),
      businesses: overstockFilters.businesses,
      salesReps: unionUnique(
        overstockFilters.salesReps,
        atpFilterOptions.salesReps,
      ),
      compositeFormats: [],
    };
  }, [data?.availableFilters, atpFilterOptions]);

  const hasAnyData = useMemo(() => {
    return (data?.cohorts?.length ?? 0) > 0;
  }, [data]);

  const handleExport = useCallback(async () => {
    if (!data || loading || !hasAnyData) return;
    try {
      const result = await expenseApi.getOverstockAnalysisExport(
        toOverstockFilters(confirmedFilters),
      );
      const XLSX = await import('xlsx-js-style').then((m) => m.default || m);
      const wb = XLSX.utils.book_new();

      const cohortRows = [
        [
          '门店编码',
          '门店名称',
          '规格',
          '进货月',
          '进货金额',
          '第4月临期额',
          '第5月临期额',
          '临期金额',
          '转化率',
        ],
        ...result.cohorts.map((c) => [
          c.customerCode,
          c.customerName,
          c.specification,
          c.purchaseMonth,
          c.purchaseAmount,
          c.expiryMonth4Amount,
          c.expiryMonth5Amount,
          c.expiryAmount,
          c.conversionRate,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(cohortRows);
      ws['!cols'] = [
        { wch: 16 },
        { wch: 20 },
        { wch: 30 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, '压货分析明细');

      XLSX.writeFile(
        wb,
        `压货分析_${confirmedFilters.monthFrom ?? ''}_${confirmedFilters.monthTo ?? ''}.xlsx`,
      );
      toast.success('压货分析导出成功');
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
              <EmptyTitle>暂无压货分析数据</EmptyTitle>
              <EmptyDescription>当前筛选条件下没有压货分析数据，请调整筛选条件</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/data')}>前往数据管理</Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">压货分析</h1>
      </div>

      <ExpenseFilterBar
        filters={pendingFilters}
        options={filterOptions}
        onChange={setPendingFilters}
        onReset={handleReset}
        onExport={handleExport}
        onConfirm={handleConfirm}
        canConfirm={canConfirm}
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
