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
  const [filters, setFilters] = useState<HeatmapFilterParams>({ sheetType: DEFAULT_SHEET_TYPES });

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

  const now = new Date();
  const defaultDateRange: DateRangeValue = {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);

  const formatDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dateFrom = formatDateStr(dateRange.from);
  const dateTo = formatDateStr(dateRange.to);

  const [granularity] = useState<TimeGranularity>('day');
  const [tableData, setTableData] = useState<HeatmapResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const brandSpecTableRef = useRef<BrandSpecTableRef | null>(null);

  // 为 AI 分析准备输入数据
  const aiInputData = useMemo(() => {
    if (!tableData) return { filters: effectiveFilters } as Record<string, unknown>;
    return {
      filters: effectiveFilters,
      dateFrom,
      dateTo,
      granularity,
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
  }, [tableData, effectiveFilters, dateFrom, dateTo, granularity]);

  const fetchTableData = React.useCallback(async () => {
    if (!datasetId || !effectiveFilters.sheetType || effectiveFilters.sheetType.length === 0) {
      setTableData(null);
      setTableLoading(false);
      setTableError(null);
      return;
    }
    setTableLoading(true);
    setTableError(null);
    try {
      const result = await datasetApi.getHeatmapData(datasetId, dateFrom, dateTo, granularity, effectiveFilters);
      setTableData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load brand-spec table data:', err);
      setTableError(msg);
      setTableData(null);
    } finally {
      setTableLoading(false);
    }
  }, [datasetId, dateFrom, dateTo, granularity, effectiveFilters]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

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
        showBrandFilter={false}
        showSpecFilter={false}
        showDownloadUnconverted={false}
        rightActions={
          <AiAnalysisPanel
            pageScope="brand-spec"
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
        effectiveFilters.sheetType && effectiveFilters.sheetType.length > 0 ? (
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
              dateFrom={dateFrom}
              dateTo={dateTo}
              filters={effectiveFilters}
            />
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[400px] bg-card border border-border rounded-sm">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia variant="emoji">📊</EmptyMedia>
                <EmptyTitle>暂无分析数据</EmptyTitle>
                <EmptyDescription>请选择至少一个数据源以查看分析数据</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )
      )}
    </div>
  );
};

export default DashboardBrandSpecPage;
