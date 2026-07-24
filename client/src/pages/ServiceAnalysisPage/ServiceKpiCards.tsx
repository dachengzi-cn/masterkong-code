import React from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import type { ServiceKpiData } from './service-analysis.utils';
import { formatCurrency } from './service-analysis.utils';

interface ServiceKpiCardsProps {
  kpi: ServiceKpiData | null;
  loading: boolean;
  monthFrom?: string;
  monthTo?: string;
}

const formatMonthRange = (from?: string, to?: string): string => {
  if (from && to && from === to) return from;
  if (from && to) return `${from} ~ ${to}`;
  if (from) return `${from} 起`;
  if (to) return `截至 ${to}`;
  return '全部月份';
};

const ServiceKpiCards: React.FC<ServiceKpiCardsProps> = ({
  kpi,
  loading,
  monthFrom,
  monthTo,
}) => {
  const hasData = !!kpi;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="总服务点数"
        icon="📍"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.totalPoints}
              duration={0.6}
              decimals={0}
              separator=","
            />
          ) : (
            '0'
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
        label="付费点数"
        icon="✅"
        variant="success"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.paidPoints}
              duration={0.6}
              decimals={0}
              separator=","
            />
          ) : (
            '0'
          )
        }
        subText={
          !loading && hasData && (
            <span className="text-[hsl(152,60%,42%)]">
              占比 {formatPercent(kpi.coverageRate)}
            </span>
          )
        }
      />

      <KpiCard
        label="付费覆盖率"
        icon="％"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.coverageRate * 100}
              duration={0.6}
              decimals={2}
              separator=","
              suffix="%"
            />
          ) : (
            '0.00%'
          )
        }
        subText={
          !loading && hasData && (
            <span>
              付费 {formatInt(kpi.paidPoints)} / 总 {formatInt(kpi.totalPoints)}
            </span>
          )
        }
      />

      <KpiCard
        label="点均销额"
        icon="📈"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.salesPerPoint}
              duration={0.6}
              decimals={0}
              separator=","
              prefix="¥"
            />
          ) : (
            formatCurrency(0)
          )
        }
        subText={
          !loading && hasData && (
            <span>
              总销额 {formatCurrency(kpi.totalStoreSales)}
            </span>
          )
        }
      />

      <KpiCard
        label="活跃业代数"
        icon="👥"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.activeRepCount}
              duration={0.6}
              decimals={0}
              separator=","
            />
          ) : (
            '0'
          )
        }
        subText={
          !loading && hasData && (
            <span>
              均 {formatInt(kpi.avgPointsPerRep)} 点/人
            </span>
          )
        }
      />

      <KpiCard
        label="未成交点数"
        icon="❌"
        variant="error"
        loading={loading}
        value={
          hasData ? (
            <CountUp
              end={kpi.noDealPoints}
              duration={0.6}
              decimals={0}
              separator=","
            />
          ) : (
            '0'
          )
        }
        subText={
          !loading && hasData && (
            <span className="text-[hsl(4,72%,52%)]">
              占比 {formatPercent(kpi.noDealRate)}
            </span>
          )
        }
      />
    </div>
  );
};

function formatInt(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%';
  return `${(value * 100).toFixed(2)}%`;
}

export default ServiceKpiCards;
