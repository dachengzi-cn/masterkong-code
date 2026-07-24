import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { ServiceInsight, InsightType } from './service-analysis.utils';

interface ServiceInsightsProps {
  insights: ServiceInsight[];
  loading: boolean;
}

const TYPE_CONFIG: Record<
  InsightType,
  {
    icon: React.ReactNode;
    bg: string;
    border: string;
    iconColor: string;
    label: string;
  }
> = {
  critical: {
    icon: <span className="inline-flex items-center justify-center text-base leading-none">🛑</span>,
    bg: 'bg-[hsl(4,72%,95%)]',
    border: 'border-[hsl(4,72%,52%)]/30',
    iconColor: 'text-[hsl(4,72%,52%)]',
    label: '严重',
  },
  warning: {
    icon: <span className="inline-flex items-center justify-center text-base leading-none" >⚠️</span>,
    bg: 'bg-[hsl(38,85%,95%)]',
    border: 'border-[hsl(38,85%,48%)]/30',
    iconColor: 'text-[hsl(38,85%,48%)]',
    label: '预警',
  },
  positive: {
    icon: <span className="inline-flex items-center justify-center text-base leading-none" >📈</span>,
    bg: 'bg-[hsl(152,60%,95%)]',
    border: 'border-[hsl(152,60%,42%)]/30',
    iconColor: 'text-[hsl(152,60%,42%)]',
    label: '亮点',
  },
  info: {
    icon: <span className="inline-flex items-center justify-center text-base leading-none" >ℹ️</span>,
    bg: 'bg-[hsl(217,40%,95%)]',
    border: 'border-[hsl(217,85%,52%)]/30',
    iconColor: 'text-[hsl(217,85%,52%)]',
    label: '动态',
  },
};

const ServiceInsights: React.FC<ServiceInsightsProps> = ({
  insights,
  loading,
}) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center text-base leading-none text-primary">💡</span>
        <div className="text-sm font-bold text-foreground">
          经营洞察与风险预警
        </div>
        {!loading && insights.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            共 {insights.length} 条洞察
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : insights.length === 0 ? (
        <div className="h-[120px] flex items-center justify-center">
          <Empty className="border-none py-0">
            <EmptyHeader>
              <EmptyMedia variant="emoji">💡</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无洞察数据</EmptyTitle>
              <EmptyDescription className="text-xs">当前数据暂未产生分析洞察</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {insights.map((insight, index) => {
            const config = TYPE_CONFIG[insight.type];
            return (
              <div
                key={`${insight.title}-${index}`}
                className={`rounded-sm border ${config.border} ${config.bg} p-3 flex gap-3`}
              >
                <div className={`shrink-0 ${config.iconColor}`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">
                      {insight.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-sm ${config.iconColor} bg-background/60`}
                    >
                      {config.label}
                    </span>
                    {insight.metric && (
                      <span
                        className={`text-xs font-mono font-bold ml-auto ${config.iconColor}`}
                      >
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {insight.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ServiceInsights;
