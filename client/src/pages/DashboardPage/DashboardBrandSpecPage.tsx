import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';

import { logger } from '@lark-apaas/client-toolkit/logger';
import { datasetApi } from '@client/src/api/index';
import type { DatasetDetail, HeatmapFilterParams, HeatmapResponse, TimeGranularity } from '@shared/api.interface';
import { getDealerTypesForCompositeFormats } from './composite-format';
import { DEFAULT_SHEET_TYPES } from './FilterBar';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import FilterBar from './FilterBar';
import type { DateRangeValue } from './FilterBar';
import BrandSpecTable from './BrandSpecTable';
import type { BrandSpecTableRef } from './BrandSpecTable';
import { AiAnalysisPanel } from '@/components/business-ui/ai-analysis-panel';

const DashboardBrandSpecPage: React.FC = () => {
  const { datasetId: rawDatasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string | undefined>(rawDatasetId);
  const [resolving, setResolving] = useState(!rawDatasetId);

  const datasetId = resolvedId ?? rawDatasetId;

  // 用户正在编辑的待确认参数（pending）
  const [filters, setFilters] = useState<HeatmapFilterParams>({ sheetType: DEFAULT_SHEET_TYPES });

  const now = new Date();
  const defaultDateRange: DateRangeValue = {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [granularity, setGranularity] = useState<TimeGranularity>('day');

  // 已确认提交的参数，只有点击确认后才非 null，用于触发数据查询
  const [committedFilters, setCommittedFilters] = useState<HeatmapFilterParams | null>(null);
  const [committedDateRange, setCommittedDateRange] = useState<DateRangeValue | null>(null);
  const [committedGranularity, setCommittedGranularity] = useState<TimeGranularity | null>(null);

  // 查询进行中的全局状态（用于确认按钮 loading）
  const [querying, setQuerying] = useState(false);

  const [tableData, setTableData] = useState<HeatmapResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const brandSpecTableRef = useRef<BrandSpecTableRef | null>(null);

  const effectiveFilters = useMemo((): HeatmapFilterParams => {
    let result = { ...filters };
    if (!result.sheetType || result.sheetType.length === 0) {
      result = { ...result, sheetType: DEFAULT_SHEET_TYPES };
    }
    if (!result.compositeFormat || result.compositeFormat.length === 0) {
      return result;
    }
    const mappedTypes = getDealerTypesForCompositeFormats(result.compositeFormat);
    const directTypes = result.dealerType ?? [];
    const merged = Array.from(new Set([...directTypes, ...mappedTypes]));
    return { ...result, dealerType: merged.length > 0 ? merged : undefined };
  }, [filters]);

  const effectiveCommittedFilters = useMemo((): HeatmapFilterParams | null => {
    if (!committedFilters) return null;
    let result = { ...committedFilters };
    if (!result.sheetType || result.sheetType.length === 0) {
      result = { ...result, sheetType: DEFAULT_SHEET_TYPES };
    }
    if (!result.compositeFormat || result.compositeFormat.length === 0) {
      return result;
    }
    const mappedTypes = getDealerTypesForCompositeFormats(result.compositeFormat);
    const directTypes = result.dealerType ?? [];
    const merged = Array.from(new Set([...directTypes, ...mappedTypes]));
    return { ...result, dealerType: merged.length > 0 ? merged : undefined };
  }, [committedFilters]);

  const formatDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dateFrom = formatDateStr(dateRange.from);
  const dateTo = formatDateStr(dateRange.to);

  const committedDateFrom = committedDateRange ? formatDateStr(committedDateRange.from) : null;
  const committedDateTo = committedDateRange ? formatDateStr(committedDateRange.to) : null;

  // 为 AI 分析准备输入数据
  const aiInputData = useMemo(() => {
    const aiFilters = effectiveCommittedFilters ?? effectiveFilters;
    const aiDateFrom = committedDateFrom ?? dateFrom;
    const aiDateTo = committedDateTo ?? dateTo;
    const aiGranularity = committedGranularity ?? granularity;
    if (!tableData) return { filters: aiFilters } as Record<string, unknown>;
    return {
      filters: aiFilters,
      dateFrom: aiDateFrom,
      dateTo: aiDateTo,
      granularity: aiGranularity,
      summary: {
        totalRows: tableData.rows.length,
      },
      rows: tableData.rows.slice(0, 50).map((r) => ({
        salesRep: r.salesRep,
        region: r.region,
        tier: r.tier,
        servicePoints: r.servicePoints,
        totalOrders: r.totalOrders,
        rowType: r.rowType,
      })),
    };
  }, [tableData, effectiveFilters, effectiveCommittedFilters, dateFrom, dateTo, committedDateFrom, committedDateTo, granularity, committedGranularity]);

  const handleConfirm = () => {
    setCommittedFilters({ ...filters });
    setCommittedDateRange({ ...dateRange });
    setCommittedGranularity(granularity);
    setQuerying(true);
  };

  const fetchTableData = React.useCallback(async () => {
    if (!datasetId || !committedDateFrom || !committedDateTo || !committedGranularity || !effectiveCommittedFilters) {
      setTableData(null);
      setTableLoading(false);
      setTableError(null);
      return;
    }
    if (!effectiveCommittedFilters.sheetType || effectiveCommittedFilters.sheetType.length === 0) {
      setTableData(null);
      setTableLoading(false);
      setTableError(null);
      return;
    }
    setTableLoading(true);
    setTableError(null);
    try {
      const result = await datasetApi.getHeatmapData(datasetId, committedDateFrom, committedDateTo, committedGranularity, effectiveCommittedFilters);
      setTableData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load brand-spec table data:', err);
      setTableError(msg);
      setTableData(null);
    } finally {
      setTableLoading(false);
    }
  }, [datasetId, committedDateFrom, committedDateTo, committedGranularity, effectiveCommittedFilters]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  // 查询 loading 状态同步给确认按钮
  useEffect(() => {
    setQuerying(tableLoading);
  }, [tableLoading]);

  useEffect(() => {
    if (rawDatasetId) {
      setResolvedId(rawDatasetId);
      setResolving(false);
      return;
    }
    setResolving(true);
    datasetApi
      .getDatasets({ page: 1, pageSize: 1 })
      .then((res: { items: Array<{ id: string }> }) => {
        if (res.items.length > 0) {
          setResolvedId(String(res.items[0].id));
        } else {
          setResolvedId(undefined);
        }
      })
      .catch((err: unknown) => {
        logger.error('Failed to load latest dataset:', err);
        setResolvedId(undefined);
      })
      .finally(() => setResolving(false));
  }, [rawDatasetId]);

  useEffect(() => {
    if (!datasetId) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    datasetApi
      .getDatasetDetail(datasetId)
      .then((d: DatasetDetail) => {
        setDetail(d);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load dataset detail:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [datasetId]);

  if (!datasetId && !resolving) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="emoji">📊</EmptyMedia>
            <EmptyTitle>暂无数据集</EmptyTitle>
            <EmptyDescription>请先在数据管理页上传并解析数据集</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate('/')}>前往数据管理</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (!datasetId || detailLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-sm p-4 h-14" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <FilterBar
        datasetId={datasetId}
        filters={filters}
        onFiltersChange={setFilters}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onReset={() => setDateRange(defaultDateRange)}
        onConfirm={handleConfirm}
        confirming={querying}
        showBrandFilter={false}
        showSpecFilter={false}
        showDownloadUnconverted={false}
        rightActions={
          <AiAnalysisPanel
            pageScope="dashboard/brand-spec"
            inputData={aiInputData}
            defaultQuestion="请分析当前品牌规格成交数据，识别各品牌/规格的成交覆盖情况与组合机会。"
            disabled={!tableData}
            size="sm"
          />
        }
        afterAdvancedFilters={
          datasetId && effectiveFilters.sheetType && effectiveFilters.sheetType.length > 0 ? (
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => brandSpecTableRef.current?.handleAddColumn()}
                title="增加品牌/规格列"
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                添加列
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => brandSpecTableRef.current?.handleDownload()}
                title="导出品牌/规格占比"
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                导出
              </Button>
            </div>
          ) : null
        }
      />
      {datasetId && (
        effectiveCommittedFilters && committedDateFrom && committedDateTo && committedGranularity ? (
          <>
            {tableError && (
              <div className="flex items-center justify-center min-h-[200px] bg-card border border-border rounded-sm">
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="emoji">⚠️</EmptyMedia>
                    <EmptyTitle>加载失败</EmptyTitle>
                    <EmptyDescription>{tableError}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" size="sm" onClick={fetchTableData}>
                      重试
                    </Button>
                  </EmptyContent>
                </Empty>
              </div>
            )}
            <BrandSpecTable
              ref={brandSpecTableRef}
              rows={tableData?.rows ?? []}
              loading={tableLoading}
              datasetId={datasetId}
              dateFrom={committedDateFrom}
              dateTo={committedDateTo}
              filters={effectiveCommittedFilters}
            />
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[400px] bg-card border border-border rounded-sm">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia variant="emoji">📊</EmptyMedia>
                <EmptyTitle>等待确认查询</EmptyTitle>
                <EmptyDescription>请选择数据源及筛选条件，点击「确认查询」后查看分析数据</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )
      )}
    </div>
  );
};

export default DashboardBrandSpecPage;
