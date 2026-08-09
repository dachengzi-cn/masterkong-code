import React, { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as expenseApi from '@/api/expense';
import { reportApi } from '@/api/index';
import type {
  ExpiryAnalysisFilters,
  ExpiryRankingExportResult,
  ExpiryRankingExportSheet,
  ExpiryRankingItem,
  ReportSheetData,
  ReportRow,
  ReportCell,
  ReportCellStyle,
} from '@shared/api.interface';

type DimensionKey = 'region' | 'tier' | 'dealerType' | 'business' | 'specification';

interface TabConfig {
  key: DimensionKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: 'region', label: '所别' },
  { key: 'tier', label: '阶层' },
  { key: 'dealerType', label: '形态' },
  { key: 'business', label: '业务' },
  { key: 'specification', label: '规格' },
];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  region: '所别',
  tier: '阶层',
  dealerType: '形态',
  business: '业务',
  specification: '规格',
};

interface ExpiryRankingTableProps {
  data: Record<DimensionKey, ExpiryRankingItem[]>;
  loading: boolean;
  filters?: ExpiryAnalysisFilters;
  exportDisabled?: boolean;
}

const formatCurrency = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
};

const buildSheetAoa = (sheet: ExpiryRankingExportSheet): unknown[][] => {
  const { rowHeader, offices, rows } = sheet;
  const headerRow1: unknown[] = [rowHeader, '合计', '', ''];
  const headerRow2: unknown[] = ['', '金额', '占比', '记录数'];

  for (const office of offices) {
    headerRow1.push(office, '', '');
    headerRow2.push('金额', '占比', '记录数');
  }

  const dataRows: unknown[][] = rows.map((row) => {
    const dataRow: unknown[] = [
      row.dimensionValue,
      row.total.amount,
      row.total.share,
      row.total.recordCount,
    ];
    for (const office of offices) {
      const cell = row.offices[office] ?? { amount: 0, share: 0, recordCount: 0 };
      dataRow.push(cell.amount, cell.share, cell.recordCount);
    }
    return dataRow;
  });

  return [headerRow1, headerRow2, ...dataRows];
};

const buildBusinessSheetAoa = (
  sheet: ExpiryRankingExportSheet,
): { aoa: unknown[][]; officeRowCounts: number[] } => {
  const { offices, rows } = sheet;

  const grandTotalAmount = rows.reduce((sum, row) => sum + row.total.amount, 0) || 1;
  const grandTotalRecordCount = rows.reduce((sum, row) => sum + row.total.recordCount, 0);

  const headerRow: unknown[] = ['所别', '业务', '金额', '占比', '记录数'];
  const dataRows: unknown[][] = [];
  const officeRowCounts: number[] = [];

  for (const office of offices) {
    const officeTotalAmount = rows.reduce(
      (sum, row) => sum + (row.offices[office]?.amount ?? 0),
      0,
    );
    const officeTotalRecordCount = rows.reduce(
      (sum, row) => sum + (row.offices[office]?.recordCount ?? 0),
      0,
    );

    const officeRows: unknown[][] = [];
    for (const row of rows) {
      const cell = row.offices[office] ?? { amount: 0, share: 0, recordCount: 0 };
      if ((cell.amount ?? 0) === 0 && (cell.recordCount ?? 0) === 0) continue;
      const share = officeTotalAmount > 0 ? cell.amount / officeTotalAmount : 0;
      officeRows.push([office, row.dimensionValue, cell.amount, share, cell.recordCount]);
    }

    officeRows.push([
      office,
      '小记',
      officeTotalAmount,
      officeTotalAmount / grandTotalAmount,
      officeTotalRecordCount,
    ]);

    dataRows.push(...officeRows);
    officeRowCounts.push(officeRows.length);
  }

  dataRows.push(['合计', '', grandTotalAmount, 1, grandTotalRecordCount]);

  return { aoa: [headerRow, ...dataRows], officeRowCounts };
};

const buildSheetMerges = (officeCount: number): { s: { r: number; c: number }; e: { r: number; c: number } }[] => {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
  ];

  for (let i = 0; i < officeCount; i++) {
    const startCol = 4 + i * 3;
    merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 2 } });
  }

  return merges;
};

const buildBusinessSheetMerges = (
  officeRowCounts: number[],
): { s: { r: number; c: number }; e: { r: number; c: number } }[] => {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let currentRow = 1;

  for (const officeRowCount of officeRowCounts) {
    merges.push({
      s: { r: currentRow, c: 0 },
      e: { r: currentRow + officeRowCount - 1, c: 0 },
    });
    currentRow += officeRowCount;
  }

  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });

  return merges;
};

const centerStyle: ReportCellStyle = {
  alignment: { horizontal: 'center', vertical: 'center' },
};

const fullBorder: ReportCellStyle['border'] = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

const lightYellowFill: ReportCellStyle['fill'] = { fgColor: { rgb: 'FFFFCC' }, patternType: 'solid' };

const downloadRankingExport = async (result: ExpiryRankingExportResult): Promise<void> => {
  const sheetList: { name: string; sheet: ExpiryRankingExportSheet }[] = [
    { name: '所别', sheet: result.region },
    { name: '阶层', sheet: result.tier },
    { name: '形态', sheet: result.dealerType },
    { name: '业务', sheet: result.business },
    { name: '规格', sheet: result.specification },
  ];

  const headerStyle: ReportCellStyle = {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'C6E0B4' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: fullBorder,
  };

  const reportSheets: ReportSheetData[] = [];

  for (const { name, sheet } of sheetList) {
    const isBusiness = name === '业务';
    const { aoa, officeRowCounts } = isBusiness
      ? buildBusinessSheetAoa(sheet)
      : { aoa: buildSheetAoa(sheet), officeRowCounts: [] };

    const merges = isBusiness
      ? buildBusinessSheetMerges(officeRowCounts)
      : buildSheetMerges(sheet.offices.length);

    const shareColIndices = isBusiness ? [3] : [2, ...sheet.offices.map((_, i) => 5 + i * 3)];
    const headerRowCount = isBusiness ? 1 : 2;
    const dataStartRow = isBusiness ? 1 : 2;

    // 标记业务 sheet 的所别小记行
    const subtotalRows = new Set<number>();
    if (isBusiness) {
      let row = 1;
      for (const count of officeRowCounts) {
        subtotalRows.add(row + count - 1);
        row += count;
      }
    }

    const rows: ReportRow[] = aoa.map((rowData, r) =>
      rowData.map((v, c) => {
        const s: ReportCellStyle = { border: fullBorder };
        if (r < headerRowCount) {
          Object.assign(s, headerStyle);
        }
        const cell: ReportCell = { v: v as ReportCell['v'], s };
        if (r >= dataStartRow && shareColIndices.includes(c)) {
          cell.z = '0.0%';
        }
        if (isBusiness) {
          if (subtotalRows.has(r)) s.fill = lightYellowFill;
          if (r >= 1 && c === 0) s.alignment = centerStyle.alignment;
        }
        return cell;
      }),
    );

    const colCount = isBusiness ? 5 : 4 + sheet.offices.length * 3;
    const colWidths = isBusiness
      ? [18, 18, 14, 10, 10]
      : Array.from({ length: colCount }, (_, i) => {
          if (i === 0) return 18;
          if ((i - 1) % 3 === 0) return 14;
          return 10;
        });

    reportSheets.push({
      sheetName: name,
      rows,
      merges,
      colWidths,
      showGridLines: false,
    });
  }

  const fileName = `临期费用排行明细_${new Date().toISOString().slice(0, 10)}`;
  await reportApi.generateReport({
    type: 'expiry-ranking',
    title: fileName,
    fileName,
    sheets: reportSheets,
  });
};

const ExpiryRankingTable: React.FC<ExpiryRankingTableProps> = ({
  data,
  loading,
  filters,
  exportDisabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<DimensionKey>('region');
  const [exporting, setExporting] = useState(false);
  const rows = data[activeTab] ?? [];

  const handleExport = async () => {
    if (exporting || exportDisabled) return;
    setExporting(true);
    try {
      const result = await expenseApi.getExpiryRankingExport(filters);
      await downloadRankingExport(result);
      toast.success('排行明细导出成功');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to export expiry ranking:', err);
      toast.error(`导出失败：${msg}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold text-foreground">临期费用排行</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={handleExport}
            disabled={exporting || exportDisabled}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
            {exporting ? '导出中' : '临期费用明细'}
          </Button>
          <div className="flex items-center gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : rows.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无排行数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的临期费用排行数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent/30">
                <th className="px-2 py-2 text-left font-medium">{DIMENSION_LABELS[activeTab]}</th>
                <th className="px-2 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-0.5">
                    金额 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </span>
                </th>
                <th className="px-2 py-2 text-right font-medium">占比</th>
                <th className="px-2 py-2 text-right font-medium">记录数</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, index) => (
                <tr
                  key={`${row.value}-${index}`}
                  className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                >
                  <td className="px-2 py-2 text-foreground truncate max-w-[200px]" title={row.value}>
                    {row.value}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    ¥{row.amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {(row.share * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.recordCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpiryRankingTable;
