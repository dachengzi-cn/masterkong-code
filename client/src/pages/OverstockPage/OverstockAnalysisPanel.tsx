import React, { useState } from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { getOverstockAnalysisExport } from '@/api/expense';
import type {
  OverstockAnalysisResult,
  OverstockAnalysisExportResult,
} from '@shared/api.interface';
import type { ExpenseOverviewFilters } from '../ExpensePage/expense-overview.types';
import { formatCurrency, formatPercent } from '../ExpensePage/expense-overview.utils';
import OverstockPurchaseDrilldown from './OverstockPurchaseDrilldown';

interface OverstockAnalysisPanelProps {
  data: OverstockAnalysisResult | null;
  loading: boolean;
  filters: ExpenseOverviewFilters;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-sm font-bold text-foreground mb-3">{children}</div>
);

const EmptyRow: React.FC = () => (
  <tr>
    <td colSpan={9} className="px-2 py-8 text-center text-xs text-muted-foreground">
      暂无数据
    </td>
  </tr>
);

const hideGridlinesAndDownload = async (XLSX: any, wb: any, filename: string): Promise<void> => {
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const fflate = await import('fflate');

  const zipData = new Uint8Array(data);
  const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    fflate.unzip(zipData, (err, result) => {
      if (err) reject(err);
      else resolve(result as Record<string, Uint8Array>);
    });
  });

  const updated: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(unzipped)) {
    if (path.startsWith('xl/worksheets/sheet') && path.endsWith('.xml')) {
      const text = new TextDecoder().decode(content);
      const newText = text.replace(/<sheetView\b([^>]*?)(\/?>)/g, (match, attrs, close) => {
        if (attrs.includes('showGridLines')) return match;
        return `<sheetView${attrs} showGridLines="0"${close}`;
      });
      updated[path] = new TextEncoder().encode(newText);
    } else {
      updated[path] = content;
    }
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    fflate.zip(updated, { level: 6 }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const downloadOverstockExport = async (result: OverstockAnalysisExportResult, filename: string): Promise<void> => {
  const XLSX = await import('xlsx-js-style').then((m) => m.default || m);
  const wb = XLSX.utils.book_new();

  const headerStyle = {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'C6E0B4' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
  };

  const centerStyle = {
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const addSheet = (name: string, rows: unknown[][], cols: { wch: number }[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let col = 0; col < (rows[0] as unknown[]).length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    }
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // 汇总
  const summaryRows = [
    ['指标', '数值'],
    ['总进货金额', result.summary.totalPurchaseAmount],
    ['总临期金额', result.summary.totalExpiryAmount],
    ['平均转化率', result.summary.avgConversionRate],
    ['标记门店数', result.summary.flaggedStoreCount],
    ['标记业代数', result.summary.flaggedRepCount],
    ['阈值（mean + 2σ）', result.summary.threshold],
  ];
  addSheet('汇总', summaryRows, [{ wch: 20 }, { wch: 16 }]);

  // 风险门店
  const storeRows = [
    ['门店编码', '门店名称', '所别', '业代', '进货金额', '进货数量', '临期金额', '转化率', '是否标记'],
    ...result.storeRisks.map((r) => [
      r.customerCode,
      r.customerName,
      r.region,
      r.salesRep,
      r.purchaseAmount,
      r.purchaseQuantity,
      r.expiryAmount,
      r.conversionRate,
      r.isFlagged ? '是' : '否',
    ]),
  ];
  addSheet(
    '风险门店',
    storeRows,
    [
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
    ],
  );

  // 风险业代
  const repRows = [
    ['业代', '所别', '负责门店数', '进货金额', '进货数量', '临期金额', '转化率', '是否标记'],
    ...result.repRisks.map((r) => [
      r.salesRep,
      r.region,
      r.storeCount,
      r.purchaseAmount,
      r.purchaseQuantity,
      r.expiryAmount,
      r.conversionRate,
      r.isFlagged ? '是' : '否',
    ]),
  ];
  addSheet('风险业代', repRows, [
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
  ]);

  // 规格风险
  const specRows = [
    ['规格', '进货金额', '进货数量', '临期金额', '转化率'],
    ...result.specRisks.map((r) => [r.specification, r.purchaseAmount, r.purchaseQuantity, r.expiryAmount, r.conversionRate]),
  ];
  addSheet('规格风险', specRows, [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]);

  // Cohort 明细
  const cohortRows = [
    [
      '门店编码',
      '门店名称',
      '规格',
      '进货月',
      '进货金额',
      '进货数量',
      '第4月临期额',
      '第5月临期额',
      '临期金额',
      '转化率',
    ],
    ...result.cohorts.map((c) => [
      c.customerCode,
      c.customerName,
      c.specification,
      c.purchaseMonth,
      c.purchaseAmount,
      c.purchaseQuantity,
      c.expiryMonth4Amount,
      c.expiryMonth5Amount,
      c.expiryAmount,
      c.conversionRate,
    ]),
  ];
  addSheet('Cohort明细', cohortRows, [
    { wch: 16 },
    { wch: 20 },
    { wch: 30 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ]);

  // 转化率列设置为百分比格式
  const percentStyle = { z: '0.00%' };
  const percentSheets: Record<string, number[]> = {
    汇总: [1],
    风险门店: [7],
    风险业代: [6],
    规格风险: [4],
    Cohort明细: [9],
  };
  wb.SheetNames.forEach((sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    const cols = percentSheets[sheetName] ?? [];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let row = 1; row <= range.e.r; row++) {
      for (const col of cols) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellRef]) {
          ws[cellRef].z = percentStyle.z;
          ws[cellRef].s = { ...(ws[cellRef].s || {}), ...centerStyle };
        }
      }
    }
  });

  await hideGridlinesAndDownload(
    XLSX,
    wb,
    filename,
  );
};

const OverstockAnalysisPanel: React.FC<OverstockAnalysisPanelProps> = ({
  data,
  loading,
  filters,
}) => {
  const [exporting, setExporting] = useState(false);
  const [showCohorts, setShowCohorts] = useState(false);
  const [showPurchaseDrilldown, setShowPurchaseDrilldown] = useState(false);

  const summary = data?.summary ?? {
    totalPurchaseAmount: 0,
    totalExpiryAmount: 0,
    avgConversionRate: 0,
    flaggedStoreCount: 0,
    flaggedRepCount: 0,
    threshold: 0,
  };

  const handleExport = async () => {
    if (exporting || loading) return;
    setExporting(true);
    try {
      const result = await getOverstockAnalysisExport(filters);
      const filename = `差异门店分析_${filters.monthFrom ?? ''}_${filters.monthTo ?? ''}.xlsx`;
      await downloadOverstockExport(result, filename);
      toast.success('差异门店分析导出成功');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to export overstock analysis:', err);
      toast.error(`导出失败：${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const hasData = !!data && data.cohorts.length > 0;

  return (
    <div className="bg-card border border-border rounded-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-foreground">差异门店分析</div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleExport}
          disabled={exporting || loading || !hasData}
        >
          <span className="inline-flex items-center justify-center text-base leading-none">⬇️</span>
          {exporting ? '导出中' : '下载差异门店分析'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="总进货金额"
          icon="🛒"
          loading={loading}
          onClick={loading ? undefined : () => setShowPurchaseDrilldown((v) => !v)}
          ariaLabel="总进货金额，点击查看进货金额下钻明细"
          subText={
            <span className="text-primary">
              {showPurchaseDrilldown ? '收起明细 ↑' : '点击下钻明细 ↓'}
            </span>
          }
          value={
            <CountUp
              end={summary.totalPurchaseAmount}
              duration={0.6}
              decimals={2}
              separator=","
              prefix="¥"
            />
          }
        />
        <KpiCard
          label="总临期金额"
          icon="⚠️"
          loading={loading}
          value={
            <CountUp
              end={summary.totalExpiryAmount}
              duration={0.6}
              decimals={2}
              separator=","
              prefix="¥"
            />
          }
        />
        <KpiCard
          label="平均转化率"
          icon="📊"
          loading={loading}
          value={formatPercent(summary.avgConversionRate)}
        />
        <KpiCard
          label="标记门店数"
          icon="🏬"
          loading={loading}
          value={
            <CountUp
              end={summary.flaggedStoreCount}
              duration={0.6}
              decimals={0}
              separator=","
            />
          }
        />
        <KpiCard
          label="标记业代数"
          icon="👤"
          loading={loading}
          value={
            <CountUp
              end={summary.flaggedRepCount}
              duration={0.6}
              decimals={0}
              separator=","
            />
          }
        />
        <KpiCard
          label="阈值（mean + 2σ）"
          icon="⏶"
          loading={loading}
          value={formatPercent(summary.threshold)}
        />
      </div>

      {!loading && showPurchaseDrilldown && (
        <OverstockPurchaseDrilldown
          data={data?.purchaseDrilldown ?? null}
          onClose={() => setShowPurchaseDrilldown(false)}
        />
      )}

      {!loading && !hasData && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          当前筛选条件下无差异门店分析数据
        </div>
      )}

      {hasData && (
        <>
          <div>
            <SectionTitle>风险门店 TOP20</SectionTitle>
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-accent/30 border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">门店编码</th>
                    <th className="px-2 py-2 text-left font-medium">门店名称</th>
                    <th className="px-2 py-2 text-left font-medium">所别</th>
                    <th className="px-2 py-2 text-left font-medium">业代</th>
                    <th className="px-2 py-2 text-right font-medium">进货金额</th>
                    <th className="px-2 py-2 text-right font-medium">进货数量</th>
                    <th className="px-2 py-2 text-right font-medium">临期金额</th>
                    <th className="px-2 py-2 text-right font-medium">转化率</th>
                    <th className="px-2 py-2 text-center font-medium">标记</th>
                  </tr>
                </thead>
                <tbody>
                  {data.storeRisks.slice(0, 20).map((row) => (
                    <tr
                      key={row.customerCode}
                      className={`border-b border-border last:border-0 transition-colors duration-150 ease-out ${
                        row.isFlagged ? 'bg-[hsl(4,72%,52%)]/5' : 'hover:bg-accent/20'
                      }`}
                    >
                      <td className="px-2 py-2 font-mono tabular-nums">{row.customerCode}</td>
                      <td className="px-2 py-2 truncate max-w-[160px]" title={row.customerName}>
                        {row.customerName}
                      </td>
                      <td className="px-2 py-2">{row.region}</td>
                      <td className="px-2 py-2">{row.salesRep}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(row.purchaseAmount)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {row.purchaseQuantity.toLocaleString('zh-CN')}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                        {formatCurrency(row.expiryAmount)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatPercent(row.conversionRate)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {row.isFlagged ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(4,72%,52%)]/10 text-[hsl(4,72%,52%)]">
                            风险
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.storeRisks.length === 0 && <EmptyRow />}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionTitle>风险业代</SectionTitle>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-accent/30 border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">业代</th>
                      <th className="px-2 py-2 text-left font-medium">所别</th>
                      <th className="px-2 py-2 text-right font-medium">门店数</th>
                      <th className="px-2 py-2 text-right font-medium">进货金额</th>
                      <th className="px-2 py-2 text-right font-medium">进货数量</th>
                      <th className="px-2 py-2 text-right font-medium">临期金额</th>
                      <th className="px-2 py-2 text-right font-medium">转化率</th>
                      <th className="px-2 py-2 text-center font-medium">标记</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.repRisks.map((row) => (
                      <tr
                        key={`${row.salesRep}-${row.region}`}
                        className={`border-b border-border last:border-0 transition-colors duration-150 ease-out ${
                        row.isFlagged ? 'bg-[hsl(4,72%,52%)]/5' : 'hover:bg-accent/20'
                      }`}
                    >
                        <td className="px-2 py-2">{row.salesRep}</td>
                        <td className="px-2 py-2">{row.region}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{row.storeCount}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.purchaseAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {row.purchaseQuantity.toLocaleString('zh-CN')}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                          {formatCurrency(row.expiryAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatPercent(row.conversionRate)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.isFlagged ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(4,72%,52%)]/10 text-[hsl(4,72%,52%)]">
                              风险
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {data.repRisks.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-2 py-8 text-center text-xs text-muted-foreground">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle>规格风险 TOP20</SectionTitle>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-accent/30 border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">规格</th>
                      <th className="px-2 py-2 text-right font-medium">进货金额</th>
                      <th className="px-2 py-2 text-right font-medium">进货数量</th>
                      <th className="px-2 py-2 text-right font-medium">临期金额</th>
                      <th className="px-2 py-2 text-right font-medium">转化率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.specRisks.slice(0, 20).map((row) => (
                      <tr
                        key={row.specification}
                        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                      >
                        <td className="px-2 py-2 truncate max-w-[260px]" title={row.specification}>
                          {row.specification}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.purchaseAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {row.purchaseQuantity.toLocaleString('zh-CN')}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                          {formatCurrency(row.expiryAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatPercent(row.conversionRate)}
                        </td>
                      </tr>
                    ))}
                    {data.specRisks.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-xs text-muted-foreground">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
        <button
              onClick={() => setShowCohorts((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showCohorts ? '收起 Cohort 明细' : '展开 Cohort 明细'}
            </button>
            {showCohorts && (
              <div className="mt-3 overflow-x-auto rounded-sm border border-border max-h-[360px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="bg-accent/30 border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">门店编码</th>
                      <th className="px-2 py-2 text-left font-medium">门店名称</th>
                      <th className="px-2 py-2 text-left font-medium">规格</th>
                      <th className="px-2 py-2 text-left font-medium">进货月</th>
                      <th className="px-2 py-2 text-right font-medium">进货金额</th>
                      <th className="px-2 py-2 text-right font-medium">进货数量</th>
                      <th className="px-2 py-2 text-right font-medium">第4月临期额</th>
                      <th className="px-2 py-2 text-right font-medium">第5月临期额</th>
                      <th className="px-2 py-2 text-right font-medium">临期金额</th>
                      <th className="px-2 py-2 text-right font-medium">转化率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((row) => (
                      <tr
                        key={`${row.customerCode}-${row.specification}-${row.purchaseMonth}`}
                        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                      >
                        <td className="px-2 py-2 font-mono tabular-nums">{row.customerCode}</td>
                        <td className="px-2 py-2 truncate max-w-[140px]" title={row.customerName}>
                          {row.customerName}
                        </td>
                        <td className="px-2 py-2 truncate max-w-[180px]" title={row.specification}>
                          {row.specification}
                        </td>
                        <td className="px-2 py-2">{row.purchaseMonth}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.purchaseAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {row.purchaseQuantity.toLocaleString('zh-CN')}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.expiryMonth4Amount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.expiryMonth5Amount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                          {formatCurrency(row.expiryAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatPercent(row.conversionRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OverstockAnalysisPanel;
