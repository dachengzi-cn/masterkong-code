import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { expenseApi } from '@client/src/api/index';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import type { ExpiryAnalysisFilters, ExpiryAnalysisResult, ExpiryDrilldownResult } from '@shared/api.interface';
import { AiAnalysisPanel } from '@/components/business-ui/ai-analysis-panel';
import ExpiryKpiCards from './ExpiryKpiCards';
import ExpiryFilterBar from './ExpiryFilterBar';
import ExpiryTrendChart from './ExpiryTrendChart';
import ExpiryRankingTable from './ExpiryRankingTable';
import ExpiryWarningPanel from './ExpiryWarningPanel';
import ExpiryDrilldownPanel from './ExpiryDrilldownPanel';

const defaultResult: ExpiryAnalysisResult = {
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

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const ExpiryExpensePage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ExpiryAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExpiryAnalysisFilters>(() => ({
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
    amountThreshold: 500,
  }));
  const [hasExpenseData, setHasExpenseData] = useState(true);
  const [activeDrilldown, setActiveDrilldown] = useState<'store' | 'spec' | null>(null);
  const [drilldownData, setDrilldownData] = useState<ExpiryDrilldownResult | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // 为 AI 分析准备输入数据
  const aiInputData = useMemo(() => {
    if (!data) return { filters } as Record<string, unknown>;
    return {
      filters,
      kpis: {
        totalAmount: data.kpis.totalAmount,
        monthOverMonthChange: data.kpis.monthOverMonthChange,
        involvedStoreCount: data.kpis.involvedStoreCount,
      },
      trend: data.trend.slice(0, 24),
      regionRank: data.regionRank.slice(0, 10),
      tierRank: data.tierRank.slice(0, 10),
      dealerTypeRank: data.dealerTypeRank.slice(0, 10),
      businessRank: data.businessRank.slice(0, 10),
      specificationRank: data.specificationRank.slice(0, 10),
      warnings: data.warnings,
      topCurrentMonthOffices: data.topCurrentMonthOffices,
      topThreeMonthOffices: data.topThreeMonthOffices,
    };
  }, [data, filters]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await expenseApi.getExpiryAnalysis(filters);
      setData(result);
      setHasExpenseData(
        result.availableFilters.months.length > 0 ||
          result.kpis.totalAmount > 0,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load expiry analysis:', err);
      setError(msg);
      setData(defaultResult);
      setHasExpenseData(false);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!activeDrilldown) return;
    let cancelled = false;
    setDrilldownLoading(true);
    expenseApi
      .getExpiryDrilldown(filters)
      .then((result) => {
        if (!cancelled) setDrilldownData(result);
      })
      .catch((err: unknown) => {
        logger.error('Failed to refresh expiry drilldown:', err);
      })
      .finally(() => {
        if (!cancelled) setDrilldownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, activeDrilldown]);

  const handleReset = useCallback(() => {
    const currentMonth = getCurrentMonth();
    setFilters({
      monthFrom: currentMonth,
      monthTo: currentMonth,
      amountThreshold: 500,
    });
    setActiveDrilldown(null);
    setDrilldownData(null);
  }, []);

  const handleDrillDown = useCallback(async (type: 'store' | 'spec') => {
    if (activeDrilldown === type) {
      setActiveDrilldown(null);
      return;
    }
    setActiveDrilldown(type);
    setDrilldownLoading(true);
    try {
      const result = await expenseApi.getExpiryDrilldown(filters);
      setDrilldownData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load expiry drilldown:', err);
      toast.error(`下钻数据加载失败：${msg}`);
      setActiveDrilldown(null);
    } finally {
      setDrilldownLoading(false);
    }
  }, [activeDrilldown, filters]);

  const handleExport = useCallback(async () => {
    if (!data || loading) return;
    try {
      const XLSX = await import('xlsx-js-style').then((m) => m.default || m);
      const wb = XLSX.utils.book_new();

      const kpiSheet = XLSX.utils.aoa_to_sheet([
        ['临期费用总额', data.kpis.totalAmount],
        ['环比变化（%）', data.kpis.monthOverMonthChange],
        ['涉及门店数', data.kpis.involvedStoreCount],
      ]);
      XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPI');

      const trendSheet = XLSX.utils.json_to_sheet(
        data.trend.map((item) => ({
          月份: item.month,
          临期费用: item.amount,
          记录数: item.recordCount,
        })),
      );
      XLSX.utils.book_append_sheet(wb, trendSheet, '月度趋势');

      const rankSheet = XLSX.utils.json_to_sheet(
        [
          ...data.regionRank.map((r) => ({ 维度: '所别', 值: r.value, 金额: r.amount, 占比: r.share, 记录数: r.recordCount })),
          ...data.tierRank.map((r) => ({ 维度: '阶层', 值: r.value, 金额: r.amount, 占比: r.share, 记录数: r.recordCount })),
          ...data.dealerTypeRank.map((r) => ({ 维度: '形态', 值: r.value, 金额: r.amount, 占比: r.share, 记录数: r.recordCount })),
          ...data.businessRank.map((r) => ({ 维度: '业务', 值: r.value, 金额: r.amount, 占比: r.share, 记录数: r.recordCount })),
          ...data.specificationRank.map((r) => ({ 维度: '规格', 值: r.value, 金额: r.amount, 占比: r.share, 记录数: r.recordCount })),
        ],
      );
      XLSX.utils.book_append_sheet(wb, rankSheet, '排行');

      const warningSheet = XLSX.utils.json_to_sheet(
        data.warnings.map((w) => ({
          类型: w.type,
          等级: w.level,
          标题: w.title,
          描述: w.description,
          建议: w.suggestion,
          金额: w.amount,
        })),
      );
      XLSX.utils.book_append_sheet(wb, warningSheet, '预警与建议');

      XLSX.writeFile(wb, `临期费用分析报告_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('分析报告导出成功');
    } catch (err) {
      logger.error('Failed to export expiry analysis:', err);
      toast.error('导出失败，请重试');
    }
  }, [data, loading]);

  if (!hasExpenseData && !loading && !error) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle>暂无费用资料</EmptyTitle>
              <EmptyDescription>请先在数据管理页上传「数据模板-费用资料」</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/')}>前往数据管理</Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  const displayData = data ?? defaultResult;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <ExpiryFilterBar
        filters={filters}
        options={displayData.availableFilters}
        onChange={setFilters}
        onReset={handleReset}
        onExport={handleExport}
        exportDisabled={loading || !data || displayData.kpis.totalAmount === 0}
        rightActions={
          <AiAnalysisPanel
            pageScope="expiry"
            inputData={aiInputData}
            defaultQuestion="请分析当前临期费用数据，识别费用趋势、区域分布与高风险规格/门店。"
            disabled={!data || loading}
            size="sm"
          />
        }
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

      <ExpiryKpiCards
        data={displayData.kpis}
        loading={loading}
        monthFrom={filters.monthFrom}
        monthTo={filters.monthTo}
        activeDrilldown={activeDrilldown}
        onDrillDown={handleDrillDown}
        trend={displayData.trend}
        amountThreshold={filters.amountThreshold ?? 500}
        onAmountThresholdChange={(value) =>
          setFilters((prev) => ({ ...prev, amountThreshold: value }))
        }
      />

      <ExpiryDrilldownPanel
        type={activeDrilldown}
        data={drilldownData}
        loading={drilldownLoading}
        onClose={() => setActiveDrilldown(null)}
        filters={filters}
      />

      <ExpiryTrendChart data={displayData.trend} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpiryRankingTable
          data={{
            region: displayData.regionRank,
            tier: displayData.tierRank,
            dealerType: displayData.dealerTypeRank,
            business: displayData.businessRank,
            specification: displayData.specificationRank,
          }}
          loading={loading}
          filters={filters}
          exportDisabled={loading || !data || displayData.kpis.totalAmount === 0}
        />
        <ExpiryWarningPanel
          topCurrentMonthOffices={displayData.topCurrentMonthOffices}
          topThreeMonthOffices={displayData.topThreeMonthOffices}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default ExpiryExpensePage;
