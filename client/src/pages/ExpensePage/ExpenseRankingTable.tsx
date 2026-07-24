import React, { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ExpenseDimension, RankingRow } from './expense-overview.types';
import { DIMENSION_LABELS, formatCurrency } from './expense-overview.utils';

interface ExpenseRankingTableProps {
  data: RankingRow[];
  dimension: ExpenseDimension;
  loading: boolean;
  onDimensionChange: (dimension: ExpenseDimension) => void;
}

const DIMENSION_OPTIONS: { key: ExpenseDimension; label: string }[] = [
  { key: 'region', label: '所别' },
  { key: 'tier', label: '阶层' },
  { key: 'dealerType', label: '形态' },
  { key: 'business', label: '业务' },
  { key: 'specification', label: '规格' },
  { key: 'salesRep', label: '业代' },
];

const ExpenseRankingTable: React.FC<ExpenseRankingTableProps> = ({
  data,
  dimension,
  loading,
  onDimensionChange,
}) => {
  const [sortByTotal, setSortByTotal] = useState(true);

  const sortedData = sortByTotal
    ? data
    : [...data].sort((a, b) => b.recordCount - a.recordCount);

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-sm font-bold text-foreground">费用排行</div>
        <div className="flex flex-wrap items-center gap-1">
          {DIMENSION_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => onDimensionChange(option.key)}
              className={`px-2 py-0.5 text-xs rounded-sm border transition-colors ${
                dimension === option.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无{DIMENSION_LABELS[dimension]}排行数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的费用排行数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent/50">
                <th className="px-2 py-2 text-left font-medium">
                  {DIMENSION_LABELS[dimension]}
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                    onClick={() => setSortByTotal(true)}
                  >
                    合计金额 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">临期费用</th>
                <th className="px-2 py-2 text-right font-medium">
                  ATP付费金额
                </th>
                <th className="px-2 py-2 text-right font-medium">占比</th>
                <th className="px-2 py-2 text-right font-medium">
                  <button
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                    onClick={() => setSortByTotal(false)}
                  >
                    记录数 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 10).map((row, index) => (
                <tr
                  key={`${row.value}-${index}`}
                  className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                >
                  <td
                    className="px-2 py-2 text-foreground truncate max-w-[200px]"
                    title={row.value}
                  >
                    {row.value}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(row.totalAmount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                    {formatCurrency(row.expiryAmount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(38,85%,48%)]">
                    {formatCurrency(row.atpPaidAmount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {(row.share * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {row.recordCount.toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseRankingTable;
