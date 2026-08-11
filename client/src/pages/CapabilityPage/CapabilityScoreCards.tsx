import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type { CapabilityScoreResult } from '@shared/api.interface';
import { CAPABILITY_TOTAL_LEVEL_COLORS } from './capability.constants';

interface CapabilityScoreCardsProps {
  score: CapabilityScoreResult | null;
  loading?: boolean;
}

const CapabilityScoreCards: React.FC<CapabilityScoreCardsProps> = ({
  score,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
    );
  }

  if (!score) return null;

  const levelColor =
    CAPABILITY_TOTAL_LEVEL_COLORS[score.totalLevel.code] ?? '#1E6FEB';

  const compareDelta = score.compare
    ? score.totalScore - (score.compare.totalScore ?? score.totalScore)
    : null;
  const deltaUp = (compareDelta ?? 0) > 0;

  // 各等级维度数量统计
  const countByLevel = score.scores.reduce(
    (acc, s) => {
      acc[s.level] = (acc[s.level] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* 综合战力总分 */}
      <div className="bg-card border border-border rounded-sm p-5 border-l-2 border-l-primary">
        <div className="text-xs text-muted-foreground mb-1">综合战力得分</div>
        <div className="flex items-end gap-3">
          <span
            className="font-mono tabular-nums text-4xl font-semibold leading-none"
            style={{ color: levelColor }}
          >
            {score.totalScore.toFixed(1)}
          </span>
          <span
            className="inline-flex items-center rounded-sm px-2 py-0.5 text-sm font-semibold text-white"
            style={{ backgroundColor: levelColor }}
          >
            {score.totalLevel.code} · {score.totalLevel.label}
          </span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {score.level === 'region'
            ? score.region ? `所别：${score.region}` : '全公司'
            : `业代：${score.salesRep || '全部'}`}
          <span className="mx-1">·</span>
          {score.monthFrom} ~ {score.monthTo}
        </div>
      </div>

      {/* 对比变化 */}
      <div className="bg-card border border-border rounded-sm p-5 border-l-2 border-l-border">
        <div className="text-xs text-muted-foreground mb-1">
          {score.compare ? (score.compare.type === 'mom' ? '环比变化' : '同比变化') : '对比变化'}
        </div>
        {score.compare ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono tabular-nums text-4xl font-semibold leading-none ${
                  (compareDelta ?? 0) >= 0 ? 'text-[hsl(152,60%,42%)]' : 'text-[hsl(4,72%,52%)]'
                }`}
              >
                {(compareDelta ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(compareDelta ?? 0).toFixed(1)}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              对比期：{score.compare.label}（{score.compare.totalScore == null ? '无数据' : `${score.compare.totalScore.toFixed(1)} 分`}）
            </div>
          </>
        ) : (
          <>
            <div className="font-mono tabular-nums text-4xl font-semibold leading-none text-muted-foreground/40">
              —
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              请在筛选栏开启「环比」或「同比」对比
            </div>
          </>
        )}
      </div>

      {/* 等级分布 */}
      <div className="bg-card border border-border rounded-sm p-5 border-l-2 border-l-border">
        <div className="text-xs text-muted-foreground mb-1">维度能力分布</div>
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(152,60%,42%)]" />
            <span className="text-xs text-muted-foreground">优势</span>
            <span className="font-mono tabular-nums text-lg font-semibold text-foreground">
              {countByLevel.strength ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(38,85%,48%)]" />
            <span className="text-xs text-muted-foreground">中等</span>
            <span className="font-mono tabular-nums text-lg font-semibold text-foreground">
              {countByLevel.medium ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(4,72%,52%)]" />
            <span className="text-xs text-muted-foreground">短板</span>
            <span className="font-mono tabular-nums text-lg font-semibold text-foreground">
              {countByLevel.weak ?? 0}
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          共 {score.scores.length} 个评估维度 · {deltaUp ? '整体呈上升趋势' : score.compare ? '整体呈下降趋势' : '当前无对比'}
        </div>
      </div>
    </div>
  );
};

export default CapabilityScoreCards;
