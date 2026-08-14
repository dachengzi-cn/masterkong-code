import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ExpenseEstimateSplitRow } from '@shared/api.interface';
import UsageBar from './UsageBar';
import { formatMoney } from './expense-estimate.utils';

interface SplitTableProps {
  title: string;
  /** 维度名（表头，如 所别 / 部别 / 费用科目 / 促销活动） */
  dimensionName: string;
  rows: ExpenseEstimateSplitRow[];
  loading?: boolean;
}

/** 拆分汇总表：维度 | 预估金额 | 已登记金额 | 使用率（线性仪表） | 剩余额度 */
const SplitTable: React.FC<SplitTableProps> = ({
  title,
  dimensionName,
  rows,
  loading = false,
}) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {rows.length > 0 ? `${rows.length} 项` : ''}
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : rows.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📋</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无拆分数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的费用预估数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-accent/50">
                <th className="px-2 py-2.5 text-left font-medium">{dimensionName}</th>
                <th className="px-2 py-2.5 text-right font-medium">预估金额</th>
                <th className="px-2 py-2.5 text-right font-medium">已登记金额</th>
                <th className="px-2 py-2.5 text-left font-medium">使用率</th>
                <th className="px-2 py-2.5 text-right font-medium">剩余额度</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const remainingClass =
                  row.remainingAmount < 0
                    ? 'text-[hsl(4,72%,52%)]'
                    : row.remainingAmount === 0
                      ? 'text-foreground'
                      : 'text-[hsl(152,60%,42%)]';
                return (
                  <tr
                    key={row.name}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                  >
                    <td className="px-2 py-2 text-foreground truncate max-w-[180px]" title={row.name}>
                      {row.name}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatMoney(row.estimatedAmount)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                      {formatMoney(row.actualAmount)}
                    </td>
                    <td className="px-2 py-2">
                      <UsageBar rate={row.usageRate} />
                    </td>
                    <td className={cn('px-2 py-2 text-right font-mono tabular-nums', remainingClass)}>
                      {formatMoney(row.remainingAmount)}
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

export default SplitTable;
