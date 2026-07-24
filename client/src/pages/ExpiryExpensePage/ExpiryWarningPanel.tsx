import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { ExpiryOfficeRankingItem } from '@shared/api.interface';

interface ExpiryWarningPanelProps {
  topCurrentMonthOffices: ExpiryOfficeRankingItem[];
  topThreeMonthOffices: ExpiryOfficeRankingItem[];
  loading: boolean;
}

const formatCurrency = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};

const RankingList: React.FC<{ title: string; items: ExpiryOfficeRankingItem[] }> = ({
  title,
  items,
}) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
    {items.length === 0 ? (
      <div className="text-xs text-muted-foreground">暂无数据</div>
    ) : (
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div
            key={item.office}
            className="flex items-center justify-between rounded-sm border border-border bg-card p-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex items-center justify-center size-5 rounded-sm text-[10px] font-mono font-medium shrink-0 ${
                  index === 0
                    ? 'bg-error/10 text-error'
                    : index === 1
                      ? 'bg-warning/10 text-warning'
                      : 'bg-accent text-accent-foreground'
                }`}
              >
                {index + 1}
              </span>
              <span className="text-xs text-foreground truncate" title={item.office}>
                {item.office}
              </span>
            </div>
            <span className="text-xs font-mono text-foreground">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const ExpiryWarningPanel: React.FC<ExpiryWarningPanelProps> = ({
  topCurrentMonthOffices,
  topThreeMonthOffices,
  loading,
}) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-4">
        <span className="inline-flex items-center justify-center text-base leading-none text-primary" >🏅</span>
        临期预警
      </div>

      {loading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : (
        <div className="space-y-5">
          <RankingList title="1. 临期当月所别金额 TOP3" items={topCurrentMonthOffices} />
          <RankingList title="2. 3 个月合计所别金额 TOP3" items={topThreeMonthOffices} />
        </div>
      )}
    </div>
  );
};

export default ExpiryWarningPanel;
