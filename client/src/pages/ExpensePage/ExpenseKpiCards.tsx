import React from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import type { ExpiryKpiData, AtpPerformanceRow } from '@shared/api.interface';

interface ExpenseKpiCardsProps {
  expiryKpis: ExpiryKpiData | null;
  atpRows: AtpPerformanceRow[];
  loading: boolean;
  monthFrom?: string;
  monthTo?: string;
}

const ChangeIndicator: React.FC<{ value: number }> = ({ value }) => {
  if (value === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center justify-center text-base leading-none" >➖</span>
        持平
      </span>
    );
  }
  const isUp = value > 0;
  const color = isUp ? 'text-[hsl(4_72%_52%)]' : 'text-[hsl(152_60%_42%)]';
  const Icon = isUp ? '📈' : '📉';
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <span className="inline-flex items-center justify-center text-base leading-none">{Icon}</span>
      {isUp ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
};

const formatMonthRange = (from?: string, to?: string): string => {
  if (from && to && from === to) return from;
  if (from && to) return `${from} ~ ${to}`;
  if (from) return `${from} 起`;
  if (to) return `截至 ${to}`;
  return '全部月份';
};

const formatCurrency = (value: number): string => {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
};

const ExpenseKpiCards: React.FC<ExpenseKpiCardsProps> = ({
  expiryKpis,
  atpRows,
  loading,
  monthFrom,
  monthTo,
}) => {
  const atpPaidAmount = atpRows.reduce((sum, r) => sum + r.paidAmount, 0);
  const atpPaidStoreSales = atpRows.reduce(
    (sum, r) => sum + r.paidStoreSales,
    0,
  );
  const atpTotalStoreSales = atpRows.reduce(
    (sum, r) => sum + r.totalStoreSales,
    0,
  );
  const atpFeeRatio =
    atpPaidStoreSales > 0 ? atpPaidAmount / atpPaidStoreSales : 0;
  const atpSalesRatio =
    atpTotalStoreSales > 0 ? atpPaidStoreSales / atpTotalStoreSales : 0;

  const hasExpiryData = !!expiryKpis;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="临期费用总额"
        icon="👛"
        loading={loading}
        value={
          hasExpiryData ? (
            <CountUp
              end={expiryKpis.totalAmount}
              duration={0.6}
              decimals={2}
              separator=","
              prefix="¥"
            />
          ) : (
            formatCurrency(0)
          )
        }
        subText={
          !loading && (
            <span className="truncate">
              {formatMonthRange(monthFrom, monthTo)}
            </span>
          )
        }
      />

      <KpiCard
        label="环比变化"
        icon="📈"
        loading={loading}
        value={
          hasExpiryData ? (
            <CountUp
              end={expiryKpis.monthOverMonthChange}
              duration={0.6}
              decimals={1}
              separator=","
              suffix="%"
            />
          ) : (
            '0.0%'
          )
        }
        subText={!loading && hasExpiryData && <ChangeIndicator value={expiryKpis.monthOverMonthChange} />}
      />

      <KpiCard
        label="涉及门店数"
        icon="🏬"
        loading={loading}
        value={
          hasExpiryData ? (
            <CountUp
              end={expiryKpis.involvedStoreCount}
              duration={0.6}
              decimals={0}
              separator=","
            />
          ) : (
            '0'
          )
        }
      />

      <KpiCard
        label="ATP 总付费金额"
        icon="⚡"
        loading={loading}
        value={
          <CountUp
            end={atpPaidAmount}
            duration={0.6}
            decimals={2}
            separator=","
            prefix="¥"
          />
        }
      />

      <KpiCard
        label="ATP 投入费比"
        icon="％"
        loading={loading}
        value={
          <CountUp
            end={atpFeeRatio * 100}
            duration={0.6}
            decimals={2}
            separator=","
            suffix="%"
          />
        }
      />

      <KpiCard
        label="ATP 付费点销额占比"
        icon="％"
        loading={loading}
        value={
          <CountUp
            end={atpSalesRatio * 100}
            duration={0.6}
            decimals={2}
            separator=","
            suffix="%"
          />
        }
      />
    </div>
  );
};

export default ExpenseKpiCards;
