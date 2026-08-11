import type {
  CapabilityDimensionScore,
  CapabilityScoreLevel,
} from '@shared/api.interface';
import {
  CAPABILITY_SCORE_LEVEL_COLORS,
  CAPABILITY_SCORE_LEVEL_LABELS,
} from './capability.constants';

/** 得分保留 1 位小数展示 */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(1);
}

/** 原始值展示（后端 rawLabel 优先，缺失时数字格式化为千分位） */
export function formatRawValue(
  score: CapabilityDimensionScore,
): string {
  if (score.rawLabel) return score.rawLabel;
  if (score.rawValue === null || score.rawValue === undefined) return '—';
  return Math.round(score.rawValue).toLocaleString('zh-CN');
}

/** 环比/同比差值：+1.5 / -2.3 / 0 */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const fixed = value.toFixed(1);
  return value > 0 ? `+${fixed}` : fixed;
}

/** 维度等级标签底色（半透明），配合 levelColor 文字色使用 */
export function levelBadgeClass(level: CapabilityScoreLevel): string {
  return {
    strength: 'bg-[hsl(152,60%,42%)]/10',
    medium: 'bg-[hsl(38,85%,48%)]/10',
    weak: 'bg-[hsl(4,72%,52%)]/10',
  }[level];
}

/** 维度等级展示色（十六进制） */
export function levelColor(level: CapabilityScoreLevel): string {
  return CAPABILITY_SCORE_LEVEL_COLORS[level];
}

/** 维度等级中文标签 */
export function levelLabel(level: CapabilityScoreLevel): string {
  return CAPABILITY_SCORE_LEVEL_LABELS[level];
}

/** 对比类型 → 中文标签 */
export function compareTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'mom':
      return '环比';
    case 'yoy':
      return '同比';
    default:
      return '无对比';
  }
}
