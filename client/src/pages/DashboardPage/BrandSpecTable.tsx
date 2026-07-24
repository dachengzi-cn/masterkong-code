import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import MultiSelect from '@/components/ui/multi-select';
import { datasetApi } from '@client/src/api/index';
import type {
  HeatmapRow,
  HeatmapRowType,
  HeatmapFilterParams,
  DatasetSpecOptions,
  BrandSpecStatsRow,
} from '@shared/api.interface';

interface AddedColumn {
  id: string;
  type: 'brand' | 'specification';
  values: string[];
  data: Record<string, number>;
  storeCountData: Record<string, number>;
  threeMonthData: Record<string, number>;
  threeMonthStoreCountData: Record<string, number>;
  loading: boolean;
}

interface StoredCustomOptions {
  brands: string[];
  specifications: string[];
}

interface BrandSpecTableProps {
  rows: HeatmapRow[];
  loading?: boolean;
  datasetId: string;
  dateFrom: string;
  dateTo: string;
  filters: HeatmapFilterParams;
}

const CUSTOM_OPTIONS_STORAGE_KEY = 'brand_spec_custom_options';

function loadCustomOptions(): StoredCustomOptions {
  try {
    const raw = localStorage.getItem(CUSTOM_OPTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredCustomOptions;
      return {
        brands: parsed.brands || [],
        specifications: parsed.specifications || [],
      };
    }
  } catch {
    // ignore
  }
  return { brands: [], specifications: [] };
}

function saveCustomOptions(options: StoredCustomOptions) {
  try {
    localStorage.setItem(CUSTOM_OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
}

function aggregateRows(
  rows: HeatmapRow[],
  rowType: HeatmapRowType,
  region: string,
  tier: string,
  salesRep: string,
): HeatmapRow {
  const servicePoints = rows.reduce((sum, r) => sum + (r.servicePoints ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.totalOrders ?? 0), 0);
  return {
    salesRep,
    region,
    tier,
    servicePoints,
    totalOrders,
    dailyData: [],
    rowType,
  };
}

function buildRowsWithTotals(rows: HeatmapRow[]): HeatmapRow[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.salesRep.localeCompare(b.salesRep);
  });

  const result: HeatmapRow[] = [];
  let currentRegion = '';
  let regionRows: HeatmapRow[] = [];

  const flushRegion = () => {
    if (regionRows.length === 0) return;
    const region = regionRows[0].region;
    const tierGroups = new Map<string, HeatmapRow[]>();
    for (const r of regionRows) {
      const list = tierGroups.get(r.tier) ?? [];
      list.push(r);
      tierGroups.set(r.tier, list);
    }

    for (const [tier, tierRows] of tierGroups) {
      result.push(...tierRows);
      result.push(aggregateRows(tierRows, 'tier', region, tier, `${tier}合计`));
    }

    result.push(aggregateRows(regionRows, 'region', region, '', `${region}合计`));
    regionRows = [];
  };

  for (const row of sorted) {
    if (row.region !== currentRegion) {
      flushRegion();
      currentRegion = row.region;
    }
    regionRows.push(row);
  }
  flushRegion();

  result.push(aggregateRows(sorted, 'total', '', '', '部别合计'));
  return result;
}

function aggregateStatsRows(
  rows: BrandSpecStatsRow[],
  rowType: HeatmapRowType,
  region: string,
  tier: string,
  salesRep: string,
): BrandSpecStatsRow {
  const servicePoints = rows.reduce((sum, r) => sum + (r.servicePoints ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.totalOrders ?? 0), 0);
  const storeCount = rows.reduce((sum, r) => sum + (r.storeCount ?? 0), 0);
  return {
    salesRep,
    region,
    tier,
    servicePoints,
    totalOrders,
    storeCount,
    rowType,
  };
}

function buildStatsRowsWithTotals(rows: BrandSpecStatsRow[]): BrandSpecStatsRow[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.salesRep.localeCompare(b.salesRep);
  });

  const result: BrandSpecStatsRow[] = [];
  let currentRegion = '';
  let regionRows: BrandSpecStatsRow[] = [];

  const flushRegion = () => {
    if (regionRows.length === 0) return;
    const region = regionRows[0].region;
    const tierGroups = new Map<string, BrandSpecStatsRow[]>();
    for (const r of regionRows) {
      const list = tierGroups.get(r.tier) ?? [];
      list.push(r);
      tierGroups.set(r.tier, list);
    }

    for (const [tier, tierRows] of tierGroups) {
      result.push(...tierRows);
      result.push(aggregateStatsRows(tierRows, 'tier', region, tier, `${tier}合计`));
    }

    result.push(aggregateStatsRows(regionRows, 'region', region, '', `${region}合计`));
    regionRows = [];
  };

  for (const row of sorted) {
    if (row.region !== currentRegion) {
      flushRegion();
      currentRegion = row.region;
    }
    regionRows.push(row);
  }
  flushRegion();

  result.push(aggregateStatsRows(sorted, 'total', '', '', '部别合计'));
  return result;
}

function getRowBg(rowType?: HeatmapRowType): string {
  switch (rowType) {
    case 'tier':
      return 'bg-[hsl(217,60%,96%)]';
    case 'region':
      return 'bg-[hsl(220,18%,94%)]';
    case 'total':
      return 'bg-[hsl(220,18%,88%)]';
    default:
      return '';
  }
}

function getRowText(rowType?: HeatmapRowType): string {
  switch (rowType) {
    case 'tier':
      return 'text-foreground font-medium';
    case 'region':
    case 'total':
      return 'text-foreground font-semibold';
    default:
      return 'text-foreground';
  }
}

function getRegionCell(row: HeatmapRow): string {
  if (row.rowType === 'total') return '部别合计';
  if (row.rowType === 'region') return `${row.region}合计`;
  return row.region;
}

function getTierCell(row: HeatmapRow): string {
  if (row.rowType === 'tier') return `${row.tier}合计`;
  if (row.rowType === 'region' || row.rowType === 'total') return '';
  return row.tier;
}

function getSalesRepCell(row: HeatmapRow): string {
  if (row.rowType && row.rowType !== 'data') return '';
  return row.salesRep;
}

function getRowKey(row: { rowType?: HeatmapRowType; region: string; tier: string; salesRep: string }): string {
  return `${row.rowType ?? 'data'}|${row.region}|${row.tier}|${row.salesRep}`;
}

function formatNumber(n: number): string {
  if (n === 0) return '-';
  return n.toLocaleString('zh-CN');
}

function formatPercentage(boxCount: number, total: number): string {
  if (total === 0 || boxCount === 0) return '-';
  return `${((boxCount / total) * 100).toFixed(2)}%`;
}

function getColumnLabel(values: string[]): string {
  if (values.length === 0) return '未选择';
  if (values.length === 1) return values[0];
  return `${values[0]} +${values.length - 1}`;
}

function getRecentThreeMonthsRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const dateFromDate = subMonths(currentMonthStart, 3);
  const dateToDate = endOfMonth(subMonths(currentMonthStart, 1));
  return {
    dateFrom: format(dateFromDate, 'yyyy-MM-dd'),
    dateTo: format(dateToDate, 'yyyy-MM-dd'),
  };
}

export interface BrandSpecTableRef {
  handleAddColumn: () => void;
  handleDownload: () => void;
}

const BrandSpecTable = React.forwardRef<BrandSpecTableRef, BrandSpecTableProps>(
  ({
    rows,
    loading,
    datasetId,
    dateFrom,
    dateTo,
    filters,
  }, ref) => {
  const displayRows = useMemo(() => buildRowsWithTotals(rows), [rows]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [specOptions, setSpecOptions] = useState<DatasetSpecOptions>({
    brands: [],
    specifications: [],
    pairs: [],
  });
  const [customOptions, setCustomOptions] = useState<StoredCustomOptions>(loadCustomOptions);
  const [addedColumns, setAddedColumns] = useState<AddedColumn[]>([]);

  const mainTotalMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of displayRows) {
      map[getRowKey(row)] = row.totalOrders ?? 0;
    }
    return map;
  }, [displayRows]);

  useEffect(() => {
    if (!dialogOpen && addedColumns.length === 0) return;
    const sheetTypes = filters.sheetType ?? [];
    datasetApi
      .getSpecOptions(datasetId, sheetTypes)
      .then(setSpecOptions)
      .catch((err: unknown) => logger.error('Failed to load spec options:', err));
  }, [dialogOpen, datasetId, filters.sheetType, addedColumns.length]);

  const handleAddColumn = () => {
    setDialogOpen(true);
  };

  const handleDownload = async () => {
    if (addedColumns.length === 0) {
      toast.info('请先添加品牌/规格列');
      return;
    }
    if (addedColumns.some((col) => col.values.length === 0 || col.loading)) {
      toast.info('请等待所有列加载完成后再导出');
      return;
    }
    try {
      const XLSX = await import('xlsx-js-style');
      const headers: string[] = ['所别', '阶层', '业代', '点数', '合计箱数'];
      for (const col of addedColumns) {
        const label = getColumnLabel(col.values);
        headers.push(`${label} 箱数`);
        headers.push(`${label} 占比%`);
        headers.push(`${label} 近期三个月月合计箱数`);
        headers.push(`${label} 近期三个月成交门店数`);
      }

      const dataRows: (string | number)[][] = displayRows.map((row) => {
        const rowData: (string | number)[] = [
          getRegionCell(row),
          getTierCell(row),
          getSalesRepCell(row),
          row.servicePoints ?? 0,
          row.totalOrders ?? 0,
        ];
        for (const col of addedColumns) {
          const key = getRowKey(row);
          const boxCount = col.data[key] ?? 0;
          const total = mainTotalMap[key] ?? 0;
          rowData.push(boxCount);
          rowData.push(total > 0 ? boxCount / total : 0);
          rowData.push(col.threeMonthData[key] ?? 0);
          rowData.push(col.threeMonthStoreCountData[key] ?? 0);
        }
        return rowData;
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const blackBorder = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2B7CD3' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: blackBorder,
      };
      const tierRowStyle = {
        fill: { fgColor: { rgb: 'E6F0FA' } },
        border: blackBorder,
      };
      const regionRowStyle = {
        fill: { fgColor: { rgb: 'E8EAED' } },
        border: blackBorder,
      };
      const totalRowStyle = {
        fill: { fgColor: { rgb: 'D1D5DB' } },
        border: blackBorder,
      };
      const dataRowStyle = {
        border: blackBorder,
      };
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        const textColumns = new Set([0, 1, 2]);
        const isRatioColumn = (c: number) => c >= 5 && ((c - 5) % 4 === 1);
        const isNumericColumn = (c: number) => !textColumns.has(c) && !isRatioColumn(c);
        for (let r = 0; r <= range.e.r; ++r) {
          const isHeader = r === 0;
          const displayRow = displayRows[r - 1];
          const rowStyle = isHeader
            ? headerStyle
            : displayRow?.rowType === 'tier'
              ? tierRowStyle
              : displayRow?.rowType === 'region'
                ? regionRowStyle
                : displayRow?.rowType === 'total'
                  ? totalRowStyle
                  : dataRowStyle;
          for (let C = 0; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r, c: C });
            if (!ws[cellAddress]) continue;
            ws[cellAddress].s = rowStyle;
            if (isHeader) continue;
            if (isRatioColumn(C)) {
              ws[cellAddress].z = '0.00%';
            } else if (isNumericColumn(C)) {
              ws[cellAddress].z = '#,##0';
            }
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '品牌规格占比分析');
      XLSX.writeFile(wb, `品牌规格占比分析_${dateFrom}_${dateTo}.xlsx`);
      toast.success('导出成功');
    } catch (err: unknown) {
      logger.error('Failed to download brand-spec ratio:', err);
      toast.error('导出失败，请重试');
    }
  };

  React.useImperativeHandle(ref, () => ({
    handleAddColumn,
    handleDownload,
  }), [handleAddColumn, handleDownload]);

  const handleCreateColumn = (type: 'brand' | 'specification') => {
    const id = `${Date.now()}-${addedColumns.length}`;
    const newColumn: AddedColumn = {
      id,
      type,
      values: [],
      data: {},
      storeCountData: {},
      threeMonthData: {},
      threeMonthStoreCountData: {},
      loading: false,
    };
    setAddedColumns((prev) => [...prev, newColumn]);
    setDialogOpen(false);
  };

  const loadColumnData = useCallback(
    async (columnId: string, type: 'brand' | 'specification', values: string[]) => {
      if (values.length === 0) return;
      try {
        setAddedColumns((prev) =>
          prev.map((col) =>
            col.id === columnId ? { ...col, loading: true } : col
          )
        );
        const fetchFilters: HeatmapFilterParams = {
          ...filters,
          [type]: values,
        };
        const [result, statsResult] = await Promise.all([
          datasetApi.getHeatmapData(
            datasetId,
            dateFrom,
            dateTo,
            'day',
            fetchFilters
          ),
          (async () => {
            const { dateFrom: threeMonthFrom, dateTo: threeMonthTo } = getRecentThreeMonthsRange();
            return datasetApi.getBrandSpecStats(
              datasetId,
              threeMonthFrom,
              threeMonthTo,
              fetchFilters
            );
          })(),
        ]);
        const subtotalRows = buildRowsWithTotals(result.rows);
        const data: Record<string, number> = {};
        for (const row of subtotalRows) {
          data[getRowKey(row)] = row.totalOrders ?? 0;
        }
        const threeMonthSubtotalRows = buildStatsRowsWithTotals(statsResult.rows);
        const threeMonthData: Record<string, number> = {};
        const threeMonthStoreCountData: Record<string, number> = {};
        for (const row of threeMonthSubtotalRows) {
          const key = getRowKey(row);
          threeMonthData[key] = row.totalOrders ?? 0;
          threeMonthStoreCountData[key] = row.storeCount ?? 0;
        }
        setAddedColumns((prev) =>
          prev.map((col) =>
            col.id === columnId
              ? { ...col, data, threeMonthData, threeMonthStoreCountData, loading: false }
              : col
          )
        );
      } catch (err: unknown) {
        logger.error('Failed to load brand/spec column data:', err);
        setAddedColumns((prev) =>
          prev.map((col) =>
            col.id === columnId ? { ...col, loading: false } : col
          )
        );
      }
    },
    [datasetId, dateFrom, dateTo, filters]
  );

  const handleColumnValuesChange = (columnId: string, values: string[]) => {
    setAddedColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, values, data: {}, loading: false } : col
      )
    );
  };

  const handleCreateCustomOption = (type: 'brand' | 'specification', option: string) => {
    setCustomOptions((prev) => {
      const key = type === 'brand' ? 'brands' : 'specifications';
      if (prev[key].includes(option)) return prev;
      const updated = { ...prev, [key]: [...prev[key], option] };
      saveCustomOptions(updated);
      return updated;
    });
  };

  const handleRemoveColumn = (columnId: string) => {
    setAddedColumns((prev) => prev.filter((col) => col.id !== columnId));
  };

  useEffect(() => {
    for (const col of addedColumns) {
      if (col.values.length > 0 && Object.keys(col.data).length === 0 && !col.loading) {
        loadColumnData(col.id, col.type, col.values);
      }
    }
  }, [loadColumnData, addedColumns.map((c) => `${c.id}:${c.values.join(',')}`).join('|')]);

  useEffect(() => {
    for (const col of addedColumns) {
      if (col.values.length > 0) {
        loadColumnData(col.id, col.type, col.values);
      }
    }
  }, [loadColumnData, datasetId, dateFrom, dateTo, filters]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5 space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (displayRows.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px] bg-card border border-border rounded-sm">
        <Empty className="border-none">
          <EmptyHeader>
            <EmptyMedia variant="emoji">📊</EmptyMedia>
            <EmptyTitle>暂无品牌规格数据</EmptyTitle>
            <EmptyDescription>当前筛选条件下没有匹配的数据</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-accent/50 border-b border-border">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                所别
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                阶层
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                业代
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                点数
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                合计箱数
              </th>
              {addedColumns.map((col) => {
                const availableOptions =
                  col.type === 'brand'
                    ? Array.from(new Set([...specOptions.brands, ...customOptions.brands]))
                    : Array.from(new Set([...specOptions.specifications, ...customOptions.specifications]));
                return (
                  <React.Fragment key={col.id}>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[160px]">
                      <div className="flex items-center justify-center gap-1">
                        <MultiSelect
                          label={col.type === 'brand' ? '品牌' : '规格'}
                          options={availableOptions}
                          value={col.values}
                          onChange={(values) => handleColumnValuesChange(col.id, values)}
                          triggerClassName="h-7 w-[130px] rounded-sm"
                          allowCreate
                          onCreateOption={(option) => handleCreateCustomOption(col.type, option)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-sm text-muted-foreground hover:text-[hsl(4,72%,52%)] hover:bg-[hsl(4,72%,96%)]"
                          onClick={() => handleRemoveColumn(col.id)}
                          title="删除该列"
                        >
                          ×
                        </Button>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                        {col.type === 'brand' ? '品牌箱数' : '规格箱数'}
                      </div>
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[80px]">
                      {getColumnLabel(col.values)} 占比%
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[100px]">
                      <div className="whitespace-normal leading-tight">
                        {getColumnLabel(col.values)} 近三月月合计箱数
                      </div>
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[100px]">
                      <div className="whitespace-normal leading-tight">
                        {getColumnLabel(col.values)} 近三月成交门店数
                      </div>
                    </th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const isTotalRow = row.rowType && row.rowType !== 'data';

              return (
                <tr
                  key={`${row.region}-${row.tier}-${row.salesRep}-${index}`}
                  className={`border-b border-border/60 transition-colors duration-150 ease-out ${getRowBg(row.rowType)} ${getRowText(row.rowType)} ${!isTotalRow ? 'hover:bg-accent/10' : ''}`}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {getRegionCell(row)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {getTierCell(row)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {getSalesRepCell(row)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatNumber(row.servicePoints)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatNumber(row.totalOrders)}
                  </td>
                  {addedColumns.map((col) => {
                    const key = getRowKey(row);
                    const boxCount = col.loading ? undefined : (col.data[key] ?? 0);
                    const total = mainTotalMap[key] ?? 0;
                    return (
                      <React.Fragment key={col.id}>
                        <td className="px-2 py-2 text-center font-mono tabular-nums whitespace-nowrap">
                          {col.loading ? (
                            <Skeleton className="h-4 w-12 mx-auto" />
                          ) : col.values.length > 0 ? (
                            formatNumber(boxCount ?? 0)
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                          {col.loading ? (
                            <Skeleton className="h-4 w-12 mx-auto" />
                          ) : col.values.length > 0 ? (
                            formatPercentage(boxCount ?? 0, total)
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-mono tabular-nums whitespace-nowrap">
                          {col.loading ? (
                            <Skeleton className="h-4 w-12 mx-auto" />
                          ) : col.values.length > 0 ? (
                            formatNumber(col.threeMonthData[key] ?? 0)
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-mono tabular-nums whitespace-nowrap">
                          {col.loading ? (
                            <Skeleton className="h-4 w-12 mx-auto" />
                          ) : col.values.length > 0 ? (
                            formatNumber(col.threeMonthStoreCountData[key] ?? 0)
                          ) : (
                            '-'
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">新增列</DialogTitle>
            <DialogDescription className="text-xs">
              请选择要增加的列类型
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1 text-xs hover:bg-[hsl(217,40%,95%)] hover:border-[hsl(217,85%,52%)]"
              onClick={() => handleCreateColumn('brand')}
            >
              <span className="text-base">🏷️</span>
              <span>品牌</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1 text-xs hover:bg-[hsl(217,40%,95%)] hover:border-[hsl(217,85%,52%)]"
              onClick={() => handleCreateColumn('specification')}
            >
              <span className="text-base">📦</span>
              <span>规格</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

BrandSpecTable.displayName = 'BrandSpecTable';

export default BrandSpecTable;
