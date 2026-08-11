import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';

import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import { datasetApi, reportApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  AtpPerformanceResponse,
  AtpPerformanceRow,
  AtpPerformanceStoreRow,
  AtpPerformanceStoreDetailResponse,
  AtpThresholdParams,
  HeatmapFilterParams,
  ReportRow,
  ReportSheetData,
  ReportCellStyle,
} from '@shared/api.interface';

type RowType = 'data' | 'regionTotal' | 'grandTotal';
type DrillMetric = 'paidPointFeeRatio' | 'paidPointSalesRatio';

interface DisplayRow extends AtpPerformanceRow {
  rowType: RowType;
}

interface MonthlyDrillData {
  months: string[];
  ratioMap: Map<string, (number | null)[]>;
  regionRatioMap: Map<string, (number | null)[]>;
  grandRatio: (number | null)[];
}

interface AtpPerformanceProps {
  filters: HeatmapFilterParams;
  dateFrom: string;
  dateTo: string;
  filterReady: boolean;
  onHasDataChange?: (hasData: boolean) => void;
  onDataChange?: (data: AtpPerformanceResponse | null) => void;
  onLoadingChange?: (loading: boolean) => void;
}

interface ColumnDef {
  key: keyof AtpPerformanceRow;
  label: string;
  align?: 'left' | 'right';
  format?: (v: number) => string;
  drill?: DrillMetric;
  headerBg?: string;
}

/** 自定义参数系统默认值（与后端硬编码一致） */
const DEFAULT_THRESHOLDS: Required<AtpThresholdParams> = {
  feeLe10: 0.1,
  feeGt15: 0.15,
  salesLt1000: 1000,
  salesLt2000: 2000,
};

/** 冻结在表格左侧的列数（所别/阶层/业代/总点数） */
const FROZEN_COLS = 4;
/** 冻结表头实色背景（与 --accent 一致，避免横向滚动时下方内容透出） */
const FROZEN_HEADER_BG = 'hsl(217, 40%, 95%)';

/** 根据自定义参数动态生成表头列（费比/销额阈值随参数实时变化） */
const buildColumns = (thresholds: AtpThresholdParams): ColumnDef[] => {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const le10 = Math.round(t.feeLe10 * 100);
  const gt15 = Math.round(t.feeGt15 * 100);
  return [
    { key: 'region', label: '所别', align: 'left' },
    { key: 'tier', label: '阶层', align: 'left' },
    { key: 'salesRep', label: '业代', align: 'left' },
    { key: 'totalPoints', label: '总点数', align: 'right', format: formatInt },
    { key: 'paidPoints', label: '付费点数', align: 'right', format: formatInt },
    { key: 'paidAmount', label: '付费金额', align: 'right', format: formatCurrency },
    { key: 'totalStoreSales', label: '总门店销额', align: 'right', format: formatCurrency },
    { key: 'paidPointFeeRatio', label: '投入费比', align: 'right', format: formatPercent, drill: 'paidPointFeeRatio' },
    { key: 'feeRatioLe10', label: `费比≦${le10}%`, align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'feeRatio10to15', label: `${le10}%<费比≦${gt15}%`, align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'feeRatioGt15', label: `费比>${gt15}%`, align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'feeRatioNoDeal', label: '未成交', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'feeRatioLe10Ratio', label: `费比≦${le10}%点数占比`, align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
    { key: 'feeRatio10to15Ratio', label: `${le10}%<费比≦${gt15}%点数占比`, align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
    { key: 'feeRatioGt15Ratio', label: `费比>${gt15}%点数占比`, align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
    { key: 'feeRatioNoDealRatio', label: '未成交点数占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
    { key: 'paidPointSalesRatio', label: '付费点销额占比', align: 'right', format: formatPercent, drill: 'paidPointSalesRatio' },
    { key: 'salesLt1000Count', label: `销额<${t.salesLt1000}元点数`, align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'salesLt1000Ratio', label: `销额<${t.salesLt1000}元占比`, align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
    { key: 'salesLt2000Count', label: `销额<${t.salesLt2000}元点数`, align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
    { key: 'salesLt2000Ratio', label: `销额<${t.salesLt2000}元占比`, align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  ];
};

interface StoreColumnDef {
  key: keyof AtpPerformanceStoreRow;
  label: string;
  align?: 'left' | 'right';
  format?: (v: number) => string;
  drill?: DrillMetric;
  headerBg?: string;
}

const buildStoreColumns = (thresholds: AtpThresholdParams): StoreColumnDef[] => {
  const base = buildColumns(thresholds);
  return [
    { key: 'region', label: '所别', align: 'left' },
    { key: 'tier', label: '阶层', align: 'left' },
    { key: 'salesRep', label: '业代', align: 'left' },
    { key: 'customerName', label: '门店名', align: 'left' },
    { key: 'customerCode', label: '门店编码', align: 'left' },
    ...(base.slice(3).map((c) => ({
      key: c.key as keyof AtpPerformanceStoreRow,
      label: c.label,
      align: c.align,
      format: c.format,
      drill: c.drill,
      headerBg: c.headerBg,
    })) as StoreColumnDef[]),
  ];
};

interface StoreMonthlyDrillData {
  months: string[];
  storeRatioMap: Map<string, (number | null)[]>;
  salesRepRatioMap: Map<string, (number | null)[]>;
  regionRatioMap: Map<string, (number | null)[]>;
  grandRatio: (number | null)[];
}

type StoreRowType = 'data' | 'salesRepTotal' | 'regionTotal' | 'grandTotal';

interface StoreDisplayRow extends AtpPerformanceStoreRow {
  rowType: StoreRowType;
  originalSalesRep?: string;
}

function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('zh-CN');
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('zh-CN');
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%';
  return `${(value * 100).toFixed(2)}%`;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toH = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `${toH(r)}${toH(g)}${toH(b)}`;
}

function baseCellStyle(): ReportCellStyle {
  return {
    font: { sz: 10, color: { rgb: '1A2433' } },
    alignment: { vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'D0D5DD' } },
      bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
      left: { style: 'thin', color: { rgb: 'D0D5DD' } },
      right: { style: 'thin', color: { rgb: 'D0D5DD' } },
    },
  };
}

const aggregateRows = (items: AtpPerformanceRow[]): AtpPerformanceRow => {
  const totalPoints = items.reduce((s, r) => s + r.totalPoints, 0);
  const paidPoints = items.reduce((s, r) => s + r.paidPoints, 0);
  const paidAmount = items.reduce((s, r) => s + r.paidAmount, 0);
  const totalStoreSales = items.reduce((s, r) => s + r.totalStoreSales, 0);
  const paidStoreSales = items.reduce((s, r) => s + r.paidStoreSales, 0);
  return {
    region: '',
    tier: '',
    salesRep: '',
    totalPoints,
    paidPoints,
    paidAmount,
    totalStoreSales,
    paidStoreSales,
    // 后端 paidAmount 已为所选区间费用合计，不再乘以月份数
    paidPointFeeRatio: paidStoreSales > 0 ? paidAmount / paidStoreSales : 0,
    paidPointSalesRatio: totalStoreSales > 0 ? paidStoreSales / totalStoreSales : 0,
    feeRatioLe10: items.reduce((s, r) => s + r.feeRatioLe10, 0),
    feeRatio10to15: items.reduce((s, r) => s + r.feeRatio10to15, 0),
    feeRatioGt15: items.reduce((s, r) => s + r.feeRatioGt15, 0),
    feeRatioNoDeal: items.reduce((s, r) => s + r.feeRatioNoDeal, 0),
    feeRatioLe10Ratio: paidPoints > 0 ? items.reduce((s, r) => s + r.feeRatioLe10, 0) / paidPoints : 0,
    feeRatio10to15Ratio: paidPoints > 0 ? items.reduce((s, r) => s + r.feeRatio10to15, 0) / paidPoints : 0,
    feeRatioGt15Ratio: paidPoints > 0 ? items.reduce((s, r) => s + r.feeRatioGt15, 0) / paidPoints : 0,
    feeRatioNoDealRatio: paidPoints > 0 ? items.reduce((s, r) => s + r.feeRatioNoDeal, 0) / paidPoints : 0,
    salesLt1000Count: items.reduce((s, r) => s + (r.salesLt1000Count ?? 0), 0),
    salesLt1000Ratio: paidPoints > 0 ? items.reduce((s, r) => s + (r.salesLt1000Count ?? 0), 0) / paidPoints : 0,
    salesLt2000Count: items.reduce((s, r) => s + (r.salesLt2000Count ?? 0), 0),
    salesLt2000Ratio: paidPoints > 0 ? items.reduce((s, r) => s + (r.salesLt2000Count ?? 0), 0) / paidPoints : 0,
  };
};

const formatMonthStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatMonthLabel = (month: string): string => {
  const m = parseInt(month.split('-')[1], 10);
  return `${m}月`;
};

const monthToDateRange = (month: string): { from: string; to: string } => {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const toDate = new Date(y, m, 0);
  const to = `${month}-${String(toDate.getDate()).padStart(2, '0')}`;
  return { from, to };
};

/** 根据自定义参数动态生成表头换行规则（随阈值变化同步更新） */
const buildHeaderWraps = (thresholds: AtpThresholdParams): Record<string, string[]> => {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const le10 = Math.round(t.feeLe10 * 100);
  const gt15 = Math.round(t.feeGt15 * 100);
  const l1000 = t.salesLt1000;
  const l2000 = t.salesLt2000;
  return {
    '投入费比': ['投入费比'],
    '付费点销额占比': ['付费点销额', '占比'],
    '总门店销额': ['总门店', '销额'],
    '付费金额': ['付费', '金额'],
    '付费点数': ['付费', '点数'],
    '总点数': ['总', '点数'],
    [`费比≦${le10}%`]: ['费比', `≦${le10}%`],
    [`${le10}%<费比≦${gt15}%`]: [`${le10}%<费比`, `≦${gt15}%`],
    [`费比>${gt15}%`]: ['费比', `>${gt15}%`],
    '未成交': ['未', '成交'],
    [`费比≦${le10}%点数占比`]: [`费比≦${le10}%`, '点数占比'],
    [`${le10}%<费比≦${gt15}%点数占比`]: [`${le10}%<费比≦${gt15}%`, '点数占比'],
    [`费比>${gt15}%点数占比`]: [`费比>${gt15}%`, '点数占比'],
    '未成交点数占比': ['未成交', '点数占比'],
    [`销额<${l1000}元点数`]: [`销额<${l1000}`, '元点数'],
    [`销额<${l1000}元占比`]: [`销额<${l1000}`, '元占比'],
    [`销额<${l2000}元点数`]: [`销额<${l2000}`, '元点数'],
    [`销额<${l2000}元占比`]: [`销额<${l2000}`, '元占比'],
  };
};

const renderWrappedLabel = (
  label: string,
  wraps: Record<string, string[]>,
): React.ReactNode => {
  const lines = wraps[label] ?? [label];
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));
};

const redColorForRatio = (ratio: number): string => {
  const intensity = Math.min(Math.max(ratio, 0), 1);
  const l = Math.round(95 - intensity * 45);
  return `hsl(4, 72%, ${l}%)`;
};

const greenColorForRatio = (ratio: number): string => {
  const intensity = Math.min(Math.max(ratio, 0), 1);
  const l = Math.round(95 - intensity * 45);
  return `hsl(152, 60%, ${l}%)`;
};

const RED_TOP_FILL = 'hsl(4, 72%, 90%)';
const GREEN_TOP_FILL = 'hsl(152, 60%, 90%)';
const RED_WARN_FILL = 'hsl(4, 72%, 90%)';
const YELLOW_WARN_FILL = 'hsl(48, 90%, 88%)';

const isTop3 = (arr: (number | null)[] | undefined, index: number): boolean => {
  if (!arr || arr[index] === null || arr[index] === undefined) return false;
  const values = arr.filter((v): v is number => v !== null && v !== undefined);
  const topN = Math.min(3, values.length);
  if (topN === 0) return false;
  values.sort((a, b) => b - a);
  return arr[index]! >= values[topN - 1];
};

const getLast6MonthsDesc = (endMonth: string): string[] => {
  const [y, m] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.unshift(formatMonthStr(d));
  }
  return months;
};

const computeMonthlyData = (
  metric: DrillMetric,
  months: string[],
  responses: AtpPerformanceResponse[],
): MonthlyDrillData => {
  const ratioMap = new Map<string, (number | null)[]>();
  const regionPaidMap = new Map<string, number[]>();
  const regionPaidStoreSalesMap = new Map<string, number[]>();
  const regionTotalStoreSalesMap = new Map<string, number[]>();
  const grandPaid = new Array(months.length).fill(0);
  const grandPaidStoreSales = new Array(months.length).fill(0);
  const grandTotalStoreSales = new Array(months.length).fill(0);

  for (let mi = 0; mi < months.length; mi++) {
    const rows = responses[mi]?.rows ?? [];
    for (const row of rows) {
      const key = `${row.region}||${row.tier}||${row.salesRep}`;
      if (!ratioMap.has(key)) {
        ratioMap.set(key, new Array(months.length).fill(null));
      }
      const arr = ratioMap.get(key)!;
      const ratio =
        metric === 'paidPointFeeRatio'
          ? row.paidStoreSales > 0
            ? row.paidAmount / row.paidStoreSales
            : null
          : row.totalStoreSales > 0
            ? row.paidStoreSales / row.totalStoreSales
            : null;
      arr[mi] = ratio;

      // 所别合计聚合
      if (!regionPaidMap.has(row.region)) {
        regionPaidMap.set(row.region, new Array(months.length).fill(0));
        regionPaidStoreSalesMap.set(row.region, new Array(months.length).fill(0));
        regionTotalStoreSalesMap.set(row.region, new Array(months.length).fill(0));
      }
      regionPaidMap.get(row.region)![mi] += row.paidAmount;
      regionPaidStoreSalesMap.get(row.region)![mi] += row.paidStoreSales;
      regionTotalStoreSalesMap.get(row.region)![mi] += row.totalStoreSales;
      grandPaid[mi] += row.paidAmount;
      grandPaidStoreSales[mi] += row.paidStoreSales;
      grandTotalStoreSales[mi] += row.totalStoreSales;
    }
  }

  const regionRatioMap = new Map<string, (number | null)[]>();
  for (const [region, paidArr] of regionPaidMap) {
    const paidSalesArr = regionPaidStoreSalesMap.get(region)!;
    const totalSalesArr = regionTotalStoreSalesMap.get(region)!;
    regionRatioMap.set(
      region,
      metric === 'paidPointFeeRatio'
        ? paidArr.map((paid, i) => (paidSalesArr[i] > 0 ? paid / paidSalesArr[i] : null))
        : paidSalesArr.map((paidSales, i) =>
            totalSalesArr[i] > 0 ? paidSales / totalSalesArr[i] : null,
          ),
    );
  }
  const grandRatio =
    metric === 'paidPointFeeRatio'
      ? grandPaid.map((paid, i) =>
          grandPaidStoreSales[i] > 0 ? paid / grandPaidStoreSales[i] : null,
        )
      : grandPaidStoreSales.map((paidSales, i) =>
          grandTotalStoreSales[i] > 0 ? paidSales / grandTotalStoreSales[i] : null,
        );

  return { months, ratioMap, regionRatioMap, grandRatio };
};

const computeStoreMonthlyData = (
  metric: DrillMetric,
  months: string[],
  responses: AtpPerformanceStoreDetailResponse[],
): StoreMonthlyDrillData => {
  const storeRatioMap = new Map<string, (number | null)[]>();
  const storeTotalStoreSalesMap = new Map<string, number[]>();
  const salesRepPaidMap = new Map<string, number[]>();
  const salesRepPaidStoreSalesMap = new Map<string, number[]>();
  const salesRepTotalStoreSalesMap = new Map<string, number[]>();
  const regionPaidMap = new Map<string, number[]>();
  const regionPaidStoreSalesMap = new Map<string, number[]>();
  const regionTotalStoreSalesMap = new Map<string, number[]>();
  const grandPaid = new Array(months.length).fill(0);
  const grandPaidStoreSales = new Array(months.length).fill(0);
  const grandTotalStoreSales = new Array(months.length).fill(0);

  for (let mi = 0; mi < months.length; mi++) {
    const rows = responses[mi]?.rows ?? [];
    for (const row of rows) {
      const storeKey = `${row.region}||${row.tier}||${row.salesRep}||${row.customerName}||${row.customerCode}`;
      if (!storeRatioMap.has(storeKey)) {
        storeRatioMap.set(storeKey, new Array(months.length).fill(null));
        storeTotalStoreSalesMap.set(storeKey, new Array(months.length).fill(0));
      }

      const salesRepKey = `${row.region}||${row.tier}||${row.salesRep}`;
      if (!salesRepPaidMap.has(salesRepKey)) {
        salesRepPaidMap.set(salesRepKey, new Array(months.length).fill(0));
        salesRepPaidStoreSalesMap.set(salesRepKey, new Array(months.length).fill(0));
        salesRepTotalStoreSalesMap.set(salesRepKey, new Array(months.length).fill(0));
      }
      salesRepPaidMap.get(salesRepKey)![mi] += row.paidAmount;
      salesRepPaidStoreSalesMap.get(salesRepKey)![mi] += row.paidStoreSales;
      salesRepTotalStoreSalesMap.get(salesRepKey)![mi] += row.totalStoreSales;

      if (!regionPaidMap.has(row.region)) {
        regionPaidMap.set(row.region, new Array(months.length).fill(0));
        regionPaidStoreSalesMap.set(row.region, new Array(months.length).fill(0));
        regionTotalStoreSalesMap.set(row.region, new Array(months.length).fill(0));
      }
      regionPaidMap.get(row.region)![mi] += row.paidAmount;
      regionPaidStoreSalesMap.get(row.region)![mi] += row.paidStoreSales;
      regionTotalStoreSalesMap.get(row.region)![mi] += row.totalStoreSales;

      grandPaid[mi] += row.paidAmount;
      grandPaidStoreSales[mi] += row.paidStoreSales;
      grandTotalStoreSales[mi] += row.totalStoreSales;

      storeTotalStoreSalesMap.get(storeKey)![mi] = row.totalStoreSales;
      const arr = storeRatioMap.get(storeKey)!;
      if (metric === 'paidPointFeeRatio') {
        arr[mi] = row.paidStoreSales > 0 ? row.paidAmount / row.paidStoreSales : null;
      }
      // paidPointSalesRatio 在聚合完成后统一计算
    }
  }

  // 计算门店级付费点销额占比：单店销额 / 业代所有门店销额
  if (metric === 'paidPointSalesRatio') {
    for (const [storeKey, totalSalesArr] of storeTotalStoreSalesMap) {
      const salesRepKey = storeKey.split('||').slice(0, 3).join('||');
      const srTotalArr = salesRepTotalStoreSalesMap.get(salesRepKey)!;
      const ratios = storeRatioMap.get(storeKey)!;
      for (let mi = 0; mi < months.length; mi++) {
        ratios[mi] =
          srTotalArr[mi] > 0 ? totalSalesArr[mi] / srTotalArr[mi] : null;
      }
    }
  }

  const salesRepRatioMap = new Map<string, (number | null)[]>();
  for (const [key, paidArr] of salesRepPaidMap) {
    const paidSalesArr = salesRepPaidStoreSalesMap.get(key)!;
    const totalSalesArr = salesRepTotalStoreSalesMap.get(key)!;
    const regionKey = key.split('||')[0];
    salesRepRatioMap.set(
      key,
      metric === 'paidPointFeeRatio'
        ? paidArr.map((paid, i) => (paidSalesArr[i] > 0 ? paid / paidSalesArr[i] : null))
        : totalSalesArr.map((totalSales, i) => {
            const regionTotal = regionTotalStoreSalesMap.get(regionKey)?.[i] ?? 0;
            return regionTotal > 0 ? totalSales / regionTotal : null;
          }),
    );
  }

  const regionRatioMap = new Map<string, (number | null)[]>();
  for (const [region, paidArr] of regionPaidMap) {
    const paidSalesArr = regionPaidStoreSalesMap.get(region)!;
    const totalSalesArr = regionTotalStoreSalesMap.get(region)!;
    regionRatioMap.set(
      region,
      metric === 'paidPointFeeRatio'
        ? paidArr.map((paid, i) => (paidSalesArr[i] > 0 ? paid / paidSalesArr[i] : null))
        : totalSalesArr.map((totalSales, i) =>
            grandTotalStoreSales[i] > 0 ? totalSales / grandTotalStoreSales[i] : null,
          ),
    );
  }

  const grandRatio =
    metric === 'paidPointFeeRatio'
      ? grandPaid.map((paid, i) =>
          grandPaidStoreSales[i] > 0 ? paid / grandPaidStoreSales[i] : null,
        )
      : grandTotalStoreSales.map((totalSales) => (totalSales > 0 ? 1 : null));

  return { months, storeRatioMap, salesRepRatioMap, regionRatioMap, grandRatio };
};

const buildStoreDisplayRows = (
  rows: AtpPerformanceStoreRow[],
): StoreDisplayRow[] => {
  if (rows.length === 0) return [];

  // 预计算各层级 time-range 总销额，用于重新定义「付费点销额占比」
  const grandTotalStoreSales = rows.reduce((s, r) => s + r.totalStoreSales, 0);
  const regionTotalMap = new Map<string, number>();
  const salesRepTotalMap = new Map<string, number>();
  for (const r of rows) {
    regionTotalMap.set(r.region, (regionTotalMap.get(r.region) ?? 0) + r.totalStoreSales);
    const key = `${r.region}||${r.tier}||${r.salesRep}`;
    salesRepTotalMap.set(key, (salesRepTotalMap.get(key) ?? 0) + r.totalStoreSales);
  }

  const result: StoreDisplayRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const region = rows[i].region;
    const regionRows: AtpPerformanceStoreRow[] = [];
    while (i < rows.length && rows[i].region === region) {
      const tier = rows[i].tier;
      const tierRows: AtpPerformanceStoreRow[] = [];
      while (i < rows.length && rows[i].region === region && rows[i].tier === tier) {
        const salesRep = rows[i].salesRep;
        const salesRepRows: AtpPerformanceStoreRow[] = [];
        while (
          i < rows.length &&
          rows[i].region === region &&
          rows[i].tier === tier &&
          rows[i].salesRep === salesRep
        ) {
          salesRepRows.push(rows[i]);
          const srTotal = salesRepTotalMap.get(`${rows[i].region}||${rows[i].tier}||${rows[i].salesRep}`) ?? 0;
          result.push({
            ...rows[i],
            paidPointSalesRatio: srTotal > 0 ? rows[i].totalStoreSales / srTotal : 0,
            rowType: 'data',
          });
          i++;
        }
        const salesRepTotal = aggregateRows(salesRepRows);
        const salesRepTotalStoreSales = salesRepTotalMap.get(`${region}||${tier}||${salesRep}`) ?? 0;
        const regionTotalStoreSales = regionTotalMap.get(region) ?? 0;
        result.push({
          ...salesRepTotal,
          paidPointSalesRatio: regionTotalStoreSales > 0 ? salesRepTotalStoreSales / regionTotalStoreSales : 0,
          region,
          tier,
          salesRep: `${salesRep}合计`,
          originalSalesRep: salesRep,
          customerName: '',
          customerCode: '',
          rowType: 'salesRepTotal',
        });
        tierRows.push(...salesRepRows);
      }
      regionRows.push(...tierRows);
    }
    const regionTotal = aggregateRows(regionRows);
    const regionTotalStoreSales = regionTotalMap.get(region) ?? 0;
    result.push({
      ...regionTotal,
      paidPointSalesRatio: grandTotalStoreSales > 0 ? regionTotalStoreSales / grandTotalStoreSales : 0,
      region,
      tier: '合计',
      salesRep: '',
      customerName: '',
      customerCode: '',
      rowType: 'regionTotal',
    });
  }
  const grandTotal = aggregateRows(rows);
  result.push({
    ...grandTotal,
    paidPointSalesRatio: grandTotalStoreSales > 0 ? 1 : 0,
    region: '整体合计',
    tier: '',
    salesRep: '',
    customerName: '',
    customerCode: '',
    rowType: 'grandTotal',
  });
  return result;
};

const AtpPerformance: React.FC<AtpPerformanceProps> = ({
  filters,
  dateFrom,
  dateTo,
  filterReady,
  onHasDataChange,
  onDataChange,
  onLoadingChange,
}) => {
  const navigate = useNavigate();
  const tableRef = useRef<HTMLTableElement>(null);
  // 前 FROZEN_COLS 列的实际宽度（用于 sticky left 偏移计算）
  const [frozenColWidths, setFrozenColWidths] = useState<number[]>([]);
  const [data, setData] = useState<AtpPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Record<DrillMetric, boolean>>({
    paidPointFeeRatio: false,
    paidPointSalesRatio: false,
  });
  const [monthlyData, setMonthlyData] = useState<Record<DrillMetric, MonthlyDrillData | null>>({
    paidPointFeeRatio: null,
    paidPointSalesRatio: null,
  });
  const [drillLoading, setDrillLoading] = useState<Record<DrillMetric, boolean>>({
    paidPointFeeRatio: false,
    paidPointSalesRatio: false,
  });
  const [collapseMode, setCollapseMode] = useState<'none' | 'region' | 'tier'>('none');
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [expandRegionDetail, setExpandRegionDetail] = useState(false);
  // 自定义分档参数（默认与系统一致）
  const [thresholds, setThresholds] = useState<AtpThresholdParams>({ ...DEFAULT_THRESHOLDS });
  const [thresholdDialogOpen, setThresholdDialogOpen] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<
    Record<'feeLe10' | 'feeGt15' | 'salesLt1000' | 'salesLt2000', string>
  >({
    feeLe10: '10',
    feeGt15: '15',
    salesLt1000: '1000',
    salesLt2000: '2000',
  });

  const openThresholdDialog = useCallback(() => {
    setThresholdDraft({
      feeLe10: String(Math.round((thresholds.feeLe10 ?? DEFAULT_THRESHOLDS.feeLe10) * 100)),
      feeGt15: String(Math.round((thresholds.feeGt15 ?? DEFAULT_THRESHOLDS.feeGt15) * 100)),
      salesLt1000: String(thresholds.salesLt1000 ?? DEFAULT_THRESHOLDS.salesLt1000),
      salesLt2000: String(thresholds.salesLt2000 ?? DEFAULT_THRESHOLDS.salesLt2000),
    });
    setThresholdDialogOpen(true);
  }, [thresholds]);

  const saveThresholds = useCallback(() => {
    const parseNum = (s: string, fallback: number) => {
      const v = parseFloat(s);
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    setThresholds({
      feeLe10: parseNum(thresholdDraft.feeLe10, DEFAULT_THRESHOLDS.feeLe10) / 100,
      feeGt15: parseNum(thresholdDraft.feeGt15, DEFAULT_THRESHOLDS.feeGt15) / 100,
      salesLt1000: parseNum(thresholdDraft.salesLt1000, DEFAULT_THRESHOLDS.salesLt1000),
      salesLt2000: parseNum(thresholdDraft.salesLt2000, DEFAULT_THRESHOLDS.salesLt2000),
    });
    setThresholdDialogOpen(false);
    toast.success('自定义参数已保存，统计与导出将按新参数重新计算');
  }, [thresholdDraft]);

  const resetThresholds = useCallback(() => {
    setThresholdDraft({
      feeLe10: String(Math.round(DEFAULT_THRESHOLDS.feeLe10 * 100)),
      feeGt15: String(Math.round(DEFAULT_THRESHOLDS.feeGt15 * 100)),
      salesLt1000: String(DEFAULT_THRESHOLDS.salesLt1000),
      salesLt2000: String(DEFAULT_THRESHOLDS.salesLt2000),
    });
  }, []);

  const updateThresholdDraft = useCallback(
    (key: keyof typeof thresholdDraft, value: string) => {
      setThresholdDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // 基于当前自定义参数动态生成表头列与换行规则
  const columns = useMemo(() => buildColumns(thresholds), [thresholds]);
  const storeColumns = useMemo(() => buildStoreColumns(thresholds), [thresholds]);
  const headerWraps = useMemo(() => buildHeaderWraps(thresholds), [thresholds]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);
    try {
      const result = await datasetApi.getAtpPerformance(
        dateFrom,
        dateTo,
        'day',
        filters,
        thresholds,
      );
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load ATP performance:', err);
      setError(msg);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [dateFrom, dateTo, filters, thresholds, onLoadingChange]);

  // Only fire a query when the user has explicitly confirmed filters
  useEffect(() => {
    if (filterReady) {
      fetchData();
    }
  }, [filterReady, filters, fetchData]);

  const baseRows = data?.rows ?? [];

  useEffect(() => {
    onHasDataChange?.(baseRows.length > 0);
  }, [baseRows.length, onHasDataChange]);

  useEffect(() => {
    onDataChange?.(data);
  }, [data, onDataChange]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (baseRows.length === 0) return [];
    const result: DisplayRow[] = [];
    let i = 0;
    while (i < baseRows.length) {
      const region = baseRows[i].region;
      const regionRows: AtpPerformanceRow[] = [];
      while (i < baseRows.length && baseRows[i].region === region) {
        regionRows.push(baseRows[i]);
        i++;
      }
      result.push(
        ...regionRows.map((r) => ({ ...r, rowType: 'data' as const })),
      );
      const sub = aggregateRows(regionRows);
      result.push({
        ...sub,
        region,
        tier: '合计',
        salesRep: '',
        rowType: 'regionTotal',
      });
    }
    const grand = aggregateRows(baseRows);
    result.push({
      ...grand,
      region: '整体合计',
      tier: '',
      salesRep: '',
      rowType: 'grandTotal',
    });
    return result;
  }, [baseRows]);

  const regionRatios = useMemo(() => {
    const map = new Map<string, { fee: number; sales: number }>();
    for (const row of displayRows) {
      if (row.rowType === 'regionTotal') {
        map.set(row.region, {
          fee: row.paidPointFeeRatio,
          sales: row.paidPointSalesRatio,
        });
      }
    }
    return map;
  }, [displayRows]);

  const visibleRows = useMemo<DisplayRow[]>(() => {
    if (collapseMode === 'tier') {
      return displayRows.filter(
        (r) => r.rowType !== 'data' || r.tier === '一阶' || r.tier === '二阶',
      );
    }
    if (expandRegionDetail) {
      return displayRows;
    }
    return displayRows.filter((r) => r.rowType !== 'data');
  }, [displayRows, collapseMode, expandRegionDetail]);

  const toggleCollapse = useCallback((mode: 'region' | 'tier') => {
    setCollapseMode((prev) => (prev === mode ? 'none' : mode));
  }, []);

  // 点击「所别」表头：展开/折叠所别明细
  const toggleRegionDetail = useCallback(() => {
    setExpandRegionDetail((v) => !v);
  }, []);

  const loadDrill = useCallback(async (metric: DrillMetric) => {
    const endMonth = String(dateTo ?? '').slice(0, 7) || formatMonthStr(new Date());
    const months = getLast6MonthsDesc(endMonth);
    setDrillLoading((prev) => ({ ...prev, [metric]: true }));
    try {
      const results = await Promise.all(
        months.map((m) =>
          datasetApi.getAtpPerformance(
            monthToDateRange(m).from,
            monthToDateRange(m).to,
            'day',
            filters,
            thresholds,
          ),
        ),
      );
      const computed = computeMonthlyData(metric, months, results);
      setMonthlyData((prev) => ({ ...prev, [metric]: computed }));
    } catch (err: unknown) {
      logger.error('Failed to load ATP drill-out:', err);
      toast.error('加载近6个月数据失败');
    } finally {
      setDrillLoading((prev) => ({ ...prev, [metric]: false }));
    }
  }, [dateTo, filters, thresholds]);

  const toggleDrill = useCallback((metric: DrillMetric) => {
    setExpanded((prev) => {
      const next = { ...prev, [metric]: !prev[metric] };
      if (next[metric] && !monthlyData[metric]) {
        loadDrill(metric);
      }
      return next;
    });
  }, [monthlyData, loadDrill]);

  // 自定义参数变化后：清空旧的下钻数据，并对已展开的指标重新按新参数计算
  useEffect(() => {
    setMonthlyData({ paidPointFeeRatio: null, paidPointSalesRatio: null });
    for (const metric of ['paidPointFeeRatio', 'paidPointSalesRatio'] as DrillMetric[]) {
      if (expanded[metric]) {
        loadDrill(metric);
      }
    }
    // 仅当 thresholds 引用变化时触发（保存参数后）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholds]);

  const handleExport = useCallback(async () => {
    if (!visibleRows.length || exporting) return;
    setExporting(true);
    try {
      const headerStyle: ReportCellStyle = {
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

      // ---------- 主表：ATP绩效 ----------
      // 构建导出列：基础列 + 展开的下钻月度列
      type ExportCol =
        | { type: 'base'; col: ColumnDef }
        | { type: 'drill'; metric: DrillMetric; month: string; monthIndex: number };

      const exportCols: ExportCol[] = [];
      for (const col of columns) {
        exportCols.push({ type: 'base', col });
        if (col.drill && expanded[col.drill]) {
          const drill = monthlyData[col.drill];
          const months = drill?.months ?? [];
          months.forEach((m, mi) => {
            exportCols.push({ type: 'drill', metric: col.drill!, month: m, monthIndex: mi });
          });
        }
      }

      const mainRows: ReportRow[] = [
        exportCols.map((ec) => {
          let bgHex: string;
          if (ec.type === 'drill') {
            bgHex = hslToHex(217, 40, 92);
          } else {
            const colDef = ec.col;
            bgHex = colDef.headerBg
              ? hslToHex(217, 85, colDef.headerBg.includes('90%') ? 90 : 80)
              : hslToHex(217, 40, 95);
          }
          return {
            v: ec.type === 'base' ? ec.col.label : formatMonthLabel(ec.month),
            s: { ...headerStyle, fill: { fgColor: { rgb: bgHex } } },
          };
        }),
      ];

      visibleRows.forEach((row: DisplayRow, ri: number) => {
        const rowKey = `${row.region}||${row.tier}||${row.salesRep}`;
        const baseBg =
          row.rowType === 'grandTotal'
            ? hslToHex(217, 40, 92)
            : row.rowType === 'regionTotal'
              ? hslToHex(220, 18, 93)
              : ri % 2 === 0
                ? 'FFFFFF'
                : hslToHex(220, 18, 98);

        const rowCells: ReportRow = exportCols.map((ec) => {
          if (ec.type === 'base') {
            const col = ec.col;
            const raw = row[col.key];
            const isNumber = typeof raw === 'number';

            // 预警填充色
            let warnHex: string | undefined;
            if (row.rowType === 'data') {
              if (col.key === 'paidPointFeeRatio') {
                const regionFee = regionRatios.get(row.region)?.fee;
                if (regionFee !== undefined && regionFee > 0) {
                  if (row.paidPointFeeRatio > regionFee * 1.2) {
                    warnHex = hslToHex(4, 72, 90);
                  } else if (row.paidPointFeeRatio > regionFee) {
                    warnHex = hslToHex(48, 90, 88);
                  }
                }
              } else if (col.key === 'paidPointSalesRatio') {
                const regionSales = regionRatios.get(row.region)?.sales;
                if (regionSales !== undefined && regionSales > 0) {
                  if (row.paidPointSalesRatio < regionSales * 0.8) {
                    warnHex = hslToHex(4, 72, 90);
                  } else if (row.paidPointSalesRatio < regionSales) {
                    warnHex = hslToHex(48, 90, 88);
                  }
                }
              }
            }

            // 导出数字格式：比值 → %，金额/销额 → 2 位小数；数字单元格显式标 t:'n' 使格式生效
            const numFmt =
              col.format === formatPercent
                ? '0.00%'
                : col.format === formatCurrency
                  ? '0.00'
                  : undefined;

            return {
              v: isNumber ? raw : String(raw ?? ''),
              ...(isNumber
                ? { t: 'n' as const, ...(numFmt ? { z: numFmt } : {}) }
                : {}),
              s: {
                ...baseCellStyle(),
                fill: { fgColor: { rgb: warnHex ?? baseBg } },
                font: {
                  ...baseCellStyle().font,
                  bold: row.rowType !== 'data',
                },
                alignment: {
                  horizontal: col.align === 'right' ? 'right' : 'left',
                  vertical: 'center',
                },
              },
            };
          } else {
            // 下钻月度列
            const drill = monthlyData[ec.metric];
            let ratio: number | null = null;
            let sourceArr: (number | null)[] | undefined;
            if (row.rowType === 'data') {
              sourceArr = drill?.ratioMap.get(rowKey);
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            } else if (row.rowType === 'regionTotal') {
              sourceArr = drill?.regionRatioMap.get(row.region);
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            } else if (row.rowType === 'grandTotal') {
              sourceArr = drill?.grandRatio;
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            }
            const isTop = isTop3(sourceArr, ec.monthIndex);
            const drillBg = isTop
              ? ec.metric === 'paidPointFeeRatio'
                ? hslToHex(4, 72, 90)
                : hslToHex(152, 60, 90)
              : baseBg;
            return {
              v: ratio !== null ? ratio : '',
              ...(ratio !== null ? { z: '0.00%', t: 'n' as const } : {}),
              s: {
                ...baseCellStyle(),
                fill: { fgColor: { rgb: drillBg } },
                font: {
                  ...baseCellStyle().font,
                  bold: row.rowType !== 'data',
                },
                alignment: { horizontal: 'right', vertical: 'center' },
              },
            };
          }
        });
        mainRows.push(rowCells);
      });

      const mainColWidths = exportCols.map((ec) =>
        ec.type === 'base' ? ec.col.label.length + 4 : 12,
      );

      // ---------- 门店明细表 ----------
      const storeDetail = await datasetApi.getAtpPerformanceStoreDetail(
        dateFrom,
        dateTo,
        'day',
        filters,
        thresholds,
      );

      // 构建门店导出列：基础列 + 展开的下钻月度列
      type StoreExportCol =
        | { type: 'base'; col: StoreColumnDef }
        | { type: 'drill'; metric: DrillMetric; month: string; monthIndex: number };

      const storeExportCols: StoreExportCol[] = [];
      for (const col of storeColumns) {
        storeExportCols.push({ type: 'base', col });
        if (col.drill && expanded[col.drill]) {
          const drill = monthlyData[col.drill];
          const months = drill?.months ?? [];
          months.forEach((m, mi) => {
            storeExportCols.push({
              type: 'drill',
              metric: col.drill!,
              month: m,
              monthIndex: mi,
            });
          });
        }
      }

      // 若主表展开了下钻列，同步获取门店级月度明细
      const needStoreDrill = storeColumns.some((c) => c.drill && expanded[c.drill]);
      const storeMonthlyData: Record<DrillMetric, StoreMonthlyDrillData | null> = {
        paidPointFeeRatio: null,
        paidPointSalesRatio: null,
      };
      if (needStoreDrill) {
        const endMonth = String(dateTo ?? '').slice(0, 7) || formatMonthStr(new Date());
        const months = getLast6MonthsDesc(endMonth);
        const storeMonthlyResults = await Promise.all(
          months.map((m) =>
            datasetApi.getAtpPerformanceStoreDetail(
              monthToDateRange(m).from,
              monthToDateRange(m).to,
              'day',
              filters,
              thresholds,
            ),
          ),
        );
        for (const metric of ['paidPointFeeRatio', 'paidPointSalesRatio'] as DrillMetric[]) {
          if (expanded[metric]) {
            storeMonthlyData[metric] = computeStoreMonthlyData(
              metric,
              months,
              storeMonthlyResults,
            );
          }
        }
      }

      // 构建门店显示行：明细 + 人员合计 + 所别合计 + 部别合计
      const storeDisplayRows = buildStoreDisplayRows(storeDetail.rows);

      const storeRows: ReportRow[] = [
        storeExportCols.map((ec) => {
          let bgHex: string;
          if (ec.type === 'drill') {
            bgHex = hslToHex(217, 40, 92);
          } else {
            const colDef = ec.col;
            bgHex = colDef.headerBg
              ? hslToHex(217, 85, colDef.headerBg.includes('90%') ? 90 : 80)
              : hslToHex(217, 40, 95);
          }
          return {
            v: ec.type === 'base' ? ec.col.label : formatMonthLabel(ec.month),
            s: { ...headerStyle, fill: { fgColor: { rgb: bgHex } } },
          };
        }),
      ];

      storeDisplayRows.forEach((row: StoreDisplayRow, ri: number) => {
        const salesRepForKey =
          row.rowType === 'salesRepTotal' ? row.originalSalesRep ?? row.salesRep : row.salesRep;
        const storeKey = `${row.region}||${row.tier}||${salesRepForKey}||${row.customerName}||${row.customerCode}`;
        const salesRepKey = `${row.region}||${row.tier}||${salesRepForKey}`;
        const baseBg =
          row.rowType === 'grandTotal'
            ? hslToHex(217, 40, 92)
            : row.rowType === 'regionTotal'
              ? hslToHex(220, 18, 93)
              : row.rowType === 'salesRepTotal'
                ? hslToHex(220, 18, 95)
                : ri % 2 === 0
                  ? 'FFFFFF'
                  : hslToHex(220, 18, 98);

        const rowCells: ReportRow = storeExportCols.map((ec) => {
          if (ec.type === 'base') {
            const col = ec.col;
            const raw = row[col.key];
            const isNumber = typeof raw === 'number';

            // 导出数字格式：比值 → %，金额/销额 → 2 位小数；数字单元格显式标 t:'n' 使格式生效
            const numFmt =
              col.format === formatPercent
                ? '0.00%'
                : col.format === formatCurrency
                  ? '0.00'
                  : undefined;

            return {
              v: isNumber ? raw : String(raw ?? ''),
              ...(isNumber
                ? { t: 'n' as const, ...(numFmt ? { z: numFmt } : {}) }
                : {}),
              s: {
                ...baseCellStyle(),
                fill: { fgColor: { rgb: baseBg } },
                font: {
                  ...baseCellStyle().font,
                  bold: row.rowType !== 'data',
                },
                alignment: {
                  horizontal: col.align === 'right' ? 'right' : 'left',
                  vertical: 'center',
                },
              },
            };
          } else {
            // 门店级下钻月度列
            const drill = storeMonthlyData[ec.metric];
            let ratio: number | null = null;
            let sourceArr: (number | null)[] | undefined;
            if (row.rowType === 'data') {
              sourceArr = drill?.storeRatioMap.get(storeKey);
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            } else if (row.rowType === 'salesRepTotal') {
              sourceArr = drill?.salesRepRatioMap.get(salesRepKey);
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            } else if (row.rowType === 'regionTotal') {
              sourceArr = drill?.regionRatioMap.get(row.region);
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            } else if (row.rowType === 'grandTotal') {
              sourceArr = drill?.grandRatio;
              ratio = sourceArr?.[ec.monthIndex] ?? null;
            }
            const isTop = isTop3(sourceArr, ec.monthIndex);
            const drillBg = isTop
              ? ec.metric === 'paidPointFeeRatio'
                ? hslToHex(4, 72, 90)
                : hslToHex(152, 60, 90)
              : baseBg;
            return {
              v: ratio !== null ? ratio : '',
              ...(ratio !== null ? { z: '0.00%', t: 'n' as const } : {}),
              s: {
                ...baseCellStyle(),
                fill: { fgColor: { rgb: drillBg } },
                font: {
                  ...baseCellStyle().font,
                  bold: row.rowType !== 'data',
                },
                alignment: { horizontal: 'right', vertical: 'center' },
              },
            };
          }
        });
        storeRows.push(rowCells);
      });

      const storeColWidths = storeExportCols.map((ec) =>
        ec.type === 'base' ? ec.col.label.length + 4 : 12,
      );

      const fileName = `ATP绩效_${dateFrom}_${dateTo}`;
      const sheets: ReportSheetData[] = [
        { sheetName: 'ATP绩效', rows: mainRows, colWidths: mainColWidths },
        { sheetName: '付费门店明细', rows: storeRows, colWidths: storeColWidths },
      ];
      await reportApi.generateReport({
        type: 'atp',
        title: fileName,
        fileName,
        sheets,
      });
      toast.success('报表已生成，请点击右上角下载按钮查看/下载');
    } catch (err) {
      logger.error('Failed to export ATP performance:', err);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [visibleRows, exporting, dateFrom, dateTo, expanded, monthlyData, regionRatios, filters, thresholds]);

  // 测量冻结列宽度：列结构、表格尺寸或表格首次挂载（数据到达后）时重新计算 sticky left 偏移
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => {
      const headers = table.querySelectorAll('thead tr:first-child th');
      if (headers.length < FROZEN_COLS) return;
      const widths = Array.from(headers)
        .slice(0, FROZEN_COLS)
        .map((h) => h.getBoundingClientRect().width);
      // 仅当测量到有效宽度时才更新，避免隐藏容器（display:none）测量出 0 导致列重叠
      if (widths.every((w) => w > 0)) {
        setFrozenColWidths(widths);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
  }, [columns, expanded, baseRows.length > 0]);

  const isEmpty = baseRows.length === 0 && !loading && !error;

  return (
    <div className={isEmpty ? '' : 'bg-card border border-border rounded-sm overflow-hidden'}>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          加载中...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <Empty>
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
      ) : baseRows.length === 0 ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle>暂无数据集</EmptyTitle>
              <EmptyDescription>
                请先在数据管理页上传并解析数据集
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => navigate('/data-manage')}>
                前往数据管理
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-foreground">ATP绩效</h3>
              <Button
                variant="outline"
                onClick={openThresholdDialog}
                className="h-8 rounded-full px-3 text-xs font-normal gap-1.5 hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
              >
                <span className="inline-flex items-center justify-center text-base leading-none" >⚙️</span>
                自定义参数
              </Button>
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="gap-1"
            >
              <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
              {exporting ? '导出中...' : 'ATP绩效明细'}
            </Button>
          </div>

          {/* 自定义参数编辑弹窗 */}
          <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">自定义参数</DialogTitle>
                <DialogDescription className="text-xs">
                  设置费比分档与销额阈值，保存后统计与导出将按新参数重新计算。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="flex items-center gap-3">
                  <Label className="w-36 shrink-0 text-xs text-foreground">费比 ≦ X%</Label>
                  <Input
                    type="number"
                    min={0}
                    value={thresholdDraft.feeLe10}
                    onChange={(e) => updateThresholdDraft('feeLe10', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-36 shrink-0 text-xs text-foreground">费比 &gt; Y%</Label>
                  <Input
                    type="number"
                    min={0}
                    value={thresholdDraft.feeGt15}
                    onChange={(e) => updateThresholdDraft('feeGt15', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-36 shrink-0 text-xs text-foreground">销额 &lt; A 元</Label>
                  <Input
                    type="number"
                    min={0}
                    value={thresholdDraft.salesLt1000}
                    onChange={(e) => updateThresholdDraft('salesLt1000', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">元</span>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-36 shrink-0 text-xs text-foreground">销额 &lt; B 元</Label>
                  <Input
                    type="number"
                    min={0}
                    value={thresholdDraft.salesLt2000}
                    onChange={(e) => updateThresholdDraft('salesLt2000', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">元</span>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetThresholds}
                  className="mr-auto text-muted-foreground"
                >
                  恢复默认
                </Button>
                <Button variant="outline" size="sm" onClick={() => setThresholdDialogOpen(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={saveThresholds}>
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <style>{`
            @keyframes atp-header-shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-2px); }
              40% { transform: translateX(2px); }
              60% { transform: translateX(-2px); }
              80% { transform: translateX(2px); }
            }
            .atp-header-shake:hover {
              animation: atp-header-shake 0.3s ease-in-out;
            }
          `}</style>

          <div
            className="overflow-auto bg-card border border-border rounded-sm"
            style={{ maxHeight: 'calc(100vh - 320px)' }}
          >
            <table ref={tableRef} className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-accent">
                {columns.map((col, ci) => {
                    const clickable = !!col.drill;
                    const isExpanded = col.drill ? expanded[col.drill] : false;
                    const isLoading = col.drill ? drillLoading[col.drill] : false;
                    const isRegionCol = col.label === '所别';
                    const isTierCol = col.label === '阶层';
                    const isCollapseHeader = isRegionCol || isTierCol;
                    const regionDetailActive = isRegionCol && expandRegionDetail;
                    const tierActive = isTierCol && collapseMode === 'tier';
                    const collapseActive = regionDetailActive || tierActive;
                    const isFrozen = ci < FROZEN_COLS;
                    const frozenLeft = isFrozen
                      ? frozenColWidths.slice(0, ci).reduce((a, b) => a + b, 0)
                      : undefined;
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          onClick={
                            clickable
                              ? () => toggleDrill(col.drill as DrillMetric)
                              : isRegionCol
                                ? toggleRegionDetail
                                : isTierCol
                                  ? () => toggleCollapse('tier')
                                  : undefined
                          }
                          onMouseEnter={() =>
                            (clickable || isCollapseHeader) && setHoveredHeader(col.key)
                          }
                          onMouseLeave={() => setHoveredHeader(null)}
                          className={[
                            'border-b border-r border-border px-2 py-2 text-center font-medium text-foreground h-11 align-middle leading-tight sticky top-0',
                            clickable || isCollapseHeader
                              ? 'cursor-pointer select-none'
                              : '',
                            clickable ? 'hover:bg-[hsl(152,60%,90%)]' : '',
                            isCollapseHeader ? 'hover:bg-[hsl(152,60%,90%)]' : '',
                          ].join(' ')}
                          style={{
                            left: frozenLeft,
                            zIndex: isFrozen ? 30 : 20,
                            backgroundColor: collapseActive
                              ? 'hsl(152, 60%, 90%)'
                              : col.headerBg ?? FROZEN_HEADER_BG,
                          }}
                        >
                          <span
                            className="inline-flex items-center gap-0.5"
                            style={{
                              animation:
                                hoveredHeader === col.key
                                  ? 'atp-header-shake 0.3s ease-in-out'
                                  : undefined,
                            }}
                          >
                            <span className="text-center">{renderWrappedLabel(col.label, headerWraps)}</span>
                            {clickable &&
                              (isLoading ? (
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground animate-spin" >⏳</span>
                              ) : isExpanded ? (
                                <span className="inline-flex items-center justify-center text-base leading-none text-primary rotate-90" >▶</span>
                              ) : (
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >▶</span>
                              ))}
                            {isCollapseHeader && (
                              collapseActive ? (
                                <span className="inline-flex items-center justify-center text-base leading-none text-primary rotate-90" >▶</span>
                              ) : (
                                <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >▶</span>
                              )
                            )}
                          </span>
                        </th>
                        {col.drill && isExpanded && (
                          (monthlyData[col.drill]?.months ?? getLast6MonthsDesc(String(dateTo ?? '').slice(0, 7) || formatMonthStr(new Date())))).map((m) => (
                            <th
                              key={`${col.drill}-${m}`}
                              className="border-b border-r border-border px-2 py-2 text-center font-medium text-foreground whitespace-nowrap bg-accent sticky top-0"
                              style={{ zIndex: 20 }}
                            >
                              {formatMonthLabel(m)}
                            </th>
                          )
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row: DisplayRow, ri: number) => {
                  const isTotal = row.rowType !== 'data';
                  const bgColor =
                    row.rowType === 'grandTotal'
                      ? 'hsl(217, 40%, 92%)'
                      : row.rowType === 'regionTotal'
                        ? 'hsl(220, 18%, 93%)'
                        : ri % 2 === 0
                          ? 'hsl(0, 0%, 100%)'
                          : 'hsl(220, 18%, 98%)';
                  const rowKey = `${row.region}||${row.tier}||${row.salesRep}`;
                  return (
                    <tr
                      key={`${row.rowType}-${row.region}-${row.tier}-${row.salesRep}-${ri}`}
                      className={[
                        'hover:bg-accent/20 transition-colors duration-150 ease-out',
                        isTotal ? 'font-semibold' : '',
                      ].join(' ')}
                      style={{ backgroundColor: bgColor }}
                    >
                      {columns.map((col, ci) => {
                        const raw = row[col.key];
                        const text =
                          typeof raw === 'number' && col.format
                            ? col.format(raw)
                            : String(raw ?? '');
                        const isNumber = typeof raw === 'number';
                        const isFrozen = ci < FROZEN_COLS;
                        const frozenLeft = isFrozen
                          ? frozenColWidths.slice(0, ci).reduce((a, b) => a + b, 0)
                          : undefined;

                        let mainBg: string | undefined;
                        if (row.rowType === 'data') {
                          if (col.key === 'paidPointFeeRatio') {
                            const regionFee = regionRatios.get(row.region)?.fee;
                            if (regionFee !== undefined && regionFee > 0) {
                              if (row.paidPointFeeRatio > regionFee * 1.2) {
                                mainBg = RED_WARN_FILL;
                              } else if (row.paidPointFeeRatio > regionFee) {
                                mainBg = YELLOW_WARN_FILL;
                              }
                            }
                          } else if (col.key === 'paidPointSalesRatio') {
                            const regionSales = regionRatios.get(row.region)?.sales;
                            if (regionSales !== undefined && regionSales > 0) {
                              if (row.paidPointSalesRatio < regionSales * 0.8) {
                                mainBg = RED_WARN_FILL;
                              } else if (row.paidPointSalesRatio < regionSales) {
                                mainBg = YELLOW_WARN_FILL;
                              }
                            }
                          }
                        }

                        return (
                          <React.Fragment key={col.key}>
                            <td
                              className={`border-b border-r border-border px-2 py-1 text-foreground whitespace-nowrap ${isNumber ? 'font-mono tabular-nums' : ''} ${isFrozen ? 'sticky' : ''}`}
                              style={{
                                left: frozenLeft,
                                zIndex: isFrozen ? 25 : undefined,
                                textAlign: col.align ?? 'left',
                                backgroundColor: mainBg ?? (isFrozen ? bgColor : undefined),
                              }}
                            >
                              {text}
                            </td>
                            {col.drill && expanded[col.drill] && (
                              (monthlyData[col.drill]?.months ?? []).map((m, mi) => {
                                const drill = monthlyData[col.drill!];
                                let ratio: number | null = null;
                                let sourceArr: (number | null)[] | undefined;
                                if (row.rowType === 'data') {
                                  sourceArr = drill?.ratioMap.get(rowKey);
                                  ratio = sourceArr?.[mi] ?? null;
                                } else if (row.rowType === 'regionTotal') {
                                  sourceArr = drill?.regionRatioMap.get(row.region);
                                  ratio = sourceArr?.[mi] ?? null;
                                } else if (row.rowType === 'grandTotal') {
                                  sourceArr = drill?.grandRatio;
                                  ratio = sourceArr?.[mi] ?? null;
                                }
                                const isTop = isTop3(sourceArr, mi);
                                const drillBg = isTop
                                  ? col.drill === 'paidPointFeeRatio'
                                    ? RED_TOP_FILL
                                    : GREEN_TOP_FILL
                                  : undefined;
                                return (
                                  <td
                                    key={`${col.drill}-${m}`}
                                    className="border-b border-r border-border px-2 py-1 text-right font-mono tabular-nums text-foreground whitespace-nowrap"
                                    style={{
                                      backgroundColor: drillBg,
                                    }}
                                  >
                                    {ratio !== null ? formatPercent(ratio) : '-'}
                                  </td>
                                );
                              })
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AtpPerformance;
