import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { DetailRow } from './expense-overview.types';
import { formatCurrency } from './expense-overview.utils';

interface ExpenseDetailTableProps {
  data: DetailRow[];
  loading: boolean;
}

const ExpenseDetailTable: React.FC<ExpenseDetailTableProps> = ({
  data,
  loading,
}) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="text-sm font-bold text-foreground mb-4">
        费用明细对比（按所别）
      </div>

      {loading ? (
        <Skeleton className="h-[240px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📊</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无明细数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的费用明细数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent/50">
                <th className="px-2 py-2 text-left font-medium">所别</th>
                <th className="px-2 py-2 text-right font-medium">合计金额</th>
                <th className="px-2 py-2 text-right font-medium">临期费用</th>
                <th className="px-2 py-2 text-right font-medium">
                  ATP付费金额
                </th>
                <th className="px-2 py-2 text-right font-medium">ATP占比</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => {
                const atpShare =
                  row.totalAmount > 0 ? row.atpPaidAmount / row.totalAmount : 0;
                return (
                  <tr
                    key={`${row.region}-${index}`}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                  >
                    <td
                      className="px-2 py-2 text-foreground truncate max-w-[240px]"
                      title={row.region}
                    >
                      {row.region}
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
                      {(atpShare * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseDetailTable;
