import React from 'react';
import CountUp from 'react-countup';

import { KpiCard } from '@/components/business-ui/kpi-card';
import type { KpiData } from '@shared/api.interface';

interface KpiCardsProps {
  data: KpiData | null;
  loading: boolean;
}

interface KpiConfig {
  key: keyof KpiData;
  label: string;
  decimals: number;
  prefix?: string;
  icon: React.ReactNode;
}

const KPI_CONFIGS: KpiConfig[] = [
  { key: 'totalRecords', label: '总记录数', decimals: 0, icon: '📋' },
  { key: 'totalAmount', label: '合计金额', decimals: 2, prefix: '¥', icon: '💰' },
  { key: 'avgValue', label: '平均值', decimals: 2, prefix: '¥', icon: '📊' },
  { key: 'maxValue', label: '最大值', decimals: 2, prefix: '¥', icon: '⬆️' },
  { key: 'minValue', label: '最小值', decimals: 2, prefix: '¥', icon: '⬇️' },
];

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
  const color = isUp ? 'text-[hsl(152_60%_42%)]' : 'text-[hsl(4_72%_52%)]';
  const Icon = isUp ? '📈' : '📉';

  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <span className="inline-flex items-center justify-center text-base leading-none">{Icon}</span>
      {isUp ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
};

const KpiCards: React.FC<KpiCardsProps> = ({ data, loading }) => {
  return (
    <div
      data-ai-section-type="card-stat"
      className="grid grid-cols-2 md:grid-cols-5 gap-3"
    >
      {KPI_CONFIGS.map((config: KpiConfig) => (
        <KpiCard
          key={config.key}
          label={config.label}
          icon={config.icon}
          loading={loading || !data}
          value={
            data ? (
              <>
                {config.prefix}
                <CountUp
                  end={data[config.key] as number}
                  duration={0.6}
                  decimals={config.decimals}
                  separator=","
                />
              </>
            ) : null
          }
          subText={
            !loading && data && config.key === 'totalAmount' ? (
              <ChangeIndicator value={data.yearOnYearChange} />
            ) : null
          }
        />
      ))}
    </div>
  );
};

export default KpiCards;
