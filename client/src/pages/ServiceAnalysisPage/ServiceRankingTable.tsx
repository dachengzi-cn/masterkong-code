import React, { useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type {
  ServiceDimension,
  ServiceRankingRow,
} from './service-analysis.utils';
import {
  DIMENSION_LABELS,
  DIMENSION_OPTIONS,
  formatInt,
  formatCurrency,
  formatPercent,
} from './service-analysis.utils';

interface ServiceRankingTableProps {
  data: ServiceRankingRow[];
  dimension: ServiceDimension;
  loading: boolean;
  onDimensionChange: (dimension: ServiceDimension) => void;
}

type SortKey = 'totalPoints' | 'coverageRate' | 'salesPerPoint' | 'noDealPoints';

const ServiceRankingTable: React.FC<ServiceRankingTableProps> = ({
  data,
  dimension,
  loading,
  onDimensionChange,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints');

  const sortedData = [...data].sort((a, b) => {
    switch (sortKey) {
      case 'coverageRate':
        return b.coverageRate - a.coverageRate;
      case 'salesPerPoint':
        return b.salesPerPoint - a.salesPerPoint;
      case 'noDealPoints':
        return b.noDealPoints - a.noDealPoints;
      default:
        return b.totalPoints - a.totalPoints;
    }
  });

  const getCoverageColor = (rate: number): string => {
    if (rate >= 0.7) return 'text-[hsl(152,60%,42%)]';
    if (rate >= 0.4) return 'text-[hsl(38,85%,48%)]';
    return 'text-[hsl(4,72%,52%)]';
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-sm font-bold text-foreground">服务点数排行</div>
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
              <EmptyDescription className="text-xs">当前筛选条件下没有匹配的排行数据</EmptyDescription>
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
                    className={`inline-flex items-center gap-0.5 hover:text-foreground ${
                      sortKey === 'totalPoints' ? 'text-primary' : ''
                    }`}
                    onClick={() => setSortKey('totalPoints')}
                  >
                    总点数 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">付费点数</th>
                <th className="px-2 py-2 text-right font-medium">
                  <button
                    className={`inline-flex items-center gap-0.5 hover:text-foreground ${
                      sortKey === 'coverageRate' ? 'text-primary' : ''
                    }`}
                    onClick={() => setSortKey('coverageRate')}
                  >
                    覆盖率 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button
                    className={`inline-flex items-center gap-0.5 hover:text-foreground ${
                      sortKey === 'salesPerPoint' ? 'text-primary' : ''
                    }`}
                    onClick={() => setSortKey('salesPerPoint')}
                  >
                    点均销额 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button
                    className={`inline-flex items-center gap-0.5 hover:text-foreground ${
                      sortKey === 'noDealPoints' ? 'text-primary' : ''
                    }`}
                    onClick={() => setSortKey('noDealPoints')}
                  >
                    未成交 <span className="inline-flex items-center justify-center text-base leading-none" >↕️</span>
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">占比</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 10).map((row, index) => (
                <tr
                  key={`${row.value}-${index}`}
                  className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                >
                  <td
                    className="px-2 py-2 text-foreground truncate max-w-[140px]"
                    title={row.value}
                  >
                    {row.value}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                    {formatInt(row.totalPoints)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(152,60%,42%)]">
                    {formatInt(row.paidPoints)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-mono tabular-nums ${getCoverageColor(row.coverageRate)}`}
                  >
                    {formatPercent(row.coverageRate)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {formatCurrency(row.salesPerPoint)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(4,72%,52%)]">
                    {formatInt(row.noDealPoints)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatPercent(row.share)}
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

export default ServiceRankingTable;
