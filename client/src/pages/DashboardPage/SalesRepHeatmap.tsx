import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { datasetApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  HeatmapResponse,
  HeatmapRow,
  HeatmapRowType,
  HeatmapDailyData,
  HeatmapColumnHeader,
  HeatmapFilterParams,
  TimeGranularity,
  SalesRepDrilldownResponse,
} from '@shared/api.interface';
import DrilldownRow from './DrilldownRow';
import { extractChineseName } from './tableFormat';

type CellStyle = Record<string, unknown>;

interface SalesRepHeatmapProps {
  datasetId: string;
  filters: HeatmapFilterParams;
  dateFrom: string;
  dateTo: string;
  granularity: TimeGranularity;
  committedGranularity?: TimeGranularity | null;
  onGranularityChange: (g: TimeGranularity) => void;
  onCommittedGranularityChange?: (g: TimeGranularity) => void;
  onLoadingChange?: (loading: boolean) => void;
  onDataChange?: (data: HeatmapResponse | null) => void;
}

const GRANULARITY_OPTIONS: Array<{ value: TimeGranularity; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
];

function formatRate(rate: number | null): string {
  if (rate === null) return '';
  if (rate === 0) return '-';
  const pct = Math.round(rate * 100);
  return `${pct}%`;
}

function aggregateRows(rows: HeatmapRow[], columns: HeatmapColumnHeader[], rowType: HeatmapRowType, region: string, tier: string, salesRep: string, isDailyMode?: boolean): HeatmapRow {
  const servicePoints = rows.reduce((sum, r) => sum + (r.servicePoints ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.totalOrders ?? 0), 0);
  const dailyData: HeatmapDailyData[] = columns.map((col, ci) => {
    const stores = rows.reduce((sum, r) => sum + (r.dailyData?.[ci]?.stores ?? 0), 0);
    if (isDailyMode) {
      // 当日模式合计：合计成交点数 / 合计当日线路点数
      const routeStores = rows.reduce((sum, r) => sum + (r.dailyData?.[ci]?.routeStores ?? 0), 0);
      const orders = rows.reduce((sum, r) => sum + (r.dailyData?.[ci]?.orders ?? 0), 0);
      if (routeStores === 0) {
        return { day: col.index, label: col.label, rate: null, stores: null, routeStores: null, orders: null };
      }
      const rate = stores / routeStores;
      return { day: col.index, label: col.label, rate, stores: stores > 0 ? stores : null, routeStores, orders };
    }
    const rate = servicePoints > 0 ? stores / servicePoints : null;
    return { day: col.index, label: col.label, rate, stores: stores > 0 ? stores : null };
  });
  return { salesRep, region, tier, servicePoints, totalOrders, dailyData, rowType };
}

function buildRowsWithTotals(rows: HeatmapRow[], columns: HeatmapColumnHeader[], isDailyMode?: boolean): HeatmapRow[] {
  if (rows.length === 0) return [];

  // 按所别 -> 阶层 -> 业代排序，确保分组稳定
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
    // 按阶层分组
    const tierGroups = new Map<string, HeatmapRow[]>();
    for (const r of regionRows) {
      const list = tierGroups.get(r.tier) ?? [];
      list.push(r);
      tierGroups.set(r.tier, list);
    }

    // 先输出各阶层数据行及阶层合计
    for (const [tier, tierRows] of tierGroups) {
      result.push(...tierRows);
      result.push(aggregateRows(tierRows, columns, 'tier', region, tier, `${tier}合计`, isDailyMode));
    }

    // 所别合计
    result.push(aggregateRows(regionRows, columns, 'region', region, '', `${region}合计`, isDailyMode));
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

  // 部别合计
  result.push(aggregateRows(sorted, columns, 'total', '', '', '部别合计', isDailyMode));
  return result;
}

function getRateBg(rate: number | null): string {
  if (rate === null) return 'hsl(220, 10%, 95%)';
  if (rate === 0) return 'hsl(0, 0%, 100%)';
  if (rate < 0.15) return 'hsl(217, 70%, 96%)';
  if (rate < 0.3) return 'hsl(217, 70%, 91%)';
  if (rate < 0.5) return 'hsl(217, 70%, 84%)';
  if (rate < 0.7) return 'hsl(217, 70%, 75%)';
  if (rate < 0.9) return 'hsl(217, 70%, 65%)';
  if (rate < 1) return 'hsl(217, 70%, 55%)';
  return 'hsl(152, 55%, 82%)';
}

function getTotalRowBg(rowType?: HeatmapRowType): string | null {
  switch (rowType) {
    case 'tier': return 'hsl(217, 60%, 94%)';
    case 'region': return 'hsl(220, 18%, 92%)';
    case 'total': return 'hsl(220, 18%, 86%)';
    default: return null;
  }
}

function getRateText(rate: number | null, isBottom30?: boolean): string {
  if (rate === null) return 'hsl(220, 10%, 75%)';
  if (isBottom30) return 'hsl(4, 72%, 52%)';
  if (rate >= 0.5 && rate < 1) return 'hsl(0, 0%, 100%)';
  return 'hsl(220, 25%, 12%)';
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toH = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `${toH(r)}${toH(g)}${toH(b)}`;
}

function rateCellStyle(rate: number | null, isBottom30: boolean): CellStyle {
  const textHsl = getRateText(rate, isBottom30);
  const bgHsl = getRateBg(rate);
  const tm = textHsl.match(/hsl\(([^,]+),\s*([^%]+)%,\s*([^%]+)%\)/);
  const bm = bgHsl.match(/hsl\(([^,]+),\s*([^%]+)%,\s*([^%]+)%\)/);
  const fg = tm ? hslToHex(+tm[1], +tm[2], +tm[3]) : '1A2433';
  const bg = bm ? hslToHex(+bm[1], +bm[2], +bm[3]) : 'F1F3F6';
  return {
    fill: { fgColor: { rgb: bg } },
    font: { color: { rgb: fg }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'D0D5DD' } },
      bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
      left: { style: 'thin', color: { rgb: 'D0D5DD' } },
      right: { style: 'thin', color: { rgb: 'D0D5DD' } },
    },
  };
}

// Memoized row component to prevent unnecessary re-renders
const HeatmapRowComponent = memo(({
  row,
  rowIndex,
  columns,
  fixedCols,
  colWidth,
  granularity,
  fixedLeft,
  bottom30ByPeriod,
  isExpanded,
  onToggle,
  mode,
}: {
  row: HeatmapRow;
  rowIndex: number;
  columns: HeatmapColumnHeader[];
  fixedCols: Array<{ key: string; label: string; width: number }>;
  colWidth: number;
  granularity: TimeGranularity;
  fixedLeft: number[];
  bottom30ByPeriod: Record<number, number>;
  isExpanded: boolean;
  onToggle: () => void;
  mode: 'cumulative' | 'daily';
}) => {
  const rowKey = `${row.salesRep}-${rowIndex}`;
  const isTotalRow = row.rowType && row.rowType !== 'data';
  const fixedBg = getTotalRowBg(row.rowType) ?? (rowIndex % 2 === 0 ? 'hsl(0, 0%, 100%)' : 'hsl(220, 18%, 98%)');

  return (
    <React.Fragment key={rowKey}>
      <tr className={`transition-colors duration-150 ease-out ${isTotalRow ? '!font-bold' : 'hover:bg-accent/10'}`}>
        {fixedCols.map((col, ci) => {
          if (col.key === 'salesRep') {
            return (
              <td
                key={col.key}
                className={`border-b border-r border-border px-3 py-2 text-foreground whitespace-nowrap select-none ${isTotalRow ? '' : 'cursor-pointer'}`}
                style={{
                  width: col.width, minWidth: col.width, maxWidth: col.width,
                  position: 'sticky', left: fixedLeft[ci], zIndex: 11,
                  backgroundColor: fixedBg,
                }}
                title={extractChineseName(row.salesRep)}
                onClick={isTotalRow ? undefined : onToggle}
              >
                <span className="inline-flex items-center gap-1">
                  {!isTotalRow && (
                    <span
                      className={`inline-flex items-center justify-center text-base leading-none shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >▼</span>
                  )}
                  <span className="whitespace-nowrap">{extractChineseName(row.salesRep)}</span>
                </span>
              </td>
            );
          }
          return (
            <td
              key={col.key}
              className={`border-b border-r border-border py-2 text-foreground ${
                (col.key === 'servicePoints' || col.key === 'totalOrders')
                  ? 'px-2 font-mono tabular-nums text-right whitespace-nowrap'
                  : col.key === 'region'
                    ? 'px-3 text-left whitespace-nowrap'
                    : 'px-3 text-left whitespace-nowrap'
              }`}
              style={{
                width: col.width, minWidth: col.width, maxWidth: col.width,
                position: 'sticky', left: fixedLeft[ci], zIndex: 11,
                backgroundColor: fixedBg,
                textAlign: (col.key === 'servicePoints' || col.key === 'totalOrders') ? 'right' : 'left',
              }}
            >
              {row[col.key]}
            </td>
          );
        })}
        {columns.map((col, ci) => {
          const dd = row.dailyData?.[ci];
          if (col.isHoliday && granularity === 'day') {
            return (
              <td
                key={col.index}
                className="border-b border-r border-border px-1 py-2 text-center"
                style={{ width: colWidth, minWidth: colWidth, backgroundColor: 'hsl(220, 10%, 95%)', color: 'hsl(220, 10%, 65%)' }}
              >
                休
              </td>
            );
          }
          const isB30 = dd != null && dd.rate !== null && dd.rate > 0 && dd.rate <= (bottom30ByPeriod[col.index] ?? -1);
          return (
            <td
              key={col.index}
              className="border-b border-r border-border px-1 py-2 text-center font-mono tabular-nums"
              style={{
                width: colWidth, minWidth: colWidth,
                backgroundColor: getRateBg(dd?.rate ?? null),
                color: getRateText(dd?.rate ?? null, isB30),
              }}
              title={dd?.rate != null ? (mode === 'daily' ? `当日线路成交: ${dd.stores} 家 = ${Math.round(dd.rate * 100)}%` : `累计成交: ${dd.stores} 家 / 服务点数: ${row.servicePoints} 家 = ${Math.round(dd.rate * 100)}%`) : '尚未发生'}
            >
              {formatRate(dd?.rate ?? null)}
            </td>
          );
        })}
      </tr>
    </React.Fragment>
  );
});

HeatmapRowComponent.displayName = 'HeatmapRowComponent';

const SalesRepHeatmap: React.FC<SalesRepHeatmapProps> = ({
  datasetId, filters, dateFrom, dateTo, granularity, committedGranularity, onGranularityChange, onCommittedGranularityChange, onLoadingChange, onDataChange,
}) => {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRate, setExportRate] = useState(true);
  const [exportDrilldown, setExportDrilldown] = useState(false);
  const [collapseLevel, setCollapseLevel] = useState<'none' | 'region' | 'tier'>('region');

  // 实际请求时使用的 granularity：已确认查询前跟随草稿值，确认后跟随 committedGranularity
  // 保证切换日/周/月/年能立刻触发数据请求
  const effectiveGranularity = committedGranularity ?? granularity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedRow(null);
    try {
      const result = await datasetApi.getHeatmapData(datasetId, dateFrom, dateTo, effectiveGranularity, filters);
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load heatmap:', err);
      setError(msg);
    } finally {
      setLoading(false);
      setCollapseLevel('region');
    }
  }, [datasetId, dateFrom, dateTo, effectiveGranularity, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 将数据变化同步给父组件
  useEffect(() => {
    onDataChange?.(data);
  }, [data, onDataChange]);

  // 将内部 loading 状态同步给父组件，用于确认按钮的查询中状态
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const colWidth = effectiveGranularity === 'day' ? 48 : effectiveGranularity === 'week' ? 64 : 72;

  // 所别列宽精确贴合最宽所名（含合计行的"XX所合计"），保证所有所名单行完整、列宽与所名一致
  const regionColWidth = useMemo(() => {
    let maxLen = 0;
    for (const r of rows) {
      const len = (r.region || '').length;
      if (len > maxLen) maxLen = len;
    }
    // 汉字约 13px/字，内边距 px-3 = 24px，加 4px 余量避免截断
    return Math.max(64, maxLen * 13 + 28);
  }, [rows]);

  const fixedCols = useMemo(() => [
    { key: 'region', label: '所别', width: regionColWidth },
    { key: 'tier', label: '阶层', width: 64 },
    { key: 'salesRep', label: '业代', width: 100 },
    { key: 'servicePoints', label: '点数', width: 56 },
    { key: 'totalOrders', label: '合计箱数', width: 70 },
  ], [regionColWidth]);

  // 生成带合计行的展示数据
  const isDailyMode = filters.mode === 'daily';
  const displayRows = useMemo(() => buildRowsWithTotals(rows, columns, isDailyMode), [rows, columns, isDailyMode]);

  // 根据折叠级别过滤可见行
  const visibleRows = useMemo(() => {
    switch (collapseLevel) {
      case 'region':
        return displayRows.filter((r) => r.rowType === 'region' || r.rowType === 'total');
      case 'tier':
        return displayRows.filter((r) => r.rowType === 'tier' || r.rowType === 'region' || r.rowType === 'total');
      default:
        return displayRows;
    }
  }, [displayRows, collapseLevel]);

  const timeLabel = data
    ? effectiveGranularity === 'month'
      ? `${data.year}年`
      : effectiveGranularity === 'year'
        ? '全部年份'
        : dateFrom === dateTo
          ? dateFrom.replace(/-/g, '/')
          : `${dateFrom.replace(/-/g, '/')} ~ ${dateTo.replace(/-/g, '/')}`
    : '';

  const bottom30ByPeriod = useMemo(() => {
    const thresholds: Record<number, number> = {};
    columns.forEach((col, ci) => {
      if (col.isHoliday) return;
      const rates: number[] = [];
      // 仅对普通业代数据行计算后30%阈值，排除合计行
      for (const row of rows) {
        if (row.rowType && row.rowType !== 'data') continue;
        const dd = row.dailyData?.[ci];
        if (dd && dd.rate !== null && dd.rate > 0) rates.push(dd.rate);
      }
      if (rates.length > 0) {
        rates.sort((a: number, b: number) => a - b);
        const idx = Math.ceil(rates.length * 0.3) - 1;
        thresholds[col.index] = rates[Math.max(0, idx)];
      }
    });
    return thresholds;
  }, [rows, columns]);

  const fixedLeft = useMemo(() => fixedCols.reduce<number[]>((acc, col, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + fixedCols[i - 1].width);
    return acc;
  }, []), [fixedCols]);

  const totalFixedWidth = useMemo(() => fixedCols.reduce((sum, c) => sum + c.width, 0), [fixedCols]);

  // Lazy load xlsx only when exporting
  const handleExportHeatmap = useCallback(async (exportRate: boolean, exportDrilldown: boolean) => {
    if (!rows.length || exporting) return;
    setExporting(true);

    try {
      // Dynamic import for code splitting
      const XLSX = await import('xlsx-js-style').then(m => m.default || m);

      const wb = XLSX.utils.book_new();

      // 通用样式定义（导出成交率和下钻数据都需要）
      const headerStyle: CellStyle = {
        fill: { fgColor: { rgb: hslToHex(217, 40, 95) } },
        font: { bold: true, sz: 10, color: { rgb: '1A2433' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'D0D5DD' } },
          bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
          left: { style: 'thin', color: { rgb: 'D0D5DD' } },
          right: { style: 'thin', color: { rgb: 'D0D5DD' } },
        },
      };
      const fixedCellStyle: CellStyle = {
        font: { sz: 10, color: { rgb: '1A2433' } },
        alignment: { vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'D0D5DD' } },
          bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
          left: { style: 'thin', color: { rgb: 'D0D5DD' } },
          right: { style: 'thin', color: { rgb: 'D0D5DD' } },
        },
      };

      // 导出业代累计成交率 Sheet
      if (exportRate) {
        const ws = XLSX.utils.aoa_to_sheet([]);
      const colLabels = columns.map((c: HeatmapColumnHeader) => c.label);
      const headers = ['所别', '阶层', '业代', '点数', '合计箱数', ...colLabels];
      XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' });
      for (let c = 0; c < headers.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })] as Record<string, unknown>;
        if (cell) cell.s = headerStyle;
      }
      displayRows.forEach((row: HeatmapRow, ri: number) => {
        const isTotalRow = !!(row.rowType && row.rowType !== 'data');
        let totalBg: string | null = null;
        if (row.rowType === 'tier') totalBg = hslToHex(217, 60, 94);
        else if (row.rowType === 'region') totalBg = hslToHex(220, 18, 92);
        else if (row.rowType === 'total') totalBg = hslToHex(220, 18, 86);
        const fixedStyle: CellStyle = {
          ...fixedCellStyle,
          font: { sz: 10, color: { rgb: '1A2433' }, bold: isTotalRow },
          fill: { fgColor: { rgb: totalBg ?? (ri % 2 === 0 ? 'FFFFFF' : hslToHex(220, 18, 98)) } },
        };
        const vals: Array<string | number> = [row.region, row.tier, row.salesRep, row.servicePoints, row.totalOrders];
        for (let c = 0; c < vals.length; c++) {
          const ref = XLSX.utils.encode_cell({ r: ri + 1, c });
          ws[ref] = { v: vals[c], t: typeof vals[c] === 'number' ? 'n' : 's', s: fixedStyle } as never;
        }
        columns.forEach((col: HeatmapColumnHeader, ci: number) => {
          const dd = row.dailyData?.[ci];
          const ref = XLSX.utils.encode_cell({ r: ri + 1, c: 5 + ci });
          if (col.isHoliday && effectiveGranularity === 'day') {
            const hs = rateCellStyle(null, false);
            if (isTotalRow) {
              const f = hs.font as Record<string, unknown> | undefined;
              if (f) f.bold = true;
            }
            ws[ref] = { v: '休', t: 's', s: hs } as never;
          } else {
            const rate = dd?.rate ?? null;
            const isB30 = rate !== null && rate > 0 && rate <= (bottom30ByPeriod[col.index] ?? -1);
            const rs = rateCellStyle(rate, isB30);
            if (isTotalRow) {
              const f = rs.font as Record<string, unknown> | undefined;
              if (f) f.bold = true;
            }
            ws[ref] = {
              v: rate !== null ? `${Math.round(rate * 100)}%` : '',
              t: 's',
              s: rs,
            } as never;
          }
        });
      });
      const colWidths = [
        { wch: 10 }, { wch: 6 }, { wch: 16 }, { wch: 6 }, { wch: 8 },
        ...columns.map(() => ({ wch: 6 })),
      ];
      ws['!cols'] = colWidths;
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: displayRows.length, c: headers.length - 1 } });
      XLSX.utils.book_append_sheet(wb, ws, '业代成交率');
      } // end exportRate

      // 累计模式且用户选择了下钻数据：新增"下钻数据"Sheet，形态/品牌/规格横向交叉表展示
      if (exportDrilldown && !isDailyMode) {
        const dataRows = rows.filter((r) => !r.rowType || r.rowType === 'data');
        if (dataRows.length > 0) {
          // 批量获取所有业代的下钻数据（每批 10 个并发）
          const BATCH_SIZE = 10;
          const drilldownMap = new Map<string, SalesRepDrilldownResponse>();
          for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
            const batch = dataRows.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
              batch.map(async (r) => {
                try {
                  const dd = await datasetApi.getSalesRepDrilldown(
                    datasetId, r.salesRep, r.region, r.tier, dateFrom, dateTo,
                  );
                  return { key: `${r.region}|||${r.tier}|||${r.salesRep}`, dd };
                } catch {
                  return null;
                }
              }),
            );
            for (const res of results) {
              if (res) drilldownMap.set(res.key, res.dd);
            }
          }

          // 计算最大维度数（决定列数）
          let maxDims = 0;
          for (const dd of drilldownMap.values()) {
            maxDims = Math.max(maxDims,
              dd.formatBreakdown.length,
              dd.brandBreakdown.length,
              dd.specificationBreakdown.length,
            );
          }
          if (maxDims === 0) maxDims = 1;
          const numCols = 5 + maxDims; // 所别/阶层/业代/下钻类型/指标 + 维度列

          const drillWs = XLSX.utils.aoa_to_sheet([]);
          const drillTitle = `下钻数据（时间区间：${dateFrom.replace(/-/g, '/')} ~ ${dateTo.replace(/-/g, '/')}）`;
          const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];

          // 标题行
          XLSX.utils.sheet_add_aoa(drillWs, [[drillTitle]], { origin: 'A1' });
          merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } });
          const titleCell = drillWs[XLSX.utils.encode_cell({ r: 0, c: 0 })] as Record<string, unknown>;
          if (titleCell) {
            titleCell.s = {
              font: { bold: true, sz: 12, color: { rgb: '1A2433' } },
              alignment: { horizontal: 'center', vertical: 'center' },
            };
          }

          // 表头行
          const drillHeaders = ['所别', '阶层', '业代', '下钻类型', '指标'];
          for (let d = 0; d < maxDims; d++) drillHeaders.push(`维度${d + 1}`);
          XLSX.utils.sheet_add_aoa(drillWs, [drillHeaders], { origin: 'A2' });
          for (let c = 0; c < drillHeaders.length; c++) {
            const cell = drillWs[XLSX.utils.encode_cell({ r: 1, c })] as Record<string, unknown>;
            if (cell) cell.s = headerStyle;
          }

          const grayBlue = hslToHex(220, 18, 92);
          const dimHeaderStyle: CellStyle = {
            ...fixedCellStyle,
            font: { sz: 10, color: { rgb: '1A2433' }, bold: true },
            fill: { fgColor: { rgb: hslToHex(217, 40, 95) } },
          };
          const rateStyle: CellStyle = {
            ...fixedCellStyle,
            font: { sz: 10, color: { rgb: '0D47A1' }, bold: true },
          };

          let currentRow = 2; // 0-indexed: Excel 第 3 行开始

          for (const rep of dataRows) {
            const key = `${rep.region}|||${rep.tier}|||${rep.salesRep}`;
            const dd = drilldownMap.get(key);
            if (!dd) continue;

            const repStartRow = currentRow;
            const sections = [
              { type: '形态', items: dd.formatBreakdown.map(i => ({ name: i.formatType ?? '', total: i.totalStores, dealt: i.dealtStores, rate: i.dealRate })) },
              { type: '品牌', items: dd.brandBreakdown.map(i => ({ name: i.brand ?? '', total: i.totalStores, dealt: i.dealtStores, rate: i.dealRate })) },
              { type: '规格', items: dd.specificationBreakdown.map(i => ({ name: i.specification ?? '', total: i.totalStores, dealt: i.dealtStores, rate: i.dealRate })) },
            ];

            for (const section of sections) {
              const sectionStartRow = currentRow;

              // 维度名称行（横向排列）
              const dimVals: Array<string | number> = [rep.region, rep.tier, rep.salesRep, section.type, ''];
              for (const item of section.items) dimVals.push(item.name);
              while (dimVals.length < numCols) dimVals.push('');
              for (let c = 0; c < numCols; c++) {
                const ref = XLSX.utils.encode_cell({ r: currentRow, c });
                drillWs[ref] = { v: dimVals[c], t: 's', s: dimHeaderStyle } as never;
              }
              currentRow++;

              // 点数行
              const ptsVals: Array<string | number> = ['', '', '', '', '点数'];
              for (const item of section.items) ptsVals.push(item.total);
              while (ptsVals.length < numCols) ptsVals.push('');
              for (let c = 0; c < numCols; c++) {
                const ref = XLSX.utils.encode_cell({ r: currentRow, c });
                drillWs[ref] = { v: ptsVals[c], t: typeof ptsVals[c] === 'number' ? 'n' : 's', s: fixedCellStyle } as never;
              }
              currentRow++;

              // 成交行
              const dealtVals: Array<string | number> = ['', '', '', '', '成交'];
              for (const item of section.items) dealtVals.push(item.dealt);
              while (dealtVals.length < numCols) dealtVals.push('');
              for (let c = 0; c < numCols; c++) {
                const ref = XLSX.utils.encode_cell({ r: currentRow, c });
                drillWs[ref] = { v: dealtVals[c], t: typeof dealtVals[c] === 'number' ? 'n' : 's', s: fixedCellStyle } as never;
              }
              currentRow++;

              // 成交率行
              const rateVals: Array<string | number> = ['', '', '', '', '成交率'];
              for (const item of section.items) rateVals.push(`${item.rate}%`);
              while (rateVals.length < numCols) rateVals.push('');
              for (let c = 0; c < numCols; c++) {
                const ref = XLSX.utils.encode_cell({ r: currentRow, c });
                drillWs[ref] = { v: rateVals[c], t: 's', s: rateStyle } as never;
              }
              currentRow++;

              // 合并下钻类型单元格（4 行）
              merges.push({ s: { r: sectionStartRow, c: 3 }, e: { r: currentRow - 1, c: 3 } });
            }

            // 合并所别/阶层/业代单元格（12 行）
            merges.push({ s: { r: repStartRow, c: 0 }, e: { r: currentRow - 1, c: 0 } });
            merges.push({ s: { r: repStartRow, c: 1 }, e: { r: currentRow - 1, c: 1 } });
            merges.push({ s: { r: repStartRow, c: 2 }, e: { r: currentRow - 1, c: 2 } });

            // 灰蓝色空白分隔行
            for (let c = 0; c < numCols; c++) {
              const ref = XLSX.utils.encode_cell({ r: currentRow, c });
              drillWs[ref] = { v: '', t: 's', s: { fill: { fgColor: { rgb: grayBlue } } } } as never;
            }
            currentRow++;
          }

          // 仅在有数据时添加 Sheet
          if (currentRow > 2) {
            drillWs['!merges'] = merges;
            const colWidths = [
              { wch: 10 }, { wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 8 },
            ];
            for (let d = 0; d < maxDims; d++) colWidths.push({ wch: 12 });
            drillWs['!cols'] = colWidths;
            drillWs['!ref'] = XLSX.utils.encode_range({
              s: { r: 0, c: 0 },
              e: { r: currentRow - 1, c: numCols - 1 },
            });
            XLSX.utils.book_append_sheet(wb, drillWs, '下钻数据');
          }
        }
      }

      XLSX.writeFile(wb, `${filters.mode === 'daily' ? '业代当日成交率' : '业代累计成交率'}_${timeLabel}.xlsx`);
      const parts: string[] = [];
      if (exportRate) parts.push(`${displayRows.length} 条${filters.mode === 'daily' ? '当日' : '累计'}成交率数据`);
      if (exportDrilldown) parts.push(`业代下钻数据`);
      toast.success(`已导出：${parts.join('、')}`);
    } catch (err) {
      logger.error('Failed to export heatmap:', err);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [displayRows, columns, granularity, bottom30ByPeriod, timeLabel, exporting, filters.mode, rows, datasetId, dateFrom, dateTo, isDailyMode]);

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-foreground">{filters.mode === 'daily' ? '业代当日成交率' : '业代累计成交率'}</h3>
          <div className="flex items-center gap-0.5">
            {GRANULARITY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-xs ${effectiveGranularity === opt.value ? 'bg-primary/10 text-primary font-medium' : ''}`}
                onClick={() => {
                  onGranularityChange(opt.value);
                  if (committedGranularity != null) {
                    onCommittedGranularityChange?.(opt.value);
                  }
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{timeLabel}</span>
        </div>
        <Button size="sm" onClick={() => setExportOpen(true)} disabled={loading || rows.length === 0} className="gap-1">
          <span className="inline-flex items-center justify-center text-base leading-none">⬇️</span>
          导出成交率
        </Button>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-sm p-5 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center min-h-[300px] bg-card border border-border rounded-sm">
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
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center min-h-[300px] bg-card border border-border rounded-sm">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle>暂无数据</EmptyTitle>
              <EmptyDescription>请先上传客户资料和销售数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-4 py-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">成交率：</span>
            {[
              { label: '0%', color: 'hsl(0, 0%, 100%)' },
              { label: '<15%', color: 'hsl(217, 70%, 96%)' },
              { label: '15-30%', color: 'hsl(217, 70%, 91%)' },
              { label: '30-50%', color: 'hsl(217, 70%, 84%)' },
              { label: '50-70%', color: 'hsl(217, 70%, 75%)' },
              { label: '70-90%', color: 'hsl(217, 70%, 65%)' },
              { label: '90%+', color: 'hsl(217, 70%, 55%)' },
              { label: '未发生', color: 'hsl(220, 10%, 95%)' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="size-3 rounded-sm border border-border" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold" style={{ color: 'hsl(4, 72%, 52%)' }}>A</span>
              <span className="text-[10px] text-muted-foreground">= 后30%</span>
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="w-full border-collapse text-xs" style={{ minWidth: totalFixedWidth + columns.length * colWidth, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ backgroundColor: 'hsl(217, 40%, 95%)' }}>
                  {fixedCols.map((col, ci) => {
                    const isRegion = col.key === 'region';
                    const isTier = col.key === 'tier';
                    const clickable = isRegion || isTier;
                    const active = (isRegion && collapseLevel === 'region') || (isTier && collapseLevel === 'tier');
                    return (
                      <th
                        key={col.key}
                        className={`border-b border-r border-border px-3 py-2 !font-bold text-black text-center ${
                          clickable ? 'cursor-pointer select-none' : ''
                        }`}
                        style={{
                          width: col.width, minWidth: col.width,
                          position: 'sticky', left: fixedLeft[ci], top: 0, zIndex: 12,
                          backgroundColor: active
                            ? 'hsl(152, 60%, 90%)'
                            : (col.key === 'servicePoints' || col.key === 'totalOrders')
                              ? 'hsl(54, 85%, 88%)'
                              : 'hsl(217, 40%, 95%)',
                          transition: 'background-color 150ms ease',
                        }}
                        title={clickable ? `点击${active ? '展开' : '折叠'}${col.label}明细` : col.label}
                        onClick={
                          clickable
                            ? () => setCollapseLevel((prev) => {
                                if (isRegion) return prev === 'region' ? 'none' : 'region';
                                if (isTier) return prev === 'tier' ? 'none' : 'tier';
                                return prev;
                              })
                            : undefined
                        }
                        onMouseEnter={(e) => {
                          if (clickable) {
                            const target = e.currentTarget;
                            target.style.backgroundColor = 'hsl(152, 60%, 88%)';
                            target.style.animation = 'heatmap-header-shake 0.3s ease-in-out';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (clickable) {
                            const target = e.currentTarget;
                            target.style.backgroundColor = active ? 'hsl(152, 60%, 90%)' : 'hsl(217, 40%, 95%)';
                            target.style.animation = 'none';
                          }
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {clickable && (
                            <span className="inline-flex items-center justify-center rounded-sm hover:bg-black/5 p-0.5 transition-colors">
                              {active ? (
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >▶</span>
                              ) : (
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >▼</span>
                              )}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {columns.map((col) => (
                    <th
                      key={col.index}
                      className="border-b border-r border-border px-1 py-2 text-center !font-bold text-black"
                      style={{
                        width: colWidth, minWidth: colWidth,
                        color: col.isHoliday ? 'hsl(4, 72%, 52%)' : undefined,
                        backgroundColor: col.isHoliday ? 'hsl(0, 60%, 97%)' : 'hsl(217, 40%, 95%)',
                        position: 'sticky', top: 0, zIndex: 10,
                      }}
                    >
                      <div>{col.label}</div>
                      {col.subLabel && (
                        <div className="text-[10px] text-muted-foreground">{col.subLabel}</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row: HeatmapRow, ri: number) => {
                  const rowKey = `${row.salesRep}-${ri}`;
                  const isExpanded = expandedRow === rowKey;
                  const isTotalRow = row.rowType && row.rowType !== 'data';
                  return (
                    <React.Fragment key={rowKey}>
                      <HeatmapRowComponent
                        row={row}
                        rowIndex={ri}
                        columns={columns}
                        fixedCols={fixedCols}
                        colWidth={colWidth}
                        granularity={effectiveGranularity}
                        fixedLeft={fixedLeft}
                        bottom30ByPeriod={bottom30ByPeriod}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedRow(isExpanded ? null : rowKey)}
                        mode={filters.mode ?? 'cumulative'}
                      />
                      {!isTotalRow && isExpanded && (
                        <DrilldownRow
                          datasetId={datasetId}
                          salesRep={row.salesRep}
                          region={row.region}
                          tier={row.tier}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          mode={filters.mode ?? 'cumulative'}
                          dailyData={row.dailyData}
                          columns={columns}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 导出选择对话框 */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>选择导出内容</DialogTitle>
            <DialogDescription>
              请选择需要导出的数据项，可多选。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors duration-150">
              <Checkbox
                checked={exportRate}
                onCheckedChange={(checked) => setExportRate(checked as boolean)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">业代累计成交率</p>
                <p className="text-xs text-muted-foreground mt-0.5">包含所有业代的成交率汇总数据</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors duration-150">
              <Checkbox
                checked={exportDrilldown}
                onCheckedChange={(checked) => setExportDrilldown(checked as boolean)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">业代下钻数据</p>
                <p className="text-xs text-muted-foreground mt-0.5">包含形态/品牌/规格的横向交叉表明细</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setExportOpen(false);
                if (exportRate || exportDrilldown) {
                  handleExportHeatmap(exportRate, exportDrilldown);
                }
              }}
              disabled={!exportRate && !exportDrilldown}
            >
              确认导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesRepHeatmap;
