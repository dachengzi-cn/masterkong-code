import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  CapabilityScoreLevel,
  CapabilityScoreResult,
} from '@shared/api.interface';
import {
  CAPABILITY_PRIMARY_COLOR,
  CAPABILITY_COMPARE_COLOR,
  CAPABILITY_SCORE_LEVEL_COLORS,
} from './capability.constants';
import { levelLabel } from './capability.utils';

interface CapabilityRadarChartProps {
  score: CapabilityScoreResult | null;
  loading?: boolean;
}

/** 构造雷达图 option：主系列品牌蓝实线，对比系列灰色虚线，标签按维度等级着色 */
function buildRadarOption(score: CapabilityScoreResult): EChartsOption {
  const levelByKey = new Map<string, CapabilityScoreLevel>(
    score.scores.map((s) => [s.key, s.level]),
  );

  const series: EChartsOption['series'] = [
    {
      name: '本评估期',
      type: 'radar',
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: CAPABILITY_PRIMARY_COLOR, width: 2 },
      itemStyle: { color: CAPABILITY_PRIMARY_COLOR },
      areaStyle: { color: 'rgba(30, 111, 235, 0.12)' },
      data: [
        {
          value: score.scores.map((s) => s.score),
          name: '本评估期',
        },
      ],
    },
  ];

  if (score.compare) {
    const compareScores = new Map(
      score.compare.scores.map((s) => [s.key, s.score]),
    );
    series.push({
      name: score.compare.type === 'mom' ? '环比' : '同比',
      type: 'radar',
      symbol: 'none',
      lineStyle: { color: CAPABILITY_COMPARE_COLOR, width: 1.5, type: 'dashed' },
      itemStyle: { color: CAPABILITY_COMPARE_COLOR },
      data: [
        {
          value: score.scores.map((s) =>
            compareScores.get(s.key) ?? null,
          ),
          name: score.compare.type === 'mom' ? '环比' : '同比',
        },
      ],
    });
  }

  const indicator = score.scores.map((s) => ({
    name: s.name,
    max: 100,
    nameTextStyle: {
      color: CAPABILITY_SCORE_LEVEL_COLORS[levelByKey.get(s.key) ?? 'medium'],
      fontWeight: 600 as const,
      fontSize: 13,
    },
  }));

  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(18, 24, 38, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: any) => {
        const idx = params.dataIndex;
        const s = score.scores[idx];
        if (!s) return '';
        const level = s.level ?? 'medium';
        let html = `<div style="font-weight:600;margin-bottom:4px;">${s.name}</div>`;
        html += `<div>得分：<b>${s.score.toFixed(1)}</b>（${levelLabel(level)}）</div>`;
        html += `<div>原始值：${s.rawLabel ?? (s.rawValue == null ? '—' : Math.round(s.rawValue).toLocaleString('zh-CN'))}</div>`;
        html += `<div>权重：${(s.weight * 100).toFixed(0)}%</div>`;
        const mom = s.compare?.mom;
        if (mom !== undefined && mom !== null) {
          html += `<div>环比：${mom > 0 ? '+' : ''}${mom.toFixed(1)} 分</div>`;
        }
        return html;
      },
    },
    legend: {
      bottom: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: '#4A5872' },
    },
    radar: {
      indicator,
      radius: '62%',
      center: ['50%', '50%'],
      splitNumber: 4,
      splitArea: {
        areaStyle: { color: ['rgba(220, 226, 236, 0.35)', 'rgba(240, 243, 248, 0.35)'] },
      },
      axisLine: { lineStyle: { color: 'rgba(150, 163, 184, 0.6)' } },
      splitLine: { lineStyle: { color: 'rgba(150, 163, 184, 0.45)' } },
    },
    series: series as any,
    animationDuration: 500,
    animationEasing: 'cubicOut',
  };
}

const CapabilityRadarChart: React.FC<CapabilityRadarChartProps> = ({
  score,
  loading = false,
}) => {
  const [enlarged, setEnlarged] = useState(false);

  const option = useMemo(() => {
    if (!score) return null;
    return buildRadarOption(score);
  }, [score]);

  const largeOption = useMemo(() => {
    if (!score) return null;
    return buildRadarOption(score);
  }, [score]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-foreground">能力雷达图</h3>
        </div>
        <Skeleton className="h-[340px] w-full" />
      </div>
    );
  }

  if (!score || !option) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-foreground">能力雷达图</h3>
        </div>
        <div className="flex items-center justify-center h-[340px] text-sm text-muted-foreground">
          暂无评估数据
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-foreground">能力雷达图</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-[#1E6FEB] inline-block" />
            本评估期
          </span>
          {score.compare && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0 border-t border-dashed border-[#9AA7BD] inline-block" />
              {score.compare.type === 'mom' ? '环比' : '同比'}
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setEnlarged(true)}>
            放大
          </Button>
        </div>
      </div>
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ height: 360, width: '100%' }}
      />
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>能力雷达图（放大）</DialogTitle>
          </DialogHeader>
          {largeOption && (
            <ReactECharts
              option={largeOption}
              notMerge
              lazyUpdate
              style={{ height: 560, width: '100%' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CapabilityRadarChart;
