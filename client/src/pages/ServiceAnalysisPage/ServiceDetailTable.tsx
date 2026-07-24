import React, { useState, useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ServiceDetailRow } from './service-analysis.utils';
import {
  formatInt,
  formatCurrency,
  formatPercent,
} from './service-analysis.utils';

interface ServiceDetailTableProps {
  data: ServiceDetailRow[];
  loading: boolean;
}

const PAGE_SIZE = 20;

const ServiceDetailTable: React.FC<ServiceDetailTableProps> = ({
  data,
  loading,
}) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(
      (row) =>
        row.region.toLowerCase().includes(q) ||
        row.tier.toLowerCase().includes(q) ||
        row.salesRep.toLowerCase().includes(q),
    );
  }, [data, search]);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const pageData = filteredData.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const getCoverageColor = (rate: number): string => {
    if (rate >= 0.7) return 'text-[hsl(152,60%,42%)]';
    if (rate >= 0.4) return 'text-[hsl(38,85%,48%)]';
    return 'text-[hsl(4,72%,52%)]';
  };

  const getFeeRatioBg = (ratio: number): string | undefined => {
    if (ratio > 0.15) return 'hsl(4, 72%, 90%)';
    if (ratio > 0.1) return 'hsl(38, 85%, 88%)';
    return undefined;
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold text-foreground">
          服务点数明细（按所别/阶层/业代）
        </div>
        <div className="relative">
          <span className="inline-flex items-center justify-center text-base leading-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" >🔍</span>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="搜索所别/阶层/业代"
            className="h-7 w-[200px] pl-7 text-xs rounded-sm"
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : filteredData.length === 0 ? (
        <div className="h-[320px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🔍</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">
                {search ? '无匹配数据' : '暂无明细数据'}
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                {search ? '请尝试更换搜索关键词' : '当前筛选条件下没有匹配的服务点数明细'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-accent/50">
                  <th className="px-2 py-2 text-left font-medium">所别</th>
                  <th className="px-2 py-2 text-left font-medium">阶层</th>
                  <th className="px-2 py-2 text-left font-medium">业代</th>
                  <th className="px-2 py-2 text-right font-medium">总点数</th>
                  <th className="px-2 py-2 text-right font-medium">
                    付费点数
                  </th>
                  <th className="px-2 py-2 text-right font-medium">覆盖率</th>
                  <th className="px-2 py-2 text-right font-medium">
                    付费金额
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    总门店销额
                  </th>
                  <th className="px-2 py-2 text-right font-medium">费比</th>
                  <th className="px-2 py-2 text-right font-medium">未成交</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, index) => (
                  <tr
                    key={`${row.region}-${row.tier}-${row.salesRep}-${index}`}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                  >
                    <td
                      className="px-2 py-1.5 text-foreground truncate max-w-[100px]"
                      title={row.region}
                    >
                      {row.region}
                    </td>
                    <td className="px-2 py-1.5 text-foreground">{row.tier}</td>
                    <td
                      className="px-2 py-1.5 text-foreground truncate max-w-[100px]"
                      title={row.salesRep}
                    >
                      {row.salesRep}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-medium">
                      {formatInt(row.totalPoints)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[hsl(152,60%,42%)]">
                      {formatInt(row.paidPoints)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono tabular-nums ${getCoverageColor(row.coverageRate)}`}
                    >
                      {formatPercent(row.coverageRate)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {formatCurrency(row.paidAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {formatCurrency(row.totalStoreSales)}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right font-mono tabular-nums"
                      style={{ backgroundColor: getFeeRatioBg(row.feeRatio) }}
                    >
                      {formatPercent(row.feeRatio)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[hsl(4,72%,52%)]">
                      {formatInt(row.noDealPoints)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>
                共 {filteredData.length} 条，第 {page + 1}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-0.5 rounded-sm border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="px-2 py-0.5 rounded-sm border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ServiceDetailTable;
