import React, { useState } from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { getOverstockAnalysisExport } from '@/api/expense';
import { reportApi } from '@/api';
import type {
  OverstockAnalysisResult,
  OverstockAnalysisExportResult,
  ReportSheetData,
  ReportRow,
  ReportCellStyle,
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

const downloadOverstockExport = async (result: OverstockAnalysisExportResult, filename: string): Promise<void> => {
  const headerStyle: ReportCellStyle = {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'C6E0B4' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
  };

  const centerStyle: ReportCellStyle = {
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const styleHeader = (rows: ReportRow[]): ReportRow[] =>
    rows.map((row, ri) =>
      ri === 0
        ? row.map((cell) => {
            const value =
              typeof cell === 'object' && cell !== null && 'v' in cell
                ? cell.v
                : cell;
            return { v: value as string | number | boolean | null, s: headerStyle };
          })
        : row,
    );

  const sheets: ReportSheetData[] = [];

  // 汇总
  const summaryRows: ReportRow[] = [
    ['指标', '数值'],
    ['总进货金额', result.summary.totalPurchaseAmount],
    ['总临期金额', result.summary.totalExpiryAmount],
    ['平均转化率', { v: result.summary.avgConversionRate, z: '0.00%' }],
    ['标记门店数', result.summary.flaggedStoreCount],
    ['标记业代数', result.summary.flaggedRepCount],
    ['阈值（mean + 2σ）', { v: result.summary.threshold, z: '0.00%' }],
  ];
  sheets.push({
    sheetName: '汇总',
    rows: styleHeader(summaryRows),
    colWidths: [20, 16],
    showGridLines: false,
  });

  // 风险门店
  const storeRows: ReportRow[] = [
    ['门店编码', '门店名称', '所别', '业代', '进货金额', '进货数量', '临期金额', '转化率', '是否标记'],
    ...result.storeRisks.map((r) => [
      r.customerCode,
      r.customerName,
      r.region,
      r.salesRep,
      r.purchaseAmount,
      r.purchaseQuantity,
      r.expiryAmount,
      { v: r.conversionRate, z: '0.00%', s: centerStyle },
      r.isFlagged ? '是' : '否',
    ] as ReportRow),
  ];
  sheets.push({
    sheetName: '风险门店',
    rows: styleHeader(storeRows),
    colWidths: [16, 20, 14, 14, 12, 12, 14, 12, 12],
    showGridLines: false,
  });

  // 风险业代
  const repRows: ReportRow[] = [
    ['业代', '所别', '负责门店数', '进货金额', '进货数量', '临期金额', '转化率', '是否标记'],
    ...result.repRisks.map((r) => [
      r.salesRep,
      r.region,
      r.storeCount,
      r.purchaseAmount,
      r.purchaseQuantity,
      r.expiryAmount,
      { v: r.conversionRate, z: '0.00%', s: centerStyle },
      r.isFlagged ? '是' : '否',
    ] as ReportRow),
  ];
  sheets.push({
    sheetName: '风险业代',
    rows: styleHeader(repRows),
    colWidths: [14, 14, 12, 12, 12, 14, 12, 12],
    showGridLines: false,
  });

  // 规格风险
  const specRows: ReportRow[] = [
    ['规格', '进货金额', '进货数量', '临期金额', '转化率'],
    ...result.specRisks.map((r) => [
      r.specification,
      r.purchaseAmount,
      r.purchaseQuantity,
      r.expiryAmount,
      { v: r.conversionRate, z: '0.00%', s: centerStyle },
    ] as ReportRow),
  ];
  sheets.push({
    sheetName: '规格风险',
    rows: styleHeader(specRows),
    colWidths: [30, 12, 12, 14, 12],
    showGridLines: false,
  });

  // Cohort 明细
  const cohortRows: ReportRow[] = [
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
      { v: c.conversionRate, z: '0.00%', s: centerStyle },
    ] as ReportRow),
  ];
  sheets.push({
    sheetName: 'Cohort明细',
    rows: styleHeader(cohortRows),
    colWidths: [16, 20, 30, 12, 12, 12, 14, 14, 14, 12],
    showGridLines: false,
  });

  await reportApi.generateReport({ type: 'overstock', title: filename, fileName: filename, sheets });
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
      const filename = `差异门店分析_${filters.monthFrom ?? ''}_${filters.monthTo ?? ''}`;
      await downloadOverstockExport(result, filename);
      toast.success('报表已生成，请点击右上角下载按钮查看/下载');
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
          {exporting ? '导出中' : '差异门店分析'}
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
