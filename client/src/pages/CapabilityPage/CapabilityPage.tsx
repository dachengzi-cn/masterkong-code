import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
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
  CapabilityCompareType,
  CapabilityDimensionMeta,
  CapabilityInsightsResult,
  CapabilityLevel,
  CapabilityOptions,
  CapabilityScoreParams,
  CapabilityScoreResult,
} from '@shared/api.interface';
import {
  getCapabilityOptions,
  getCapabilityDimensions,
  getCapabilityScore,
  getCapabilityInsights,
  updateCapabilityDimensions,
} from '@/api/capability';
import CapabilityFilterBar, {
  type CapabilityFilters,
} from './CapabilityFilterBar';
import CapabilityRadarChart from './CapabilityRadarChart';
import CapabilityScoreCards from './CapabilityScoreCards';
import CapabilityDimensionTable from './CapabilityDimensionTable';
import CapabilityInsightPanel from './CapabilityInsightPanel';
import CapabilityWeightDialog from './CapabilityWeightDialog';
import CapabilityExport from './CapabilityExport';

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 将 UI 筛选条件转换为接口参数（__all__ 视为未选择） */
function toScoreParams(filters: CapabilityFilters): CapabilityScoreParams {
  return {
    level: filters.level,
    region: filters.region && filters.region !== '__all__' ? filters.region : undefined,
    salesRep:
      filters.level === 'rep' && filters.salesRep && filters.salesRep !== '__all__'
        ? filters.salesRep
        : undefined,
    monthFrom: filters.monthFrom,
    monthTo: filters.monthTo,
    compareType: filters.compareType,
  };
}

const CapabilityPage: React.FC = () => {
  const navigate = useNavigate();

  const [options, setOptions] = useState<CapabilityOptions>({
    regions: [],
    salesReps: {},
    months: [],
  });
  const [dimensions, setDimensions] = useState<CapabilityDimensionMeta[]>([]);
  const [filters, setFilters] = useState<CapabilityFilters>(() => ({
    level: 'region',
    region: '__all__',
    salesRep: '',
    monthFrom: getCurrentMonth(),
    monthTo: getCurrentMonth(),
    compareType: 'none' as CapabilityCompareType,
  }));
  const [confirmed, setConfirmed] = useState<CapabilityFilters | null>(null);
  const [hasConfirmedOnce, setHasConfirmedOnce] = useState(false);

  const [score, setScore] = useState<CapabilityScoreResult | null>(null);
  const [insights, setInsights] = useState<CapabilityInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weightOpen, setWeightOpen] = useState(false);

  // 初始化：加载下拉选项与维度配置
  useEffect(() => {
    Promise.all([getCapabilityOptions(), getCapabilityDimensions()])
      .then(([opts, dims]) => {
        setOptions(opts);
        setDimensions(dims);
        // 将默认月份对齐到有数据的最新月份
        if (opts.months.length > 0) {
          const current = getCurrentMonth();
          const target = opts.months.includes(current)
            ? current
            : opts.months[opts.months.length - 1];
          setFilters((prev) => ({
            ...prev,
            monthFrom: target,
            monthTo: target,
          }));
        }
      })
      .catch((err: unknown) => {
        logger.error('Failed to load capability options:', err);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const fetchEvaluation = useCallback(async (f: CapabilityFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = toScoreParams(f);
      const [scoreRes, insightsRes] = await Promise.all([
        getCapabilityScore(params),
        getCapabilityInsights(params),
      ]);
      setScore(scoreRes);
      setInsights(insightsRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load capability evaluation:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirmed({ ...filters });
    setHasConfirmedOnce(true);
    fetchEvaluation(filters);
  }, [filters, fetchEvaluation]);

  const handleReset = useCallback(() => {
    const resetFilters: CapabilityFilters = {
      level: 'region',
      region: '__all__',
      salesRep: '',
      monthFrom: getCurrentMonth(),
      monthTo: getCurrentMonth(),
      compareType: 'none',
    };
    setFilters(resetFilters);
    setConfirmed(resetFilters);
    setHasConfirmedOnce(true);
    fetchEvaluation(resetFilters);
  }, [fetchEvaluation]);

  const handleSaveDimensions = useCallback(
    async (body: Parameters<typeof updateCapabilityDimensions>[0]) => {
      const res = await updateCapabilityDimensions(body);
      setDimensions(res.dimensions);
    },
    [],
  );

  const hasData = useMemo(
    () => options.months.length > 0 || (score?.scores.length ?? 0) > 0,
    [options.months.length, score],
  );

  const canConfirm = useMemo(
    () => !!filters.monthFrom && !!filters.monthTo,
    [filters.monthFrom, filters.monthTo],
  );

  // 无任何业务数据时的空状态
  if (!hasData && !loading && !error && hasConfirmedOnce) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">🎯</EmptyMedia>
              <EmptyTitle>暂无业务数据</EmptyTitle>
              <EmptyDescription>
                请先在数据管理页上传「数据模板-客户资料 / 费用资料 / 成交数据集」
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/')}>前往数据管理</Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  const exportParams = confirmed ? toScoreParams(confirmed) : {};

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      {/* 页面标题与操作区 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">业务综合能力评估</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setWeightOpen(true)}
          >
            维度设置
          </Button>
          <CapabilityExport params={exportParams} disabled={!confirmed || loading} />
        </div>
      </div>

      <CapabilityFilterBar
        filters={filters}
        options={options}
        onChange={setFilters}
        onReset={handleReset}
        onConfirm={handleConfirm}
        canConfirm={canConfirm}
        loading={loading}
      />

      {error && !loading && (
        <div className="flex items-center justify-center min-h-[160px] rounded-sm border border-destructive/20 bg-destructive/10">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">⚠️</EmptyMedia>
              <EmptyTitle>评估失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => confirmed && fetchEvaluation(confirmed)}>
                重试
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {!hasConfirmedOnce ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🔍</EmptyMedia>
              <EmptyTitle>尚未生成评估结果</EmptyTitle>
              <EmptyDescription>
                请选择评估层级、对象与月份区间，点击「确认评估」生成能力雷达图
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <CapabilityScoreCards score={score} loading={loading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CapabilityRadarChart
              score={score}
              loading={loading}
            />
            <CapabilityInsightPanel insights={insights} loading={loading} />
          </div>

          <CapabilityDimensionTable score={score} loading={loading} />
        </>
      )}

      <CapabilityWeightDialog
        open={weightOpen}
        onOpenChange={setWeightOpen}
        dimensions={dimensions}
        onSave={handleSaveDimensions}
      />
    </div>
  );
};

export default CapabilityPage;
