import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { CapabilityInsightsResult } from '@shared/api.interface';
import { formatScore } from './capability.utils';

interface CapabilityInsightPanelProps {
  insights: CapabilityInsightsResult | null;
  loading?: boolean;
}

const CapabilityInsightPanel: React.FC<CapabilityInsightPanelProps> = ({
  insights,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <h3 className="text-lg font-semibold text-foreground mb-4">分析与解读</h3>
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          确认评估后自动生成解读与建议
        </div>
      </div>
    );
  }

  const trendMeta = {
    up: { icon: '↑', label: '趋势向好', color: 'text-[hsl(152,60%,42%)]' },
    down: { icon: '↓', label: '趋势走弱', color: 'text-[hsl(4,72%,52%)]' },
    flat: { icon: '→', label: '趋势平稳', color: 'text-muted-foreground' },
  }[insights.trend];

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">分析与解读</h3>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${trendMeta.color}`}>
          {trendMeta.icon} {trendMeta.label}
        </span>
      </div>

      {/* 评估结论 */}
      <div className="mb-5 rounded-sm border border-border bg-accent/20 p-4">
        <div className="text-xs text-muted-foreground mb-1">评估结论</div>
        <p className="text-sm leading-relaxed text-foreground">{insights.summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 核心优势 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[hsl(152,60%,42%)]">核心优势</span>
            <span className="text-xs text-muted-foreground">
              {insights.strengths.length} 项
            </span>
          </div>
          <div className="space-y-3">
            {insights.strengths.length === 0 && (
              <p className="text-xs text-muted-foreground">暂未识别出明显优势维度</p>
            )}
            {insights.strengths.map((s) => (
              <div key={s.key} className="border-l-2 border-l-success pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  <span className="font-mono tabular-nums text-sm text-[hsl(152,60%,42%)]">
                    {formatScore(s.score)}
                  </span>
                  <span className="text-xs text-muted-foreground">↑ 优势</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {s.reason}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 关键短板 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[hsl(4,72%,52%)]">关键短板</span>
            <span className="text-xs text-muted-foreground">
              {insights.weaknesses.length} 项
            </span>
          </div>
          <div className="space-y-3">
            {insights.weaknesses.length === 0 && (
              <p className="text-xs text-muted-foreground">当前无短板维度，能力发展均衡</p>
            )}
            {insights.weaknesses.map((s) => (
              <div key={s.key} className="border-l-2 border-l-error pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  <span className="font-mono tabular-nums text-sm text-[hsl(4,72%,52%)]">
                    {formatScore(s.score)}
                  </span>
                  <span className="text-xs text-muted-foreground">↓ 短板</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {s.reason}
                </p>
                {s.suggestion && (
                  <p className="text-xs mt-1 leading-relaxed text-[hsl(38,85%,48%)]">
                    建议：{s.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 改进建议 */}
      {insights.suggestions.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold text-foreground mb-3">改进建议</div>
          <ol className="space-y-2">
            {insights.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
                <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default CapabilityInsightPanel;
