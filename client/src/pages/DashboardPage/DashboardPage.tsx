import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { datasetApi } from '@client/src/api/index';
import type { DatasetDetail, HeatmapFilterParams, UnconvertedStoreItem, TimeGranularity, HeatmapResponse } from '@shared/api.interface';
import { getDealerTypesForCompositeFormats } from './composite-format';
import { DEFAULT_SHEET_TYPES } from './FilterBar';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import FilterBar from './FilterBar';
import type { DateRangeValue } from './FilterBar';
import SalesRepHeatmap from './SalesRepHeatmap';
import { AiAnalysisPanel } from '@/components/business-ui/ai-analysis-panel';

const DashboardPage: React.FC<{ mode?: 'cumulative' | 'daily' }> = ({ mode = 'cumulative' }) => {
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

  // Heatmap 数据，用于 AI 分析
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);

  const effectiveFilters = useMemo((): HeatmapFilterParams => {
    let result = { ...filters, mode };
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
  }, [filters, mode]);

  const effectiveCommittedFilters = useMemo((): HeatmapFilterParams | null => {
    if (!committedFilters) return null;
    let result = { ...committedFilters, mode };
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
  }, [committedFilters, mode]);

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

  const pageScope = mode === 'daily' ? 'daily' : 'cumulative';

  // 为 AI 分析准备输入数据
  const aiInputData = useMemo(() => {
    if (!heatmapData) return { mode, filters: effectiveCommittedFilters } as Record<string, unknown>;
    return {
      mode,
      filters: effectiveCommittedFilters,
      summary: {
        totalRows: heatmapData.rows.length,
        dateFrom: heatmapData.dateFrom,
        dateTo: heatmapData.dateTo,
        granularity: heatmapData.granularity,
        daysInMonth: heatmapData.daysInMonth,
      },
      // 对 AI 输入做采样截断，避免 token 过大
      rows: heatmapData.rows.slice(0, 50).map((r) => ({
        salesRep: r.salesRep,
        region: r.region,
        tier: r.tier,
        servicePoints: r.servicePoints,
        totalOrders: r.totalOrders,
        rowType: r.rowType,
        dailyData: r.dailyData?.map((d) => ({
          label: d.label,
          rate: d.rate,
          stores: d.stores,
          routeStores: d.routeStores,
          orders: d.orders,
        })),
      })),
    };
  }, [heatmapData, mode, effectiveCommittedFilters]);

  const handleConfirm = () => {
    setCommittedFilters({ ...filters });
    setCommittedDateRange({ ...dateRange });
    setCommittedGranularity(granularity);
    setQuerying(true);
  };

  const handleDownloadUnconverted = async (selectedRoutes: string[]) => {
    if (!datasetId) return;
    if (!selectedRoutes || selectedRoutes.length === 0) {
      toast.error('请至少选择一条线路');
      return;
    }
    try {
      const filtersWithRoute = { ...effectiveFilters, route: selectedRoutes };
      const result = await datasetApi.getUnconvertedStores(datasetId, dateFrom, dateTo, filtersWithRoute);
      const items: UnconvertedStoreItem[] = result.items;
      if (items.length === 0) {
        toast.info('当前筛选条件下没有未成交门店');
        return;
      }
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.utils.book_new();
      const tierGroups = new Map<string, UnconvertedStoreItem[]>();
      for (const item of items) {
        const key = item.region || '未知';
        if (!tierGroups.has(key)) tierGroups.set(key, []);
        tierGroups.get(key)!.push(item);
      }
      const sortedTiers = Array.from(tierGroups.keys()).sort();
      for (const tier of sortedTiers) {
        const groupItems = tierGroups.get(tier)!;
        const groupExtraKeys = new Set<string>();
        for (const item of groupItems) {
          if (item.extras) {
            for (const key of Object.keys(item.extras)) {
              groupExtraKeys.add(key);
            }
          }
        }
        const groupExtraHeaders = Array.from(groupExtraKeys);

        // 判断是否使用矩阵格式（有brandStatus字段且选择了品牌）
        const hasBrandStatus = groupItems.some((item: UnconvertedStoreItem) => item.brandStatus && Object.keys(item.brandStatus).length > 0);
        const brandColumns = hasBrandStatus
          ? Object.keys(groupItems[0].brandStatus || {}).sort()
          : [];

        const groupHeaders = ['客户编码', '客户名称', '所别', '层级', '业代', ...groupExtraHeaders, ...brandColumns];

        const groupRows: (string | number)[][] = [];
        const cellStyles: Array<Array<{ fill?: { fgColor?: { rgb: string } }; font?: { bold?: boolean; color?: { rgb: string } } } | null>> = [];

        for (const item of groupItems) {
          const row: (string | number)[] = [
            item.customerCode,
            item.customerName,
            item.region,
            item.tier,
            item.salesRep,
            ...groupExtraHeaders.map((h: string) => {
              const val = item.extras?.[h];
              return val != null ? String(val) : '';
            }),
          ];
          const styles: (null | { fill?: { fgColor?: { rgb: string } }; font?: { bold?: boolean; color?: { rgb: string } } })[] = new Array(row.length).fill(null);

          // 添加品牌列数据
          for (const brand of brandColumns) {
            const val = item.brandStatus?.[brand] ?? '';
            row.push(val);
            // 值为0的单元格：红色背景，白色加粗字体
            if (val === 0) {
              styles.push({
                fill: { fgColor: { rgb: 'FF0000' } },
                font: { bold: true, color: { rgb: 'FFFFFF' } },
              });
            } else {
              styles.push(null);
            }
          }

          groupRows.push(row);
          cellStyles.push(styles);
        }

        const ws = XLSX.utils.aoa_to_sheet([groupHeaders, ...groupRows]);

        // 应用单元格样式
        if (hasBrandStatus && ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref']);
          for (let R = 1; R <= range.e.r; ++R) {
            for (let C = 0; C <= range.e.c; ++C) {
              const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
              const style = cellStyles[R - 1]?.[C];
              if (style && ws[cellAddress]) {
                ws[cellAddress].s = style;
              }
            }
          }
        }

        const sheetName = tier.length > 31 ? tier.substring(0, 28) + '...' : tier;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
      const fromD = dateRange.from;
      const toD = dateRange.to;
      const fromLabel = `${fromD.getFullYear()}年${fromD.getMonth() + 1}月${fromD.getDate()}日`;
      const toLabel = `${toD.getFullYear()}年${toD.getMonth() + 1}月${toD.getDate()}日`;
      XLSX.writeFile(wb, `${fromLabel}-${toLabel}期间未成交门店明细.xlsx`);
      toast.success(`已导出 ${items.length} 家未成交门店（${sortedTiers.length} 个所）`);
    } catch {
      toast.error('导出失败，请重试');
      logger.error('Failed to download unconverted stores');
    }
  };

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
        onDownloadUnconverted={handleDownloadUnconverted}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onReset={() => setDateRange(defaultDateRange)}
        onConfirm={handleConfirm}
        confirming={querying}
        rightActions={
          <AiAnalysisPanel
            pageScope={pageScope}
            inputData={aiInputData}
            defaultQuestion={`请分析当前${mode === 'daily' ? '当日' : '累计'}成交数据，识别趋势、异常与可执行建议。`}
            disabled={!heatmapData}
            size="sm"
          />
        }
      />
      {datasetId && (
        effectiveCommittedFilters && committedDateFrom && committedDateTo && committedGranularity ? (
          <SalesRepHeatmap
            datasetId={datasetId}
            filters={effectiveCommittedFilters}
            dateFrom={committedDateFrom}
            dateTo={committedDateTo}
            granularity={granularity}
            committedGranularity={committedGranularity}
            onGranularityChange={setGranularity}
            onCommittedGranularityChange={setCommittedGranularity}
            onLoadingChange={setQuerying}
            onDataChange={setHeatmapData}
          />
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

export default DashboardPage;
