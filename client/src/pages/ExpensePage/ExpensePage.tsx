import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { expenseApi, datasetApi, customerApi } from '@client/src/api/index';
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
  ExpiryAnalysisResult,
  AtpPerformanceResponse,
  FilterOptions,
} from '@shared/api.interface';
import { ALL_COMPOSITE_FORMATS } from '../DashboardPage/composite-format';

import ExpenseFilterBar from './ExpenseFilterBar';
import ExpenseKpiCards from './ExpenseKpiCards';
import ExpenseTrendChart from './ExpenseTrendChart';
import ExpenseDistributionChart from './ExpenseDistributionChart';
import ExpenseRankingTable from './ExpenseRankingTable';
import ExpenseDetailTable from './ExpenseDetailTable';

import type {
  ExpenseOverviewFilters,
  CombinedFilterOptions,
  ExpenseDimension,
  AtpMonthlyTrendItem,
} from './expense-overview.types';
import {
  toExpiryFilters,
  toAtpFilters,
} from './expense-overview.types';
import {
  monthRangeToDates,
  enumerateMonths,
  buildDistributionData,
  buildRankingData,
  buildDetailRows,
  DIMENSION_LABELS,
} from './expense-overview.utils';

const defaultExpiryResult: ExpiryAnalysisResult = {
  kpis: {
    totalAmount: 0,
    monthOverMonthChange: 0,
    involvedStoreCount: 0,
    storeOver500ByOffice: [],
    topSpecifications: [],
    officeStoreMom: [],
    officeAmountMom: [],
  },
  trend: [],
  regionRank: [],
  tierRank: [],
  dealerTypeRank: [],
  businessRank: [],
  specificationRank: [],
  warnings: [],
  topCurrentMonthOffices: [],
  topThreeMonthOffices: [],
  availableFilters: {
    regions: [],
    tiers: [],
    dealerTypes: [],
    businesses: [],
    specifications: [],
    months: [],
  },
};

const defaultAtpResponse: AtpPerformanceResponse = {
  rows: [],
};

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function unionUnique(...arrays: string[][]): string[] {
  const set = new Set<string>();
  arrays.forEach((arr) => arr.forEach((item) => set.add(item)));
  return Array.from(set);
}

interface CellStyle {
  font?: { sz: number; color: { rgb: string }; bold?: boolean };
  alignment?: { vertical: string; horizontal?: string };
  border?: Record<string, { style: string; color: { rgb: string } }>;
  fill?: { fgColor: { rgb: string } };
}

const ExpensePage: React.FC = () => {
  const navigate = useNavigate();

  const [pendingFilters, setPendingFilters] = useState<ExpenseOverviewFilters>(() => ({
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
  }));
  const [confirmedFilters, setConfirmedFilters] = useState<ExpenseOverviewFilters>({});
  const [dimension, setDimension] = useState<ExpenseDimension>('region');

  const [expiryData, setExpiryData] = useState<ExpiryAnalysisResult | null>(
    null,
  );
  const [atpData, setAtpData] = useState<AtpPerformanceResponse | null>(null);
  const [atpMonthlyTrend, setAtpMonthlyTrend] = useState<
    AtpMonthlyTrendItem[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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

  // Load ATP filter options
  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setAtpFilterOptions(data))
      .catch((err: unknown) =>
        logger.error('Failed to load ATP filter options:', err),
      );
  }, []);

  // Cascading update: region -> salesReps + dealerTypes for ATP
  useEffect(() => {
    const region = pendingFilters.region;
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setAtpFilterOptions((prev: FilterOptions) => ({
          ...prev,
          salesReps: data.salesReps,
          dealerTypes: data.dealerTypes,
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
      const expiryFilters = toExpiryFilters(confirmedFilters);
      const atpFilters = toAtpFilters(confirmedFilters);
      const { from, to } = monthRangeToDates(
        confirmedFilters.monthFrom,
        confirmedFilters.monthTo,
      );

      // 先并行加载 2 个主数据源，加载完成后立即渲染主体
      const [expiryResult, atpResult] = await Promise.all([
        expenseApi.getExpiryAnalysis(expiryFilters),
        datasetApi.getAtpPerformance(from, to, 'day', atpFilters),
      ]);

      setExpiryData(expiryResult);
      setAtpData(atpResult);

      // If the confirmed month has no data, auto-switch to the latest available month once
      const availableMonths = expiryResult.availableFilters?.months ?? [];
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

      // 月度趋势非阻塞异步加载：不阻塞主体渲染
      const months =
        confirmedFilters.monthFrom && confirmedFilters.monthTo
          ? enumerateMonths(confirmedFilters.monthFrom, confirmedFilters.monthTo)
          : [];
      if (months.length > 0 && months.length <= 12) {
        setAtpMonthlyTrend([]); // 先清空，避免显示旧数据
        // 异步加载趋势，不 await
        (async () => {
          try {
            const monthlyResults = await Promise.all(
              months.map(async (month) => {
                const monthFrom = `${month}-01`;
                const monthTo = `${month}-${String(
                  new Date(
                    Number(month.split('-')[0]),
                    Number(month.split('-')[1]),
                    0,
                  ).getDate(),
                ).padStart(2, '0')}`;
                const res = await datasetApi.getAtpPerformance(
                  monthFrom,
                  monthTo,
                  'day',
                  atpFilters,
                );
                const paidAmount = res.rows.reduce(
                  (sum, row) => sum + row.paidAmount,
                  0,
                );
                return { month, paidAmount };
              }),
            );
            setAtpMonthlyTrend(monthlyResults);
          } catch (err: unknown) {
            logger.error('Failed to load ATP monthly trend:', err);
            setAtpMonthlyTrend([]);
          }
        })();
      } else {
        setAtpMonthlyTrend([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load expense overview:', err);
      setError(msg);
      setExpiryData(defaultExpiryResult);
      setAtpData(defaultAtpResponse);
      setAtpMonthlyTrend([]);
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

  const displayExpiryData = expiryData ?? defaultExpiryResult;
  const displayAtpData = atpData ?? defaultAtpResponse;

  const hasAnyData = useMemo(() => {
    return (
      displayExpiryData.kpis.totalAmount > 0 ||
      displayExpiryData.availableFilters.months.length > 0 ||
      displayAtpData.rows.length > 0
    );
  }, [displayExpiryData, displayAtpData]);

  const filterOptions: CombinedFilterOptions = useMemo(() => {
    const expiryFilters = displayExpiryData.availableFilters;
    return {
      months: expiryFilters.months,
      regions: unionUnique(
        expiryFilters.regions,
        atpFilterOptions.regions,
      ),
      tiers: unionUnique(expiryFilters.tiers, atpFilterOptions.tiers),
      dealerTypes: unionUnique(
        expiryFilters.dealerTypes,
        atpFilterOptions.dealerTypes,
      ),
      specifications: unionUnique(
        expiryFilters.specifications,
        atpFilterOptions.specifications,
      ),
      businesses: expiryFilters.businesses,
      salesReps: atpFilterOptions.salesReps,
      compositeFormats: ALL_COMPOSITE_FORMATS,
    };
  }, [displayExpiryData.availableFilters, atpFilterOptions]);

  const distributionData = useMemo(
    () =>
      buildDistributionData(
        displayExpiryData,
        displayAtpData.rows,
        dimension,
      ),
    [displayExpiryData, displayAtpData.rows, dimension],
  );

  const rankingData = useMemo(
    () =>
      buildRankingData(displayExpiryData, displayAtpData.rows, dimension),
    [displayExpiryData, displayAtpData.rows, dimension],
  );

  const detailData = useMemo(
    () => buildDetailRows(displayExpiryData, displayAtpData.rows),
    [displayExpiryData, displayAtpData.rows],
  );

  const handleReset = useCallback(() => {
    const currentMonth = getCurrentMonth();
    const resetFilters: ExpenseOverviewFilters = {
      monthFrom: currentMonth,
      monthTo: currentMonth,
    };
    setPendingFilters(resetFilters);
    setConfirmedFilters(resetFilters);
    setHasConfirmedOnce(false);
    setExpiryData(null);
    setAtpData(null);
    setAtpMonthlyTrend([]);
    setError(null);
    setDimension('region');
  }, []);

  const handleExport = useCallback(async () => {
    if (loading || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx-js-style').then(
        (m) => m.default || m,
      );
      const wb = XLSX.utils.book_new();

      // KPI sheet
      const atpPaidAmount = displayAtpData.rows.reduce(
        (sum, r) => sum + r.paidAmount,
        0,
      );
      const atpPaidStoreSales = displayAtpData.rows.reduce(
        (sum, r) => sum + r.paidStoreSales,
        0,
      );
      const atpTotalStoreSales = displayAtpData.rows.reduce(
        (sum, r) => sum + r.totalStoreSales,
        0,
      );
      const atpFeeRatio =
        atpPaidStoreSales > 0 ? atpPaidAmount / atpPaidStoreSales : 0;
      const atpSalesRatio =
        atpTotalStoreSales > 0 ? atpPaidStoreSales / atpTotalStoreSales : 0;

      const kpiSheet = XLSX.utils.aoa_to_sheet([
        ['指标', '数值'],
        ['临期费用总额', displayExpiryData.kpis.totalAmount],
        ['环比变化（%）', displayExpiryData.kpis.monthOverMonthChange],
        ['涉及门店数', displayExpiryData.kpis.involvedStoreCount],
        ['ATP 总付费金额', atpPaidAmount],
        ['ATP 投入费比', atpFeeRatio],
        ['ATP 付费点销额占比', atpSalesRatio],
      ]);
      XLSX.utils.book_append_sheet(wb, kpiSheet, '总览KPI');

      // Trend sheet
      const months = new Set<string>();
      displayExpiryData.trend.forEach((item) => months.add(item.month));
      atpMonthlyTrend.forEach((item) => months.add(item.month));
      const trendRows = Array.from(months)
        .sort()
        .map((month) => ({
          月份: month,
          临期费用:
            displayExpiryData.trend.find((item) => item.month === month)
              ?.amount ?? 0,
          ATP付费金额:
            atpMonthlyTrend.find((item) => item.month === month)?.paidAmount ??
            0,
        }));
      const trendSheet = XLSX.utils.json_to_sheet(trendRows);
      XLSX.utils.book_append_sheet(wb, trendSheet, '月度趋势');

      // Distribution sheet
      const distributionSheet = XLSX.utils.json_to_sheet(
        distributionData.map((item) => ({
          维度: DIMENSION_LABELS[dimension],
          值: item.name,
          临期费用: item.expiryAmount,
          ATP付费金额: item.atpPaidAmount,
          合计金额: item.totalAmount,
        })),
      );
      XLSX.utils.book_append_sheet(wb, distributionSheet, '维度分布');

      // Ranking sheet
      const rankingSheet = XLSX.utils.json_to_sheet(
        rankingData.map((item) => ({
          维度: DIMENSION_LABELS[dimension],
          值: item.value,
          合计金额: item.totalAmount,
          临期费用: item.expiryAmount,
          ATP付费金额: item.atpPaidAmount,
          占比: item.share,
          记录数: item.recordCount,
        })),
      );
      XLSX.utils.book_append_sheet(wb, rankingSheet, '费用排行');

      // Detail sheet
      const detailSheet = XLSX.utils.json_to_sheet(
        detailData.map((item) => ({
          所别: item.region,
          合计金额: item.totalAmount,
          临期费用: item.expiryAmount,
          ATP付费金额: item.atpPaidAmount,
        })),
      );
      XLSX.utils.book_append_sheet(wb, detailSheet, '费用明细对比');

      // ATP detail sheet
      const atpDetailSheet = XLSX.utils.json_to_sheet(
        displayAtpData.rows.map((row) => ({
          所别: row.region,
          阶层: row.tier,
          业代: row.salesRep,
          总点数: row.totalPoints,
          付费点数: row.paidPoints,
          付费金额: row.paidAmount,
          总门店销额: row.totalStoreSales,
          投入费比: row.paidPointFeeRatio,
          付费点销额占比: row.paidPointSalesRatio,
        })),
      );
      XLSX.utils.book_append_sheet(wb, atpDetailSheet, 'ATP绩效明细');

      const headerStyle: CellStyle = {
        fill: { fgColor: { rgb: 'E8EEFC' } },
        font: { bold: true, sz: 10, color: { rgb: '1A2433' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'D0D5DD' } },
          bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
          left: { style: 'thin', color: { rgb: 'D0D5DD' } },
          right: { style: 'thin', color: { rgb: 'D0D5DD' } },
        },
      };

      [kpiSheet, trendSheet, distributionSheet, rankingSheet, detailSheet, atpDetailSheet].forEach(
        (sheet) => {
          const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })] as Record<
              string,
              unknown
            >;
            if (cell) cell.s = headerStyle;
          }
        },
      );

      XLSX.writeFile(
        wb,
        `费用总览报告_${confirmedFilters.monthFrom ?? ''}_${confirmedFilters.monthTo ?? ''}.xlsx`,
      );
      toast.success('费用总览报告导出成功');
    } catch (err: unknown) {
      logger.error('Failed to export expense overview:', err);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [
    loading,
    exporting,
    displayExpiryData,
    displayAtpData.rows,
    atpMonthlyTrend,
    distributionData,
    rankingData,
    detailData,
    confirmedFilters.monthFrom,
    confirmedFilters.monthTo,
    dimension,
  ]);

  if (!hasAnyData && !loading && !error) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">🧾</EmptyMedia>
              <EmptyTitle>暂无费用资料</EmptyTitle>
              <EmptyDescription>
                请先在数据管理页上传费用相关数据集，系统将自动生成费用总览看板
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/data')}>
                前往数据管理
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <ExpenseFilterBar
        filters={pendingFilters}
        options={filterOptions}
        onChange={setPendingFilters}
        onReset={handleReset}
        onExport={handleExport}
        onConfirm={handleConfirm}
        canConfirm={canConfirm}
        exportDisabled={loading || exporting || !hasAnyData}
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

      <ExpenseKpiCards
        expiryKpis={displayExpiryData.kpis}
        atpRows={displayAtpData.rows}
        loading={loading}
        monthFrom={confirmedFilters.monthFrom}
        monthTo={confirmedFilters.monthTo}
      />

      <ExpenseTrendChart
        expiryTrend={displayExpiryData.trend}
        atpMonthlyTrend={atpMonthlyTrend}
        loading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpenseDistributionChart
          data={distributionData}
          dimension={dimension}
          loading={loading}
          onDimensionChange={setDimension}
        />
        <ExpenseRankingTable
          data={rankingData}
          dimension={dimension}
          loading={loading}
          onDimensionChange={setDimension}
        />
      </div>

      <ExpenseDetailTable data={detailData} loading={loading} />
    </div>
  );
};

export default ExpensePage;
