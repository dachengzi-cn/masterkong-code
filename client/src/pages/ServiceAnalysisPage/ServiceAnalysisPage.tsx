import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { datasetApi, customerApi, reportApi } from '@client/src/api/index';
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
  AtpPerformanceResponse,
  AtpPerformanceRow,
  FilterOptions,
  ReportSheetData,
  ReportRow,
  ReportCell,
  ReportCellStyle,
} from '@shared/api.interface';
import { ALL_COMPOSITE_FORMATS } from '../DashboardPage/composite-format';

import ServiceFilterBar from './ServiceFilterBar';
import ServiceKpiCards from './ServiceKpiCards';
import ServiceTrendChart from './ServiceTrendChart';
import ServiceDistributionChart from './ServiceDistributionChart';
import ServiceCoverageChart from './ServiceCoverageChart';
import ServiceRankingTable from './ServiceRankingTable';
import ServiceInsights from './ServiceInsights';
import ServiceDetailTable from './ServiceDetailTable';

import type {
  ServiceFilters,
  ServiceFilterOptions,
  ServiceDimension,
  ServiceTrendItem,
} from './service-analysis.utils';
import {
  formatMonthStr,
  monthRangeToDates,
  enumerateMonths,
  getMonthLastDay,
  toAtpFilters,
  buildKpiData,
  buildDistributionData,
  buildRankingData,
  buildCoverageData,
  buildDetailRows,
  buildInsights,
} from './service-analysis.utils';

interface CellStyle {
  font?: { sz: number; color: { rgb: string }; bold?: boolean };
  alignment?: { vertical: string; horizontal?: string };
  border?: Record<string, { style: string; color: { rgb: string } }>;
  fill?: { fgColor: { rgb: string } };
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const ServiceAnalysisPage: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<ServiceFilters>(() => ({
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
  }));
  const [dimension, setDimension] = useState<ServiceDimension>('region');

  const [atpData, setAtpData] = useState<AtpPerformanceResponse | null>(null);
  const [trendData, setTrendData] = useState<ServiceTrendItem[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    regions: [],
    tiers: [],
    dealerTypes: [],
    brands: [],
    salesReps: [],
    specifications: [],
  });

  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setFilterOptions(data))
      .catch((err: unknown) =>
        logger.error('Failed to load filter options:', err),
      );
  }, []);

  useEffect(() => {
    const region = filters.region;
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setFilterOptions((prev: FilterOptions) => ({
          ...prev,
          salesReps: data.salesReps,
          dealerTypes: data.dealerTypes,
        }));
        if (filters.salesRep && filters.salesRep.length > 0) {
          const valid = filters.salesRep.filter((s: string) =>
            data.salesReps.includes(s),
          );
          if (valid.length !== filters.salesRep.length) {
            setFilters((prev: ServiceFilters) => ({
              ...prev,
              salesRep: valid.length > 0 ? valid : undefined,
            }));
          }
        }
      })
      .catch((err: unknown) =>
        logger.error('Failed to load cascaded filter options:', err),
      );
  }, [filters.region?.join(',')]);

  useEffect(() => {
    datasetApi
      .getAtpAvailableMonths()
      .then((res) => {
        const months = res.months ?? [];
        setAvailableMonths(months);
        if (months.length > 0) {
          if (months.includes(getCurrentMonth())) {
            setFilters((prev) => ({
              ...prev,
              monthFrom: getCurrentMonth(),
              monthTo: getCurrentMonth(),
            }));
          } else {
            const fallback = months[months.length - 1];
            setFilters((prev) => ({
              ...prev,
              monthFrom: fallback,
              monthTo: fallback,
            }));
          }
        }
      })
      .catch((err: unknown) =>
        logger.error('Failed to load ATP months:', err),
      );
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const atpFilters = toAtpFilters(filters);
      const { from, to } = monthRangeToDates(
        filters.monthFrom,
        filters.monthTo,
      );

      const result = await datasetApi.getAtpPerformance(
        from,
        to,
        'day',
        atpFilters,
      );
      setAtpData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load service analysis:', err);
      setError(msg);
      setAtpData({ rows: [] });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchTrendData = useCallback(async () => {
    const months =
      filters.monthFrom && filters.monthTo
        ? enumerateMonths(filters.monthFrom, filters.monthTo)
        : [];
    if (months.length === 0 || months.length > 12) {
      setTrendData([]);
      return;
    }

    setTrendLoading(true);
    try {
      const atpFilters = toAtpFilters(filters);
      const results = await Promise.all(
        months.map(async (month) => {
          const monthFrom = `${month}-01`;
          const monthTo = getMonthLastDay(month);
          const res = await datasetApi.getAtpPerformance(
            monthFrom,
            monthTo,
            'day',
            atpFilters,
          );
          const rows = res.rows;
          const totalPoints = rows.reduce((s, r) => s + r.totalPoints, 0);
          const paidPoints = rows.reduce((s, r) => s + r.paidPoints, 0);
          const noDealPoints = rows.reduce(
            (s, r) => s + (r.feeRatioNoDeal ?? 0),
            0,
          );
          const coverageRate =
            totalPoints > 0 ? paidPoints / totalPoints : 0;
          return {
            month,
            totalPoints,
            paidPoints,
            coverageRate,
            noDealPoints,
          } as ServiceTrendItem;
        }),
      );
      setTrendData(results);
    } catch (err: unknown) {
      logger.error('Failed to load trend data:', err);
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  const baseRows: AtpPerformanceRow[] = atpData?.rows ?? [];

  const hasAnyData = useMemo(() => {
    return baseRows.length > 0;
  }, [baseRows]);

  const kpiData = useMemo(
    () => (hasAnyData ? buildKpiData(baseRows) : null),
    [baseRows, hasAnyData],
  );

  const distributionData = useMemo(
    () => buildDistributionData(baseRows, dimension),
    [baseRows, dimension],
  );

  const rankingData = useMemo(
    () => buildRankingData(baseRows, dimension),
    [baseRows, dimension],
  );

  const coverageData = useMemo(
    () => buildCoverageData(baseRows, 'region'),
    [baseRows],
  );

  const detailData = useMemo(() => buildDetailRows(baseRows), [baseRows]);

  const insights = useMemo(
    () =>
      hasAnyData && kpiData
        ? buildInsights(baseRows, kpiData, trendData)
        : [],
    [baseRows, kpiData, trendData, hasAnyData],
  );

  const combinedFilterOptions: ServiceFilterOptions = useMemo(() => {
    return {
      months:
        availableMonths.length > 0
          ? availableMonths
          : Array.from({ length: 13 }, (_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - (12 - i));
              return formatMonthStr(d);
            }),
      regions: filterOptions.regions,
      tiers: filterOptions.tiers,
      salesReps: filterOptions.salesReps,
      dealerTypes: filterOptions.dealerTypes,
      compositeFormats: ALL_COMPOSITE_FORMATS,
    };
  }, [availableMonths, filterOptions]);

  const handleReset = useCallback(() => {
    const currentMonth = getCurrentMonth();
    setFilters({
      monthFrom: currentMonth,
      monthTo: currentMonth,
    });
    setDimension('region');
  }, []);

  const handleExport = useCallback(async () => {
    if (loading || exporting || !hasAnyData) return;
    setExporting(true);
    try {
      const headerStyle: ReportCellStyle = {
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
      const withHeader = (rows: ReportRow[]): ReportRow[] => {
        const header = rows[0] ?? [];
        return [
          header.map((v) => ({ v, s: headerStyle }) as ReportCell),
          ...rows.slice(1),
        ];
      };

      const kpiSheet: ReportSheetData = {
        sheetName: '总览KPI',
        rows: [
          ['指标', '数值'],
          ['总服务点数', kpiData?.totalPoints ?? 0],
          ['付费点数', kpiData?.paidPoints ?? 0],
          ['付费覆盖率', kpiData?.coverageRate ?? 0],
          ['点均销额', kpiData?.salesPerPoint ?? 0],
          ['活跃业代数', kpiData?.activeRepCount ?? 0],
          ['未成交点数', kpiData?.noDealPoints ?? 0],
          ['付费金额', kpiData?.paidAmount ?? 0],
          ['总门店销额', kpiData?.totalStoreSales ?? 0],
        ],
      };
      kpiSheet.rows = withHeader(kpiSheet.rows);

      const trendSheet: ReportSheetData = {
        sheetName: '月度趋势',
        rows: withHeader([
          ['月份', '总服务点数', '付费点数', '付费覆盖率', '未成交点数'],
          ...trendData.map((item) => [
            item.month,
            item.totalPoints,
            item.paidPoints,
            item.coverageRate,
            item.noDealPoints,
          ]),
        ]),
      };

      const distSheet: ReportSheetData = {
        sheetName: '维度分布',
        rows: withHeader([
          ['维度值', '总点数', '付费点数', '覆盖率', '总销额', '未成交点数'],
          ...distributionData.map((item) => [
            item.name,
            item.totalPoints,
            item.paidPoints,
            item.coverageRate,
            item.totalStoreSales,
            item.noDealPoints,
          ]),
        ]),
      };

      const rankSheet: ReportSheetData = {
        sheetName: '点数排行',
        rows: withHeader([
          ['维度值', '总点数', '付费点数', '覆盖率', '点均销额', '未成交点数', '占比'],
          ...rankingData.map((item) => [
            item.value,
            item.totalPoints,
            item.paidPoints,
            item.coverageRate,
            item.salesPerPoint,
            item.noDealPoints,
            item.share,
          ]),
        ]),
      };

      const detailSheet: ReportSheetData = {
        sheetName: '明细数据',
        rows: withHeader([
          ['所别', '阶层', '业代', '总点数', '付费点数', '覆盖率', '付费金额', '总门店销额', '费比', '未成交点数'],
          ...detailData.map((row) => [
            row.region,
            row.tier,
            row.salesRep,
            row.totalPoints,
            row.paidPoints,
            row.coverageRate,
            row.paidAmount,
            row.totalStoreSales,
            row.feeRatio,
            row.noDealPoints,
          ]),
        ]),
      };

      const fileName = `服务点数分析报告_${filters.monthFrom ?? ''}_${filters.monthTo ?? ''}`;
      await reportApi.generateReport({
        type: 'service-analysis',
        title: fileName,
        fileName,
        sheets: [kpiSheet, trendSheet, distSheet, rankSheet, detailSheet],
      });
      toast.success('报表已生成，请点击右上角下载按钮查看/下载');
    } catch (err: unknown) {
      logger.error('Failed to export service analysis:', err);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [
    loading,
    exporting,
    hasAnyData,
    kpiData,
    trendData,
    distributionData,
    rankingData,
    detailData,
    filters.monthFrom,
    filters.monthTo,
  ]);

  if (!hasAnyData && !loading && !error) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">📍</EmptyMedia>
              <EmptyTitle>暂无服务点数数据</EmptyTitle>
              <EmptyDescription>
                请先在数据管理页上传客户资料与订单数据，系统将自动生成服务点数分析看板
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/data-manage')}>
                前往数据管理
                <span className="inline-flex items-center justify-center text-base leading-none ml-1.5" >→</span>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <ServiceFilterBar
        filters={filters}
        options={combinedFilterOptions}
        onChange={setFilters}
        onReset={handleReset}
        onExport={handleExport}
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

      <ServiceKpiCards
        kpi={kpiData}
        loading={loading}
        monthFrom={filters.monthFrom}
        monthTo={filters.monthTo}
      />

      <ServiceTrendChart data={trendData} loading={trendLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ServiceDistributionChart
          data={distributionData}
          dimension={dimension}
          loading={loading}
          onDimensionChange={setDimension}
        />
        <ServiceRankingTable
          data={rankingData}
          dimension={dimension}
          loading={loading}
          onDimensionChange={setDimension}
        />
      </div>

      <ServiceCoverageChart data={coverageData} loading={loading} />

      <ServiceInsights insights={insights} loading={loading} />

      <ServiceDetailTable data={detailData} loading={loading} />
    </div>
  );
};

export default ServiceAnalysisPage;
