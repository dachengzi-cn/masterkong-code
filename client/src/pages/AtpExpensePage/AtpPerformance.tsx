import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import { datasetApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  AtpPerformanceResponse,
  AtpPerformanceRow,
  AtpPerformanceStoreRow,
  AtpPerformanceStoreDetailResponse,
  HeatmapFilterParams,
} from '@shared/api.interface';

interface CellStyle {
  font?: { sz: number; color: { rgb: string }; bold?: boolean };
  alignment?: { vertical: string; horizontal?: string };
  border?: Record<string, { style: string; color: { rgb: string } }>;
  fill?: { fgColor: { rgb: string } };
}
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

const COLUMNS: ColumnDef[] = [
  { key: 'region', label: '所别', align: 'left' },
  { key: 'tier', label: '阶层', align: 'left' },
  { key: 'salesRep', label: '业代', align: 'left' },
  { key: 'totalPoints', label: '总点数', align: 'right', format: formatInt },
  { key: 'paidPoints', label: '付费点数', align: 'right', format: formatInt },
  { key: 'paidAmount', label: '付费金额', align: 'right', format: formatCurrency },
  { key: 'totalStoreSales', label: '总门店销额', align: 'right', format: formatCurrency },
  { key: 'paidPointFeeRatio', label: '投入费比', align: 'right', format: formatPercent, drill: 'paidPointFeeRatio' },
  { key: 'feeRatioLe10', label: '费比≦10%', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'feeRatio10to15', label: '10%<费比≦15%', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'feeRatioGt15', label: '费比>15%', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'feeRatioNoDeal', label: '未成交', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'feeRatioLe10Ratio', label: '费比≦10%点数占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  { key: 'feeRatio10to15Ratio', label: '10%<费比≦15%点数占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  { key: 'feeRatioGt15Ratio', label: '费比>15%点数占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  { key: 'feeRatioNoDealRatio', label: '未成交点数占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  { key: 'paidPointSalesRatio', label: '付费点销额占比', align: 'right', format: formatPercent, drill: 'paidPointSalesRatio' },
  { key: 'salesLt1000Count', label: '销额<1000元点数', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'salesLt1000Ratio', label: '销额<1000元占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
  { key: 'salesLt2000Count', label: '销额<2000元点数', align: 'right', format: formatInt, headerBg: 'hsl(217, 85%, 90%)' },
  { key: 'salesLt2000Ratio', label: '销额<2000元占比', align: 'right', format: formatPercent, headerBg: 'hsl(217, 85%, 80%)' },
];

interface StoreColumnDef {
  key: keyof AtpPerformanceStoreRow;
  label: string;
  align?: 'left' | 'right';
  format?: (v: number) => string;
  drill?: DrillMetric;
  headerBg?: string;
}

const STORE_COLUMNS: StoreColumnDef[] = [
  { key: 'region', label: '所别', align: 'left' },
  { key: 'tier', label: '阶层', align: 'left' },
  { key: 'salesRep', label: '业代', align: 'left' },
  { key: 'customerName', label: '门店名', align: 'left' },
  { key: 'customerCode', label: '门店编码', align: 'left' },
  ...(COLUMNS.slice(3).map((c) => ({
    key: c.key as keyof AtpPerformanceStoreRow,
    label: c.label,
    align: c.align,
    format: c.format,
    drill: c.drill,
    headerBg: c.headerBg,
  })) as StoreColumnDef[]),
];

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

function baseCellStyle(): CellStyle {
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

const countMonths = (startYm: string, endYm: string): number => {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return 1;
  return (ey - sy) * 12 + (em - sm) + 1;
};

const aggregateRows = (
  items: AtpPerformanceRow[],
  monthCount: number,
): AtpPerformanceRow => {
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
    paidPointFeeRatio: paidStoreSales > 0 ? (paidAmount * monthCount) / paidStoreSales : 0,
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

const HEADER_WRAPS: Record<string, string[]> = {
  '投入费比': ['投入费比'],
  '付费点销额占比': ['付费点销额', '占比'],
  '总门店销额': ['总门店', '销额'],
  '付费金额': ['付费', '金额'],
  '付费点数': ['付费', '点数'],
  '总点数': ['总', '点数'],
  '费比≦10%': ['费比', '≦10%'],
  '10%<费比≦15%': ['10%<费比', '≦15%'],
  '费比>15%': ['费比', '>15%'],
  '未成交': ['未', '成交'],
  '费比≦10%点数占比': ['费比≦10%', '点数占比'],
  '10%<费比≦15%点数占比': ['10%<费比≦15%', '点数占比'],
  '费比>15%点数占比': ['费比>15%', '点数占比'],
  '未成交点数占比': ['未成交', '点数占比'],
  '销额<1000元点数': ['销额<1000', '元点数'],
  '销额<1000元占比': ['销额<1000', '元占比'],
  '销额<2000元点数': ['销额<2000', '元点数'],
  '销额<2000元占比': ['销额<2000', '元占比'],
};

const renderWrappedLabel = (label: string): React.ReactNode => {
  const lines = HEADER_WRAPS[label] ?? [label];
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
  monthCount: number,
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
        const salesRepTotal = aggregateRows(salesRepRows, monthCount);
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
    const regionTotal = aggregateRows(regionRows, monthCount);
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
  const grandTotal = aggregateRows(rows, monthCount);
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
  const [totalExpand, setTotalExpand] = useState(false);

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
  }, [dateFrom, dateTo, filters, onLoadingChange]);

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
    const monthCount = countMonths(
      String(dateFrom ?? '').slice(0, 7),
      String(dateTo ?? '').slice(0, 7),
    );
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
      const sub = aggregateRows(regionRows, monthCount);
      result.push({
        ...sub,
        region,
        tier: '合计',
        salesRep: '',
        rowType: 'regionTotal',
      });
    }
    const grand = aggregateRows(baseRows, monthCount);
    result.push({
      ...grand,
      region: '整体合计',
      tier: '',
      salesRep: '',
      rowType: 'grandTotal',
    });
    return result;
  }, [baseRows, dateFrom, dateTo]);

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
    if (!totalExpand) {
      return displayRows.filter((r) => r.rowType !== 'data');
    }
    if (collapseMode === 'none') return displayRows;
    if (collapseMode === 'region') {
      return displayRows.filter((r) => r.rowType !== 'data');
    }
    return displayRows.filter(
      (r) => r.rowType !== 'data' || r.tier === '一阶' || r.tier === '二阶',
    );
  }, [displayRows, collapseMode, totalExpand]);

  const toggleCollapse = useCallback((mode: 'region' | 'tier') => {
    setCollapseMode((prev) => (prev === mode ? 'none' : mode));
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
  }, [dateTo, filters]);

  const toggleDrill = useCallback((metric: DrillMetric) => {
    setExpanded((prev) => {
      const next = { ...prev, [metric]: !prev[metric] };
      if (next[metric] && !monthlyData[metric]) {
        loadDrill(metric);
      }
      return next;
    });
  }, [monthlyData, loadDrill]);

  const handleExport = useCallback(async () => {
    if (!visibleRows.length || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx-js-style').then((m) => m.default || m);
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

      // ---------- 主表：ATP绩效 ----------
      const mainWs = XLSX.utils.aoa_to_sheet([]);

      // 构建导出列：基础列 + 展开的下钻月度列
      type ExportCol =
        | { type: 'base'; col: ColumnDef }
        | { type: 'drill'; metric: DrillMetric; month: string; monthIndex: number };

      const exportCols: ExportCol[] = [];
      for (const col of COLUMNS) {
        exportCols.push({ type: 'base', col });
        if (col.drill && expanded[col.drill]) {
          const drill = monthlyData[col.drill];
          const months = drill?.months ?? [];
          months.forEach((m, mi) => {
            exportCols.push({ type: 'drill', metric: col.drill!, month: m, monthIndex: mi });
          });
        }
      }

      // 写入表头
      const headers = exportCols.map((ec) =>
        ec.type === 'base' ? ec.col.label : formatMonthLabel(ec.month),
      );
      XLSX.utils.sheet_add_aoa(mainWs, [headers], { origin: 'A1' });
      for (let c = 0; c < headers.length; c++) {
        const cell = mainWs[XLSX.utils.encode_cell({ r: 0, c })] as Record<
          string,
          unknown
        >;
        const ec = exportCols[c];
        let bgHex: string;
        if (ec.type === 'drill') {
          bgHex = hslToHex(217, 40, 92);
        } else {
          const colDef = ec.col;
          bgHex = colDef.headerBg
            ? hslToHex(217, 85, colDef.headerBg.includes('90%') ? 90 : 80)
            : hslToHex(217, 40, 95);
        }
        if (cell) {
          cell.s = {
            ...headerStyle,
            fill: { fgColor: { rgb: bgHex } },
          };
        }
      }

      // 写入数据行
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

        exportCols.forEach((ec, ci) => {
          const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
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

            const style: CellStyle = {
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
            };
            mainWs[ref] = {
              v: isNumber ? raw : String(raw ?? ''),
              t: isNumber ? 'n' : 's',
              ...(col.format === formatPercent ? { z: '0.00%' } : {}),
              s: style,
            } as never;
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
            const style: CellStyle = {
              ...baseCellStyle(),
              fill: { fgColor: { rgb: drillBg } },
              font: {
                ...baseCellStyle().font,
                bold: row.rowType !== 'data',
              },
              alignment: { horizontal: 'right', vertical: 'center' },
            };
            mainWs[ref] = {
              v: ratio !== null ? ratio : '',
              t: ratio !== null ? 'n' : 's',
              ...(ratio !== null ? { z: '0.00%' } : {}),
              s: style,
            } as never;
          }
        });
      });

      mainWs['!cols'] = exportCols.map((ec) =>
        ec.type === 'base'
          ? { wch: ec.col.label.length + 4 }
          : { wch: 12 },
      );
      mainWs['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: visibleRows.length, c: headers.length - 1 },
      });

      // ---------- 门店明细表 ----------
      const storeDetail = await datasetApi.getAtpPerformanceStoreDetail(
        dateFrom,
        dateTo,
        'day',
        filters,
      );

      // 构建门店导出列：基础列 + 展开的下钻月度列
      type StoreExportCol =
        | { type: 'base'; col: StoreColumnDef }
        | { type: 'drill'; metric: DrillMetric; month: string; monthIndex: number };

      const storeExportCols: StoreExportCol[] = [];
      for (const col of STORE_COLUMNS) {
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
      const needStoreDrill = STORE_COLUMNS.some((c) => c.drill && expanded[c.drill]);
      const storeMonthCount = countMonths(
        String(dateFrom ?? '').slice(0, 7),
        String(dateTo ?? '').slice(0, 7),
      );
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
      const storeDisplayRows = buildStoreDisplayRows(storeDetail.rows, storeMonthCount);

      const storeWs = XLSX.utils.aoa_to_sheet([]);
      const storeHeaders = storeExportCols.map((ec) =>
        ec.type === 'base' ? ec.col.label : formatMonthLabel(ec.month),
      );
      XLSX.utils.sheet_add_aoa(storeWs, [storeHeaders], { origin: 'A1' });
      for (let c = 0; c < storeHeaders.length; c++) {
        const cell = storeWs[XLSX.utils.encode_cell({ r: 0, c })] as Record<
          string,
          unknown
        >;
        const ec = storeExportCols[c];
        let bgHex: string;
        if (ec.type === 'drill') {
          bgHex = hslToHex(217, 40, 92);
        } else {
          const colDef = ec.col;
          bgHex = colDef.headerBg
            ? hslToHex(217, 85, colDef.headerBg.includes('90%') ? 90 : 80)
            : hslToHex(217, 40, 95);
        }
        if (cell) {
          cell.s = {
            ...headerStyle,
            fill: { fgColor: { rgb: bgHex } },
          };
        }
      }

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

        storeExportCols.forEach((ec, ci) => {
          const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
          if (ec.type === 'base') {
            const col = ec.col;
            const raw = row[col.key];
            const isNumber = typeof raw === 'number';
            const style: CellStyle = {
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
            };
            storeWs[ref] = {
              v: isNumber ? raw : String(raw ?? ''),
              t: isNumber ? 'n' : 's',
              ...(col.format === formatPercent ? { z: '0.00%' } : {}),
              s: style,
            } as never;
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
            const style: CellStyle = {
              ...baseCellStyle(),
              fill: { fgColor: { rgb: drillBg } },
              font: {
                ...baseCellStyle().font,
                bold: row.rowType !== 'data',
              },
              alignment: { horizontal: 'right', vertical: 'center' },
            };
            storeWs[ref] = {
              v: ratio !== null ? ratio : '',
              t: ratio !== null ? 'n' : 's',
              ...(ratio !== null ? { z: '0.00%' } : {}),
              s: style,
            } as never;
          }
        });
      });

      storeWs['!cols'] = storeExportCols.map((ec) =>
        ec.type === 'base' ? { wch: ec.col.label.length + 4 } : { wch: 12 },
      );
      storeWs['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: {
          r: storeDisplayRows.length,
          c: storeHeaders.length - 1,
        },
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, mainWs, 'ATP绩效');
      XLSX.utils.book_append_sheet(wb, storeWs, '付费门店明细');
      XLSX.writeFile(wb, `ATP绩效_${dateFrom}_${dateTo}.xlsx`);
      toast.success(
        `已导出 ${visibleRows.length} 条ATP绩效数据及 ${storeDisplayRows.length} 条门店明细（含汇总）`,
      );
    } catch (err) {
      logger.error('Failed to export ATP performance:', err);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [visibleRows, exporting, dateFrom, dateTo, expanded, monthlyData, regionRatios, filters]);

  const isEmpty = baseRows.length === 0 && !loading && !error;

  return (
    <div className={isEmpty ? '' : 'bg-card border border-border rounded-sm'}>
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
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-foreground">ATP绩效</h3>
              <Button
                variant="outline"
                onClick={() => setTotalExpand((v) => !v)}
                className="h-8 w-[120px] rounded-full px-3 text-xs font-normal gap-1.5 hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
              >
                {totalExpand ? '缩放合计' : '展开明细'}
                {totalExpand ? (
                  <span className="inline-flex items-center justify-center text-base leading-none" >⇅</span>
                ) : (
                  <span className="inline-flex items-center justify-center text-base leading-none" >⇅</span>
                )}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="gap-1"
            >
              <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
              {exporting ? '导出中...' : '导出ATP绩效'}
            </Button>
          </div>

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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-accent/50">
                  {COLUMNS.map((col) => {
                    const clickable = !!col.drill;
                    const isExpanded = col.drill ? expanded[col.drill] : false;
                    const isLoading = col.drill ? drillLoading[col.drill] : false;
                    const isRegionCol = col.label === '所别';
                    const isTierCol = col.label === '阶层';
                    const isCollapseHeader = isRegionCol || isTierCol;
                    const collapseActive =
                      (isRegionCol && collapseMode === 'region') ||
                      (isTierCol && collapseMode === 'tier');
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          onClick={
                            clickable
                              ? () => toggleDrill(col.drill as DrillMetric)
                              : isCollapseHeader
                                ? () => toggleCollapse(isRegionCol ? 'region' : 'tier')
                                : undefined
                          }
                          onMouseEnter={() =>
                            (clickable || isCollapseHeader) && setHoveredHeader(col.key)
                          }
                          onMouseLeave={() => setHoveredHeader(null)}
                          className={[
                            'border-b border-r border-border px-2 py-2 text-left font-medium text-foreground h-11 align-middle leading-tight',
                            clickable || isCollapseHeader
                              ? 'cursor-pointer select-none'
                              : '',
                            clickable ? 'hover:bg-[hsl(152,60%,90%)]' : '',
                            isCollapseHeader ? 'hover:bg-[hsl(152,60%,90%)]' : '',
                          ].join(' ')}
                          style={{
                            backgroundColor: collapseActive
                              ? 'hsl(152, 60%, 90%)'
                              : col.headerBg ?? undefined,
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
                            <span className="text-center">{renderWrappedLabel(col.label)}</span>
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
                              className="border-b border-r border-border px-2 py-2 text-center font-medium text-foreground whitespace-nowrap bg-accent/30"
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
                      {COLUMNS.map((col) => {
                        const raw = row[col.key];
                        const text =
                          typeof raw === 'number' && col.format
                            ? col.format(raw)
                            : String(raw ?? '');
                        const isNumber = typeof raw === 'number';

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
                              className={`border-b border-r border-border px-2 py-1 text-foreground whitespace-nowrap ${isNumber ? 'font-mono tabular-nums' : ''}`}
                              style={{
                                textAlign: col.align ?? 'left',
                                backgroundColor: mainBg,
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
