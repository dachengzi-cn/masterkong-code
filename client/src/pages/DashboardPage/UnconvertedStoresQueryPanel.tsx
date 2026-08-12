import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/business-ui/kpi-card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { datasetApi, reportApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  HeatmapFilterParams,
  HeatmapRow,
  UnconvertedStoreItem,
  SalesRepUnconvertedDrilldownResponse,
  ReportRow,
  ReportSheetData,
  ReportCellStyle,
} from '@shared/api.interface';
import { extractChineseName } from './tableFormat';

const formatPercent = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return '-';
  return `${(v * 100).toFixed(1)}%`;
};

/** HSL 转 HEX（用于 Excel 导出背景色，与业代表导出一致） */
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

/** 取累计成交点数：累计模式下 dailyData.stores 为截至当天的累计成交门店数，取最后一天有效值 */
const getDealtStores = (row: HeatmapRow): number => {
  const d = row.dailyData;
  if (!d || d.length === 0) return 0;
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i].stores != null) return d[i].stores ?? 0;
  }
  return 0;
};

interface UnconvertedStoresQueryPanelProps {
  datasetId: string;
  /** 复用原表已确认的筛选条件 */
  filters: HeatmapFilterParams;
  /** 复用原表已确认的日期范围 */
  dateFrom: string;
  dateTo: string;
}

interface QueryResult {
  /** 未成交点数（未成交门店数） */
  total: number;
  /** 筛选条件下的总服务点数 */
  servicePoints: number;
}

interface TableRow {
  region: string;
  tier: string;
  salesRep: string;
  servicePoints: number;
  unconvertedPoints: number;
}

/** 阶层分组：包含业代明细行与阶层小计 */
interface TierGroup {
  tier: string;
  rows: TableRow[];
  servicePoints: number;
  unconvertedPoints: number;
}

/** 所别分组：包含阶层分组与所别小计 */
interface RegionGroup {
  region: string;
  tiers: TierGroup[];
  servicePoints: number;
  unconvertedPoints: number;
}

const UnconvertedStoresQueryPanel: React.FC<UnconvertedStoresQueryPanelProps> = ({
  datasetId,
  filters,
  dateFrom,
  dateTo,
}) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [heatRows, setHeatRows] = useState<HeatmapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 折叠级别（参照业代表：'region' 仅显示所别小计，'tier' 显示阶层+所别小计，'none' 全部明细）
  const [collapseLevel, setCollapseLevel] = useState<'none' | 'region' | 'tier'>('region');

  // 导出「汇总」sheet 时读取最新分组数据（ref 避免导出闭包过期）
  const groupedRowsRef = useRef<RegionGroup[]>([]);
  const totalsRef = useRef<{ servicePoints: number; unconvertedPoints: number }>({
    servicePoints: 0,
    unconvertedPoints: 0,
  });

  // 业代未成交门店下钻弹窗状态
  const [drilldownRep, setDrilldownRep] = useState<TableRow | null>(null);
  const [drilldownData, setDrilldownData] = useState<SalesRepUnconvertedDrilldownResponse | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);

  /** 点击业代名：查询近6个月分月未成交门店数 + 连续2/3个月未成交门店数 */
  const openDrilldown = useCallback(
    async (r: TableRow) => {
      setDrilldownRep(r);
      setDrilldownLoading(true);
      setDrilldownError(null);
      setDrilldownData(null);
      try {
        const res = await datasetApi.getSalesRepUnconvertedDrilldown(
          datasetId, r.salesRep, r.region, r.tier, dateTo,
        );
        setDrilldownData(res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setDrilldownError(msg);
        toast.error('下钻数据查询失败，请重试');
      } finally {
        setDrilldownLoading(false);
      }
    },
    [datasetId, dateTo],
  );

  // 线路选择 Dialog 状态（未成交明细导出）
  const BASIC_ROUTE_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六'];
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);

  const openRouteDialog = useCallback(() => {
    setSelectedRoutes([]);
    setRouteDialogOpen(true);
  }, []);

  const handleRouteCancel = useCallback(() => {
    setRouteDialogOpen(false);
    setSelectedRoutes([]);
  }, []);

  const toggleRoute = useCallback((routeName: string) => {
    setSelectedRoutes((prev: string[]) =>
      prev.includes(routeName) ? prev.filter((r: string) => r !== routeName) : [...prev, routeName],
    );
  }, []);

  const allRoutesSelected = BASIC_ROUTE_OPTIONS.length > 0 && selectedRoutes.length === BASIC_ROUTE_OPTIONS.length;
  const indeterminate = selectedRoutes.length > 0 && selectedRoutes.length < BASIC_ROUTE_OPTIONS.length;

  const handleToggleAll = useCallback(() => {
    if (allRoutesSelected) {
      setSelectedRoutes([]);
    } else {
      setSelectedRoutes([...BASIC_ROUTE_OPTIONS]);
    }
  }, [allRoutesSelected]);

  /** 导出所选线路的未成交门店明细（原 FilterBar 未成交明细功能迁移） */
  const exportUnconvertedDetail = useCallback(
    async (routes: string[]) => {
      if (!routes || routes.length === 0) {
        toast.error('请至少选择一条线路');
        return;
      }
      try {
        const filtersWithRoute = { ...filters, route: routes };
        const result2 = await datasetApi.getUnconvertedStores(datasetId, dateFrom, dateTo, filtersWithRoute);
        const items: UnconvertedStoreItem[] = result2.items;
        if (items.length === 0) {
          toast.info('当前筛选条件下没有未成交门店');
          return;
        }

        // ===== 通用边框（与前端导出一致）=====
        const border: ReportCellStyle['border'] = {
          top: { style: 'thin', color: { rgb: 'D0D5DD' } },
          bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
          left: { style: 'thin', color: { rgb: 'D0D5DD' } },
          right: { style: 'thin', color: { rgb: 'D0D5DD' } },
        };
        const detailCell = (horizontal?: 'left' | 'right'): ReportCellStyle => ({
          font: { sz: 10, ...(horizontal === 'right' ? { color: { rgb: 'D92D20' } } : {}) },
          alignment: { horizontal: horizontal ?? 'left', vertical: 'center' },
          border,
        });
        const totalCell = (bg: string, ci: number): ReportCellStyle => ({
          fill: { fgColor: { rgb: bg } },
          font: { bold: true, sz: 10, color: ci === 4 ? { rgb: 'D92D20' } : { rgb: '1A2433' } },
          alignment: { horizontal: ci >= 3 ? 'right' : 'left', vertical: 'center' },
          border,
        });
        const headerCellStyle = (): ReportCellStyle => ({
          fill: { fgColor: { rgb: hslToHex(217, 40, 95) } },
          font: { bold: true, sz: 10, color: { rgb: '1A2433' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border,
        });

        const sheets: ReportSheetData[] = [];

        // ===== 汇总 sheet：未成交门店查询面板结果（所别→阶层→业代 完整分组）=====
        {
          const sumHeaders = ['所别', '阶层', '业代', '点数', '未成交点数'];
          const sumRows: ReportRow[] = [
            sumHeaders.map((h) => ({ v: h, s: headerCellStyle() })),
          ];

          for (const rg of groupedRowsRef.current) {
            for (const tg of rg.tiers) {
              // 业代明细行
              for (const r of tg.rows) {
                sumRows.push([
                  { v: rg.region, s: detailCell() },
                  { v: tg.tier, s: detailCell() },
                  { v: r.salesRep, s: detailCell() },
                  { v: r.servicePoints, s: detailCell('right') },
                  { v: r.unconvertedPoints, s: detailCell('right') },
                ]);
              }
              // 阶层小计行
              sumRows.push([
                { v: rg.region, s: totalCell(hslToHex(217, 60, 94), 0) },
                { v: tg.tier, s: totalCell(hslToHex(217, 60, 94), 1) },
                { v: `${tg.tier}合计`, s: totalCell(hslToHex(217, 60, 94), 2) },
                { v: tg.servicePoints, s: totalCell(hslToHex(217, 60, 94), 3) },
                { v: tg.unconvertedPoints, s: totalCell(hslToHex(217, 60, 94), 4) },
              ]);
            }
            // 所别小计行
            sumRows.push([
              { v: rg.region, s: totalCell(hslToHex(220, 18, 92), 0) },
              { v: '', s: totalCell(hslToHex(220, 18, 92), 1) },
              { v: `${rg.region}合计`, s: totalCell(hslToHex(220, 18, 92), 2) },
              { v: rg.servicePoints, s: totalCell(hslToHex(220, 18, 92), 3) },
              { v: rg.unconvertedPoints, s: totalCell(hslToHex(220, 18, 92), 4) },
            ]);
          }
          // 部门合计行
          sumRows.push([
            { v: '部门合计', s: totalCell(hslToHex(220, 18, 86), 0) },
            { v: '', s: totalCell(hslToHex(220, 18, 86), 1) },
            { v: '', s: totalCell(hslToHex(220, 18, 86), 2) },
            { v: totalsRef.current.servicePoints, s: totalCell(hslToHex(220, 18, 86), 3) },
            { v: totalsRef.current.unconvertedPoints, s: totalCell(hslToHex(220, 18, 86), 4) },
          ]);

          sheets.push({
            sheetName: '汇总',
            rows: sumRows,
            colWidths: [14, 10, 12, 10, 12],
          });
        }
        // ===== 汇总 sheet 结束 =====

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

          // 判断是否使用矩阵格式（有 brandStatus 字段且选择了品牌）
          const hasBrandStatus = groupItems.some(
            (item: UnconvertedStoreItem) => item.brandStatus && Object.keys(item.brandStatus).length > 0,
          );
          const brandColumns = hasBrandStatus
            ? Object.keys(groupItems[0].brandStatus || {}).sort()
            : [];

          const groupHeaders = ['客户编码', '客户名称', '所别', '层级', '业代', ...groupExtraHeaders, ...brandColumns];

          const groupRows: ReportRow[] = [];

          for (const item of groupItems) {
            const row: ReportRow = [
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

            // 添加品牌列数据
            for (const brand of brandColumns) {
              const val = item.brandStatus?.[brand] ?? '';
              // 值为 0 的单元格：红色背景，白色加粗字体
              if (val === 0) {
                row.push({
                  v: val,
                  s: {
                    fill: { fgColor: { rgb: 'FF0000' } },
                    font: { bold: true, color: { rgb: 'FFFFFF' } },
                  },
                });
              } else {
                row.push(val as string | number);
              }
            }

            groupRows.push(row);
          }

          const sheetName = tier.length > 31 ? tier.substring(0, 28) + '...' : tier;
          sheets.push({
            sheetName,
            rows: [groupHeaders, ...groupRows],
          });
        }
        const [fy, fm, fd] = dateFrom.split('-');
        const [ty, tm, td] = dateTo.split('-');
        const fromLabel = `${fy}年${fm}月${fd}日`;
        const toLabel = `${ty}年${tm}月${td}日`;
        const fileName = `${fromLabel}-${toLabel}期间未成交门店明细`;
        await reportApi.generateReport({
          type: 'unconverted',
          title: fileName,
          fileName,
          sheets,
        });
        toast.success('报表已生成，请点击右上角下载按钮查看/下载');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`导出失败：${msg}`);
        logger.error('Failed to download unconverted stores:', err);
      }
    },
    [datasetId, dateFrom, dateTo, filters],
  );

  const handleRouteConfirm = useCallback(async () => {
    if (selectedRoutes.length === 0) return;
    setRouteDialogOpen(false);
    await exportUnconvertedDetail(selectedRoutes);
    setSelectedRoutes([]);
  }, [selectedRoutes, exportUnconvertedDetail]);

  const runQuery = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    setError(null);
    try {
      const [ucRes, heatRes] = await Promise.all([
        datasetApi.getUnconvertedStores(datasetId, dateFrom, dateTo, filters),
        datasetApi.getHeatmapData(datasetId, dateFrom, dateTo, 'day', filters),
      ]);
      const servicePoints = heatRes.rows.reduce((s, r) => s + (r.servicePoints ?? 0), 0);
      setHeatRows(heatRes.rows.filter((r) => r.rowType !== 'total'));
      setResult({ total: ucRes.total ?? ucRes.items.length, servicePoints });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to query unconverted stores:', err);
      setError(msg);
      toast.error('未成交门店查询失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [datasetId, dateFrom, dateTo, filters]);

  // 与原表格查询机制同步：当数据源、筛选条件或日期范围变更时自动重新查询
  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const dealtPoints = useMemo(() => {
    if (!result || result.servicePoints <= 0) return null;
    return Math.max(0, result.servicePoints - result.total);
  }, [result]);

  const noDealRate = useMemo(() => {
    if (!result || result.servicePoints <= 0) return null;
    return result.total / result.servicePoints;
  }, [result]);

  const dealRate = useMemo(() => {
    if (dealtPoints == null || result == null || result.servicePoints <= 0) return null;
    return dealtPoints / result.servicePoints;
  }, [dealtPoints, result]);

  // 构建表格行：未成交点数 = 点数 - 累计成交点数（复用业代累计成交率表逻辑）
  const tableRows = useMemo<TableRow[]>(() => {
    return heatRows.map((r) => {
      const dealt = getDealtStores(r);
      const sp = r.servicePoints ?? 0;
      return {
        region: r.region ?? '',
        tier: r.tier ?? '',
        salesRep: r.salesRep ?? '',
        servicePoints: sp,
        unconvertedPoints: Math.max(0, sp - dealt),
      };
    });
  }, [heatRows]);

  // 层级分组：所别（一级）→ 阶层（二级）→ 业代明细（组内按未成交点数降序）
  const groupedRows = useMemo<RegionGroup[]>(() => {
    const regionMap = new Map<string, Map<string, TableRow[]>>();
    for (const r of tableRows) {
      let tierMap = regionMap.get(r.region);
      if (!tierMap) {
        tierMap = new Map<string, TableRow[]>();
        regionMap.set(r.region, tierMap);
      }
      const list = tierMap.get(r.tier) ?? [];
      list.push(r);
      tierMap.set(r.tier, list);
    }
    const regions: RegionGroup[] = [];
    for (const [region, tierMap] of regionMap) {
      const tiers: TierGroup[] = [];
      for (const [tier, rows] of tierMap) {
        tiers.push({
          tier,
          rows: [...rows].sort((a, b) => b.unconvertedPoints - a.unconvertedPoints),
          servicePoints: rows.reduce((s, r) => s + r.servicePoints, 0),
          unconvertedPoints: rows.reduce((s, r) => s + r.unconvertedPoints, 0),
        });
      }
      tiers.sort((a, b) => a.tier.localeCompare(b.tier, 'zh-CN'));
      regions.push({
        region,
        tiers,
        servicePoints: tiers.reduce((s, t) => s + t.servicePoints, 0),
        unconvertedPoints: tiers.reduce((s, t) => s + t.unconvertedPoints, 0),
      });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region, 'zh-CN'));
    return regions;
  }, [tableRows]);

  // 部门合计
  const totals = useMemo(() => {
    return tableRows.reduce(
      (acc, r) => ({
        servicePoints: acc.servicePoints + r.servicePoints,
        unconvertedPoints: acc.unconvertedPoints + r.unconvertedPoints,
      }),
      { servicePoints: 0, unconvertedPoints: 0 },
    );
  }, [tableRows]);

  // 同步最新分组数据到 ref（供导出「汇总」sheet 使用）
  groupedRowsRef.current = groupedRows;
  totalsRef.current = totals;

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      {/* Header bar（与业代累计成交率表一致） */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-foreground">未成交门店查询</h3>
          <span className="text-xs text-muted-foreground">与原表数据实时联动</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openRouteDialog} className="gap-1">
            <span className="inline-flex items-center justify-center text-base leading-none">⬇️</span>
            未成交明细
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-sm p-5 space-y-2">
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
          </Empty>
        </div>
      ) : (
        <>
          {/* KPI 统计卡区 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 py-3">
            <KpiCard
              icon="❌"
              label="未成交点数"
              variant="error"
              hoverEffect
              value={result != null ? result.total.toLocaleString('zh-CN') : '-'}
              subText={
                result != null ? (
                  <span className="text-[hsl(4,72%,52%)]">未成交率 {formatPercent(noDealRate)}</span>
                ) : undefined
              }
            />
            <KpiCard
              icon="✅"
              label="已成交点数"
              variant="success"
              hoverEffect
              value={dealtPoints != null ? dealtPoints.toLocaleString('zh-CN') : '-'}
              subText={
                dealtPoints != null ? (
                  <span className="text-[hsl(152,60%,42%)]">成交率 {formatPercent(dealRate)}</span>
                ) : undefined
              }
            />
            <KpiCard
              icon="📊"
              label="总服务点数"
              variant="neutral"
              hoverEffect
              glowColor="hsl(217,85%,52%)"
              lineColor="bg-[hsl(217,85%,52%)]"
              value={result != null ? result.servicePoints.toLocaleString('zh-CN') : '-'}
              subText={<span>当前筛选条件下的服务点数</span>}
            />
          </div>

          {/* 未成交点数明细表格（所别 → 阶层 → 业代 层级分组） */}
          {tableRows.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="emoji">🔍</EmptyMedia>
                  <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无数据</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              {(() => {
                const half = Math.ceil(groupedRows.length / 2);
                const leftGroups = groupedRows.slice(0, half);
                const rightGroups = groupedRows.slice(half);
                const tableStyle = { maxHeight: 'calc(100vh - 260px)' } as React.CSSProperties;

                const renderTable = (groups: RegionGroup[], showTotal: boolean) => (
                  <div className="overflow-auto bg-card border border-border rounded-sm" style={tableStyle}>
                    <table className="w-full border-separate border-spacing-0 text-xs" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'hsl(217, 40%, 95%)' }}>
                          <th
                            className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center cursor-pointer select-none whitespace-nowrap"
                            style={{
                              position: 'sticky', top: 0, zIndex: 10,
                              backgroundColor: collapseLevel === 'region' ? 'hsl(152, 60%, 90%)' : 'hsl(217, 40%, 95%)',
                              transition: 'background-color 150ms ease',
                            }}
                            title={collapseLevel === 'region' ? '点击展开所别明细' : '点击折叠所别明细'}
                            onClick={() =>
                              setCollapseLevel((prev) => (prev === 'region' ? 'none' : 'region'))
                            }
                            onMouseEnter={(e) => {
                              const target = e.currentTarget;
                              target.style.backgroundColor = 'hsl(152, 60%, 88%)';
                              target.style.animation = 'heatmap-header-shake 0.3s ease-in-out';
                            }}
                            onMouseLeave={(e) => {
                              const target = e.currentTarget;
                              target.style.backgroundColor =
                                collapseLevel === 'region' ? 'hsl(152, 60%, 90%)' : 'hsl(217, 40%, 95%)';
                              target.style.animation = 'none';
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              所别
                              <span className="inline-flex items-center justify-center rounded-sm hover:bg-black/5 p-0.5 transition-colors">
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground">
                                  {collapseLevel === 'region' ? '▶' : '▼'}
                                </span>
                              </span>
                            </span>
                          </th>
                          <th
                            className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center cursor-pointer select-none whitespace-nowrap"
                            style={{
                              position: 'sticky', top: 0, zIndex: 10,
                              backgroundColor: collapseLevel === 'tier' ? 'hsl(152, 60%, 90%)' : 'hsl(217, 40%, 95%)',
                              transition: 'background-color 150ms ease',
                            }}
                            title={collapseLevel === 'tier' ? '点击展开阶层明细' : '点击折叠阶层明细'}
                            onClick={() =>
                              setCollapseLevel((prev) => (prev === 'tier' ? 'none' : 'tier'))
                            }
                            onMouseEnter={(e) => {
                              const target = e.currentTarget;
                              target.style.backgroundColor = 'hsl(152, 60%, 88%)';
                              target.style.animation = 'heatmap-header-shake 0.3s ease-in-out';
                            }}
                            onMouseLeave={(e) => {
                              const target = e.currentTarget;
                              target.style.backgroundColor =
                                collapseLevel === 'tier' ? 'hsl(152, 60%, 90%)' : 'hsl(217, 40%, 95%)';
                              target.style.animation = 'none';
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              阶层
                              <span className="inline-flex items-center justify-center rounded-sm hover:bg-black/5 p-0.5 transition-colors">
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground">
                                  {collapseLevel === 'tier' ? '▶' : '▼'}
                                </span>
                              </span>
                            </span>
                          </th>
                          <th
                            className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap"
                            style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}
                          >
                            业代
                          </th>
                          <th
                            className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap"
                            style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}
                          >
                            点数
                          </th>
                          <th
                            className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap"
                            style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}
                          >
                            未成交点数
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((rg) => (
                          <React.Fragment key={rg.region}>
                            {rg.tiers.map((tg) => (
                              <React.Fragment key={tg.tier}>
                                {/* 业代明细行：仅全部展开级别显示（所别、阶层列真实填充） */}
                                {collapseLevel === 'none' &&
                                  tg.rows.map((r, ri) => (
                                  <tr
                                    key={`${rg.region}-${tg.tier}-${r.salesRep}`}
                                    className="transition-colors duration-150 ease-out hover:bg-accent/10"
                                    style={{ backgroundColor: ri % 2 === 0 ? 'hsl(0, 0%, 100%)' : 'hsl(220, 18%, 98%)' }}
                                  >
                                    <td className="border-b border-r border-border px-3 py-2 text-foreground whitespace-nowrap">
                                      {rg.region}
                                    </td>
                                    <td className="border-b border-r border-border px-3 py-2 text-foreground whitespace-nowrap">
                                      {tg.tier}
                                    </td>
                                    <td className="border-b border-r border-border px-3 py-2 text-foreground whitespace-nowrap">
                                      <button
                                        type="button"
                                        className="cursor-pointer text-primary hover:underline"
                                        title={`点击查看 ${extractChineseName(r.salesRep)} 近六个月未成交下钻`}
                                        onClick={() => openDrilldown(r)}
                                      >
                                        {extractChineseName(r.salesRep)}
                                      </button>
                                    </td>
                                    <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-foreground whitespace-nowrap">
                                      {r.servicePoints.toLocaleString('zh-CN')}
                                    </td>
                                    <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                                      {r.unconvertedPoints.toLocaleString('zh-CN')}
                                    </td>
                                  </tr>
                                ))}
                                {/* 阶层小计行（tier 合计色 + 粗体；折叠到所别级别时隐藏） */}
                                {collapseLevel !== 'region' && (
                                  <tr className="!font-bold" style={{ backgroundColor: 'hsl(217, 60%, 94%)' }}>
                                    <td className="border-b border-r border-border px-3 py-1.5 text-black whitespace-nowrap">
                                      {rg.region}
                                    </td>
                                    <td className="border-b border-r border-border px-3 py-1.5 text-black whitespace-nowrap">
                                      {tg.tier}
                                    </td>
                                    <td className="border-b border-r border-border px-3 py-1.5 text-black whitespace-nowrap">
                                      {tg.tier}合计
                                    </td>
                                    <td className="border-b border-r border-border px-2 py-1.5 font-mono tabular-nums text-right text-black whitespace-nowrap">
                                      {tg.servicePoints.toLocaleString('zh-CN')}
                                    </td>
                                    <td className="border-b border-r border-border px-2 py-1.5 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                                      {tg.unconvertedPoints.toLocaleString('zh-CN')}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                            {/* 所别小计行（region 合计色 + 粗体） */}
                            <tr className="!font-bold" style={{ backgroundColor: 'hsl(220, 18%, 92%)' }}>
                              <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap">
                                {rg.region}
                              </td>
                              <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap" />
                              <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap">
                                {rg.region}合计
                              </td>
                              <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-black whitespace-nowrap">
                                {rg.servicePoints.toLocaleString('zh-CN')}
                              </td>
                              <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                                {rg.unconvertedPoints.toLocaleString('zh-CN')}
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                        {showTotal && (
                          <tr className="!font-bold" style={{ backgroundColor: 'hsl(220, 18%, 86%)' }}>
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap">
                              部门合计
                            </td>
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap" />
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap" />
                            <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-black whitespace-nowrap">
                              {totals.servicePoints.toLocaleString('zh-CN')}
                            </td>
                            <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                              {totals.unconvertedPoints.toLocaleString('zh-CN')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );

                return (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      {leftGroups.length > 0 && (
                        <div>
                          {renderTable(leftGroups, false)}
                        </div>
                      )}
                      {rightGroups.length > 0 && (
                        <div>
                          {renderTable(rightGroups, false)}
                        </div>
                      )}
                    </div>
                    {/* 部门合计行（total 合计色 + 粗体） */}
                    <div className="border-t border-border overflow-hidden rounded-b-sm">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          <tr className="!font-bold" style={{ backgroundColor: 'hsl(220, 18%, 86%)' }}>
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap">
                              部门合计
                            </td>
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap" />
                            <td className="border-b border-r border-border px-3 py-2 text-black whitespace-nowrap" />
                            <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-black whitespace-nowrap">
                              {totals.servicePoints.toLocaleString('zh-CN')}
                            </td>
                            <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                              {totals.unconvertedPoints.toLocaleString('zh-CN')}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* 线路选择 Dialog（未成交明细导出） */}
      <Dialog open={routeDialogOpen} onOpenChange={(open: boolean) => { if (!open) handleRouteCancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">选择线路</DialogTitle>
            <DialogDescription className="text-xs">
              请选择线路以导出所选线路未成交门店明细
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            {/* 全选 */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-accent cursor-pointer transition-colors"
              onClick={handleToggleAll}
            >
              <Checkbox
                checked={allRoutesSelected ? true : indeterminate ? 'indeterminate' : false}
              />
              <span className="text-sm font-medium text-foreground">全选</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {selectedRoutes.length}/{BASIC_ROUTE_OPTIONS.length}
              </span>
            </div>
            <div className="border-t border-border my-1" />
            {/* 周一~周六 */}
            <div className="grid grid-cols-3 gap-1 px-1 py-1">
              {BASIC_ROUTE_OPTIONS.map((routeName: string) => (
                <div
                  key={routeName}
                  className={`flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer transition-colors ${
                    selectedRoutes.includes(routeName)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-accent border border-transparent'
                  }`}
                  onClick={() => toggleRoute(routeName)}
                >
                  <Checkbox checked={selectedRoutes.includes(routeName)} />
                  <span className="text-sm text-foreground">{routeName}</span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleRouteCancel}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleRouteConfirm}
              disabled={selectedRoutes.length === 0}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1">✓</span>
              确定导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 业代未成交门店下钻 Dialog */}
      <Dialog
        open={drilldownRep !== null}
        onOpenChange={(open: boolean) => { if (!open) setDrilldownRep(null); }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {drilldownRep ? `${extractChineseName(drilldownRep.salesRep)} · 未成交门店下钻` : '未成交门店下钻'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              近六个月分月未成交门店数（数据截至 {dateTo}）
            </DialogDescription>
          </DialogHeader>

          {drilldownLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : drilldownError ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="emoji">⚠️</EmptyMedia>
                  <EmptyTitle>加载失败</EmptyTitle>
                  <EmptyDescription>{drilldownError}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : drilldownData ? (
            <div className="space-y-4">
              {/* 连续N个月未成交统计卡 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard
                  icon="📅"
                  label="连续2个月未成交"
                  variant="error"
                  hoverEffect
                  value={drilldownData.consecutive2Months.toLocaleString('zh-CN')}
                  subText={<span>家门店（6个月窗口内）</span>}
                />
                <KpiCard
                  icon="📅"
                  label="连续3个月未成交"
                  variant="error"
                  hoverEffect
                  value={drilldownData.consecutive3Months.toLocaleString('zh-CN')}
                  subText={<span>家门店（6个月窗口内）</span>}
                />
              </div>

              {/* 分月未成交明细表 */}
              <div className="overflow-auto rounded-sm border border-border" style={{ maxHeight: 340 }}>
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(217, 40%, 95%)' }}>
                      <th className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}>
                        月份
                      </th>
                      <th className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}>
                        服务门店数
                      </th>
                      <th className="border-b border-r border-border px-3 py-2 !font-bold text-black text-center whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(217, 40%, 95%)' }}>
                        未成交门店数
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownData.months.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="border-b border-r border-border px-3 py-6 text-center text-muted-foreground">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      drilldownData.months.map((m, idx) => (
                        <tr
                          key={m.month}
                          className="transition-colors duration-150 ease-out hover:bg-accent/10"
                          style={{ backgroundColor: idx % 2 === 0 ? 'hsl(0, 0%, 100%)' : 'hsl(220, 18%, 98%)' }}
                        >
                          <td className="border-b border-r border-border px-3 py-2 text-foreground whitespace-nowrap">
                            {m.monthLabel}
                          </td>
                          <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-foreground whitespace-nowrap">
                            {m.serviceStores.toLocaleString('zh-CN')}
                          </td>
                          <td className="border-b border-r border-border px-2 py-2 font-mono tabular-nums text-right text-[hsl(4,72%,52%)] whitespace-nowrap">
                            {m.unconvertedStores.toLocaleString('zh-CN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDrilldownRep(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnconvertedStoresQueryPanel;
