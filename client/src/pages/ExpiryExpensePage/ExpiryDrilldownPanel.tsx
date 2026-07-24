import React, { useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import * as expenseApi from '@/api/expense';
import type {
  ExpiryAnalysisFilters,
  ExpiryDrilldownResult,
  ExpiryDrilldownStoreOver500Row,
  ExpiryDrilldownSpecShareRow,
  ExpiryDrilldownOfficeSpecShareRow,
  ExpiryOver500StoreDetail,
} from '@shared/api.interface';

type DrilldownType = 'store' | 'spec';

interface ExpiryDrilldownPanelProps {
  type: DrilldownType | null;
  data: ExpiryDrilldownResult | null;
  loading: boolean;
  onClose: () => void;
  filters?: ExpiryAnalysisFilters;
}

const formatCurrency = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClose: () => void;
  extra?: React.ReactNode;
}> = ({ icon, title, onClose, extra }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
      {icon}
      {title}
    </div>
    <div className="flex items-center gap-1">
      {extra}
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
        aria-label="关闭"
      >
        <span className="size-4 flex items-center justify-center">×</span>
      </button>
    </div>
  </div>
);

const redGradient = (intensity: number, alphaMax = 0.55): React.CSSProperties => {
  const clamped = Math.max(0, Math.min(1, intensity));
  return {
    backgroundColor: `hsl(4 72% 52% / ${clamped * alphaMax})`,
  };
};

const StoreDownloadButton: React.FC<{ filters?: ExpiryAnalysisFilters }> = ({ filters }) => {
  const [downloading, setDownloading] = useState(false);
  const threshold = filters?.amountThreshold ?? 500;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const details = await expenseApi.getExpiryOver500StoreDetails(filters);
      await downloadStoreDetailsXlsx(details, threshold);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 px-2 text-xs gap-1"
      onClick={handleDownload}
      disabled={downloading}
    >
      <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
      {downloading ? '导出中' : '门店明细'}
    </Button>
  );
};

const downloadStoreDetailsXlsx = async (
  details: ExpiryOver500StoreDetail[],
  threshold = 500,
) => {
  const XLSX = await import('xlsx-js-style').then((m) => m.default || m);
  const headers = [
    '门店编码',
    '门店名称',
    '所别',
    '阶层',
    '客户形态',
    '业代',
    '月份',
    '临期金额',
    '主规格',
    '金额',
    '占比',
    '次规格',
    '金额',
    '占比',
    '第三规格',
    '金额',
    '占比',
  ];
  const rows = details.map((d) => {
    const first = d.topSpecifications[0];
    const second = d.topSpecifications[1];
    const third = d.topSpecifications[2];
    return [
      d.customerCode,
      d.customerName ?? '',
      d.region,
      d.tier,
      d.dealerType,
      d.business,
      d.month,
      Number(d.amount.toFixed(2)),
      first?.specification ?? '',
      first ? Number(first.amount.toFixed(2)) : '',
      first ? `${(first.share * 100).toFixed(1)}%` : '',
      second?.specification ?? '',
      second ? Number(second.amount.toFixed(2)) : '',
      second ? `${(second.share * 100).toFixed(1)}%` : '',
      third?.specification ?? '',
      third ? Number(third.amount.toFixed(2)) : '',
      third ? `${(third.share * 100).toFixed(1)}%` : '',
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const baseHeaderStyle = {
    font: { bold: true, color: { rgb: '1F2937' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: 'B4C7E7' } },
    },
  };
  const firstSpecHeader = { ...baseHeaderStyle, fill: { fgColor: { rgb: 'F8CBAD' }, patternType: 'solid' } };
  const secondSpecHeader = { ...baseHeaderStyle, fill: { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' } };
  const thirdSpecHeader = { ...baseHeaderStyle, fill: { fgColor: { rgb: 'FCE4D6' }, patternType: 'solid' } };
  const defaultHeader = { ...baseHeaderStyle, fill: { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' } };

  const headerColors = [
    defaultHeader, defaultHeader, defaultHeader, defaultHeader, defaultHeader,
    defaultHeader, defaultHeader, defaultHeader,
    firstSpecHeader, firstSpecHeader, firstSpecHeader,
    secondSpecHeader, secondSpecHeader, secondSpecHeader,
    thirdSpecHeader, thirdSpecHeader, thirdSpecHeader,
  ];

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:Q1');
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) {
      ws[cellRef].s = headerColors[col] ?? defaultHeader;
    }
  }

  const highShareStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'FF0000' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  for (let row = 1; row <= range.e.r; row++) {
    const shareCellRef = XLSX.utils.encode_cell({ r: row, c: 10 });
    const shareCell = ws[shareCellRef];
    if (shareCell && typeof shareCell.v === 'string') {
      const shareValue = parseFloat(shareCell.v.replace('%', ''));
      if (!Number.isNaN(shareValue) && shareValue >= 80) {
        shareCell.s = highShareStyle;
      }
    }
  }

  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
    { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '门店明细');
  XLSX.writeFile(wb, `临期≥${threshold}元门店明细_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const StoreOver500Table: React.FC<{
  months: string[];
  rows: ExpiryDrilldownStoreOver500Row[];
}> = ({ months, rows }) => {
  const rowsWithMax = rows.map((row) => ({
    row,
    maxCount: Math.max(0, ...months.map((m) => row.monthlyCounts[m] ?? 0)),
  }));

  const top2Keys = new Set(
    [...rowsWithMax]
      .sort((a, b) => b.maxCount - a.maxCount)
      .slice(0, 2)
      .map(({ row }) => `${row.region}|${row.tier}|${row.business}`),
  );

  return (
    <div className="overflow-x-auto border border-border rounded-sm">
      <table className="w-full text-xs">
        <thead className="bg-accent/50 sticky top-0 z-10">
          <tr>
            <th className="text-left font-medium text-foreground px-2 py-1.5 border-b border-border sticky left-0 bg-accent/50 min-w-[100px]">所别</th>
            <th className="text-left font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[60px]">阶层</th>
            <th className="text-left font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[120px]">业代</th>
            {months.map((m) => (
              <th key={m} className="text-center font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[60px]">{m}</th>
            ))}
            <th className="text-center font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[60px]">合计</th>
          </tr>
        </thead>
        <tbody>
          {rowsWithMax.map(({ row, maxCount }, idx) => {
            const rowKey = `${row.region}|${row.tier}|${row.business}`;
            const isTop2 = top2Keys.has(rowKey);
            return (
              <tr key={rowKey} className="hover:bg-accent/30 transition-colors duration-150 ease-out">
                <td className="px-2 py-1.5 border-b border-border sticky left-0 bg-card truncate max-w-[120px]" title={row.region}>{row.region}</td>
                <td className="px-2 py-1.5 border-b border-border truncate" title={row.tier}>{row.tier}</td>
                <td className="px-2 py-1.5 border-b border-border truncate" title={row.business}>{row.business}</td>
                {months.map((m) => {
                  const count = row.monthlyCounts[m] ?? 0;
                  const intensity = maxCount > 0 && isTop2 ? count / maxCount : 0;
                  return (
                    <td
                      key={m}
                      className="px-2 py-1.5 border-b border-border text-center font-mono tabular-nums"
                      style={isTop2 ? redGradient(intensity) : undefined}
                    >
                      {count}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 border-b border-border text-center font-mono tabular-nums font-medium">{row.totalCount}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4 + months.length} className="px-2 py-4 text-center text-muted-foreground">
                无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const SpecShareTable: React.FC<{
  months: string[];
  rows: ExpiryDrilldownSpecShareRow[];
}> = ({ months, rows }) => {
  const top5Rows = rows.filter((r) => r.isTop5);
  const maxTop5Share = Math.max(
    0.0001,
    ...top5Rows.flatMap((row) => months.map((m) => row.monthlyShares[m] ?? 0)),
  );

  return (
    <div className="overflow-x-auto border border-border rounded-sm">
      <table className="w-full text-xs">
        <thead className="bg-accent/50 sticky top-0 z-10">
          <tr>
            <th className="text-left font-medium text-foreground px-2 py-1.5 border-b border-border sticky left-0 bg-accent/50 min-w-[100px]">规格</th>
            {months.map((m) => (
              <th key={m} className="text-center font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[100px]">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.specification} className={`transition-colors duration-150 ease-out ${row.isTop5 ? '' : 'hover:bg-accent/30'}`}>
              <td
                className={`px-2 py-1.5 border-b border-border sticky left-0 ${row.isTop5 ? 'bg-error/5' : 'bg-card'} truncate max-w-[140px] text-left ${row.isTop5 ? 'text-error font-medium' : 'text-foreground'}`}
                title={row.specification}
              >
                {row.isTop5 && <span className="inline-block size-1.5 rounded-full bg-error mr-1 align-middle" />}
                {row.specification}
              </td>
              {months.map((m) => {
                const share = row.monthlyShares[m] ?? 0;
                const amount = row.monthlyAmounts[m] ?? 0;
                return (
                  <td
                    key={m}
                    className="px-2 py-1.5 border-b border-border text-center"
                    style={row.isTop5 ? redGradient(share / maxTop5Share) : undefined}
                  >
                    <div className={`font-mono tabular-nums ${row.isTop5 ? 'text-error' : 'text-foreground'}`}>{(share * 100).toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground font-mono tabular-nums">{formatCurrency(amount)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={1 + months.length} className="px-2 py-4 text-center text-muted-foreground">
                无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const OfficeSpecShareTable: React.FC<{
  months: string[];
  rows: ExpiryDrilldownOfficeSpecShareRow[];
}> = ({ months, rows }) => {
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, ExpiryDrilldownOfficeSpecShareRow>>();
    for (const row of rows) {
      if (!map.has(row.specification)) {
        map.set(row.specification, new Map());
      }
      map.get(row.specification)!.set(row.region, row);
    }
    return map;
  }, [rows]);

  const specs = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of rows) {
      if (!seen.has(row.specification)) {
        seen.add(row.specification);
        result.push(row.specification);
      }
    }
    return result;
  }, [rows]);

  const regions = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of rows) {
      if (!seen.has(row.region)) {
        seen.add(row.region);
        result.push(row.region);
      }
    }
    return result.sort();
  }, [rows]);

  const consecutiveTop1Specs = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.isConsecutiveTop1) {
        set.add(row.specification);
      }
    }
    return set;
  }, [rows]);

  return (
    <div className="overflow-x-auto border border-border rounded-sm">
      <table className="w-full text-xs">
        <thead className="bg-accent/50 sticky top-0 z-10">
          <tr>
            <th
              rowSpan={2}
              className="text-left font-medium text-foreground px-2 py-1.5 border-b border-border sticky left-0 bg-accent/50 min-w-[100px]"
            >
              规格
            </th>
            {regions.map((region) => (
              <th
                key={region}
                colSpan={months.length}
                className="text-center font-medium text-foreground px-2 py-1.5 border-b border-border min-w-[80px] border-l border-border"
                title={region}
              >
                {region}
              </th>
            ))}
          </tr>
          <tr>
            {regions.map((region) =>
              months.map((m) => (
                <th
                  key={`${region}-${m}`}
                  className="text-center font-medium text-muted-foreground px-2 py-1.5 border-b border-border min-w-[80px] border-l border-border text-[10px]"
                >
                  {m}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {specs.map((spec) => {
            const isConsecutive = consecutiveTop1Specs.has(spec);
            const specRows = lookup.get(spec);
            return (
              <tr key={spec} className={`transition-colors duration-150 ease-out ${isConsecutive ? 'bg-error/5' : 'hover:bg-accent/30'}`}>
                <td
                  className={`px-2 py-1.5 border-b border-border sticky left-0 ${isConsecutive ? 'bg-error/5' : 'bg-card'} truncate max-w-[140px] ${isConsecutive ? 'text-error font-medium' : 'text-foreground'}`}
                  title={spec}
                >
                  {isConsecutive && <span className="inline-block size-1.5 rounded-full bg-error mr-1 align-middle" />}
                  {spec}
                </td>
                {regions.map((region) =>
                  months.map((m) => {
                    const row = specRows?.get(region);
                    const cell = row?.monthlyData[m];
                    const hasData = cell && cell.rank > 0 && cell.share > 0;
                    return (
                      <td key={`${region}-${m}`} className="px-2 py-1.5 border-b border-border text-center border-l border-border">
                        {hasData ? (
                          <>
                            <div className={`font-mono tabular-nums ${cell.rank === 1 ? 'text-error font-medium' : 'text-foreground'}`}>
                              {(cell.share * 100).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                              {formatCurrency(cell.amount)} · #{cell.rank}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
          {specs.length === 0 && (
            <tr>
              <td colSpan={1 + regions.length * months.length} className="px-2 py-4 text-center text-muted-foreground">
                无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const ExpiryDrilldownPanel: React.FC<ExpiryDrilldownPanelProps> = ({ type, data, loading, onClose, filters }) => {
  if (!type) return null;

  const months = data?.months ?? [];
  const threshold = filters?.amountThreshold ?? 500;

  return (
    <div className="bg-card border border-border rounded-sm p-4 mt-3">
      {loading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[180px] w-full" />
        </div>
      ) : type === 'store' ? (
        <div className="space-y-5">
          <div>
            <SectionHeader
              icon={<span className="inline-flex items-center justify-center text-base leading-none text-primary" >🏬</span>}
              title={`各所各月临期≥${threshold}元门店数`}
              onClose={onClose}
              extra={<StoreDownloadButton filters={filters} />}
            />
            <StoreOver500Table months={months} rows={data.storeOver500Monthly} />
          </div>
          <div>
            <SectionHeader icon={<span className="inline-flex items-center justify-center text-base leading-none text-primary" >📦</span>} title={`≥${threshold}元门店规格金额占比`} onClose={onClose} />
            <SpecShareTable months={months} rows={data.over500StoreSpecShare} />
          </div>
        </div>
      ) : (
        <div>
          <SectionHeader icon={<span className="inline-flex items-center justify-center text-base leading-none text-primary" >📦</span>} title="所别规格金额占比（TOP5）" onClose={onClose} />
          <OfficeSpecShareTable months={months} rows={data.officeMonthlySpecShare} />
        </div>
      )}
    </div>
  );
};

export default ExpiryDrilldownPanel;
