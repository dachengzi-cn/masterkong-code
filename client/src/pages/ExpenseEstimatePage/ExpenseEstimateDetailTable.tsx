import React, { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { expenseEstimateApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  ExpenseEstimateListResponse,
  ExpenseEstimateFilterParams,
} from '@shared/api.interface';
import { formatMoney, formatUsageRate } from './expense-estimate.utils';
import UsageBar from './UsageBar';

interface DetailTableProps {
  filters: ExpenseEstimateFilterParams;
  loading: boolean;
  reloadKey?: number;
}

const PAGE_SIZE = 10;

/** 预估明细表：分页展示全部登记记录 */
const ExpenseEstimateDetailTable: React.FC<DetailTableProps> = ({
  filters,
  loading,
  reloadKey = 0,
}) => {
  const [data, setData] = useState<ExpenseEstimateListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);

  const fetchPage = useCallback(async () => {
    setTableLoading(true);
    try {
      const res = await expenseEstimateApi.getExpenseEstimateList({
        ...filters,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(res);
    } catch (err: unknown) {
      logger.error('Failed to load expense estimate detail:', err);
      setData(null);
    } finally {
      setTableLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    setPage(1);
  }, [reloadKey, filters]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage, reloadKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="text-sm font-bold text-foreground mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          预估明细
          {data && data.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              共 {data.total} 条记录
            </span>
          )}
        </span>
      </div>

      {tableLoading || loading ? (
        <Skeleton className="h-[240px] w-full" />
      ) : !data || data.items.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">📋</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无明细数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的费用登记记录</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-accent/50">
                  <th className="px-2 py-2.5 text-left font-medium">月份</th>
                  <th className="px-2 py-2.5 text-left font-medium">所别</th>
                  <th className="px-2 py-2.5 text-left font-medium">部别</th>
                  <th className="px-2 py-2.5 text-left font-medium">促销活动</th>
                  <th className="px-2 py-2.5 text-left font-medium">费用科目</th>
                  <th className="px-2 py-2.5 text-right font-medium">预估金额</th>
                  <th className="px-2 py-2.5 text-right font-medium">已登记金额</th>
                  <th className="px-2 py-2.5 text-left font-medium">使用率</th>
                  <th className="px-2 py-2.5 text-left font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                  >
                    <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{row.month}</td>
                    <td className="px-2 py-2 text-foreground truncate max-w-[120px]" title={row.region}>{row.region}</td>
                    <td className="px-2 py-2 text-foreground truncate max-w-[120px]" title={row.department}>{row.department}</td>
                    <td className="px-2 py-2 text-foreground truncate max-w-[160px]" title={row.activityName}>{row.activityName}</td>
                    <td className="px-2 py-2 text-foreground truncate max-w-[140px]" title={row.expenseSubject}>{row.expenseSubject}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{formatMoney(row.estimatedAmount)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">{formatMoney(row.actualAmount)}</td>
                    <td className="px-2 py-2">
                      {row.estimatedAmount > 0 ? (
                        <UsageBar
                          rate={(row.actualAmount / row.estimatedAmount) * 100}
                          showText={false}
                          showTag={false}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{formatUsageRate(-1)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[160px]" title={row.remark ?? ''}>
                      {row.remark || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                第 {page} / {totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={page <= 1 || tableLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={page >= totalPages || tableLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExpenseEstimateDetailTable;
