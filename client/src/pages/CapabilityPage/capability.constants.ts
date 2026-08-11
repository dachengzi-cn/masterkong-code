import type { CapabilityScoreLevel } from '@shared/api.interface';

/** 维度能力等级 → 颜色（与后端 registry 一致，AGENTS.md 语义色） */
export const CAPABILITY_SCORE_LEVEL_COLORS: Record<CapabilityScoreLevel, string> = {
  strength: '#2FA36B',
  medium: '#E9A12B',
  weak: '#E14A3B',
};

/** 维度能力等级 → 中文标签 */
export const CAPABILITY_SCORE_LEVEL_LABELS: Record<CapabilityScoreLevel, string> = {
  strength: '优势',
  medium: '中等',
  weak: '短板',
};

/** 战力总等级颜色（与后端 registry 一致） */
export const CAPABILITY_TOTAL_LEVEL_COLORS: Record<string, string> = {
  S: '#2FA36B',
  A: '#1E6FEB',
  B: '#E9A12B',
  C: '#E14A3B',
};

/** 雷达图基准色（品牌蓝） */
export const CAPABILITY_PRIMARY_COLOR = '#1E6FEB';

/** 雷达图对比期颜色 */
export const CAPABILITY_COMPARE_COLOR = '#9AA7BD';

/** 权重弹窗提示文案 */
export const CAPABILITY_WEIGHT_HINT =
  '权重总和应为 100%，修改后将对所有评估对象生效。';
