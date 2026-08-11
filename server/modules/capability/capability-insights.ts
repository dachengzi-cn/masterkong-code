import type {
  CapabilityDimensionMeta,
  CapabilityDimensionScore,
  CapabilityInsightsResult,
  CapabilityStrengthWeakness,
  CapabilityTotalLevel,
} from '@shared/api.interface';

/**
 * 业务综合能力评估 —— 解读与建议
 * 规则驱动：优势 = 得分最高的启用优势维度（Top2）；短板 = 得分最低的短板维度（最低 2 项）；
 * 结论 = 总分 + 战力等级 + 趋势；建议 = 短板维度的注册表建议文案组合。
 */

export interface InsightsInput {
  /** 评估对象名称（所别/业代） */
  objectName: string;
  scores: CapabilityDimensionScore[];
  dims: CapabilityDimensionMeta[];
  totalScore: number;
  totalLevel: CapabilityTotalLevel;
  compare: {
    type: 'mom' | 'yoy';
    label: string;
    totalScore: number | null;
  } | null;
}

export function buildInsights(input: InsightsInput): CapabilityInsightsResult {
  const { scores, dims, totalScore, totalLevel, objectName, compare } = input;

  const enabledDims = dims.filter((d) => d.enabled);

  // 优势：等级为 strength（得分 ≥ 阈值）中得分最高的 2 项
  const strengths: CapabilityStrengthWeakness[] = scores
    .filter((s) => s.level === 'strength')
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((s) => ({
      key: s.key,
      name: s.name,
      score: s.score,
      level: s.level,
      reason: `${s.name}得分 ${s.score} 分，处于组内优势水平${s.rawLabel ? `（${s.rawLabel}）` : ''}`,
    }));

  // 短板：等级为 weak（得分 < 阈值）中得分最低的 2 项
  const weaknesses: CapabilityStrengthWeakness[] = scores
    .filter((s) => s.level === 'weak')
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((s) => {
      const dim = enabledDims.find((d) => d.key === s.key);
      return {
        key: s.key,
        name: s.name,
        score: s.score,
        level: s.level,
        reason: `${s.name}得分 ${s.score} 分，处于短板水平${s.rawLabel ? `（${s.rawLabel}）` : ''}`,
        suggestion: dim?.suggestionText,
      };
    });

  // 趋势
  let trend: 'up' | 'down' | 'flat' = 'flat';
  let trendText = '';
  if (compare && compare.totalScore != null) {
    const diff = Math.round((totalScore - compare.totalScore) * 10) / 10;
    if (diff > 0.05) {
      trend = 'up';
      trendText = `较${compare.type === 'mom' ? '上月' : '去年同期'}（${compare.label}）提升 ${diff} 分`;
    } else if (diff < -0.05) {
      trend = 'down';
      trendText = `较${compare.type === 'mom' ? '上月' : '去年同期'}（${compare.label}）下降 ${Math.abs(diff)} 分`;
    } else {
      trendText = `与${compare.type === 'mom' ? '上月' : '去年同期'}（${compare.label}）基本持平`;
    }
  } else if (scores.length > 0) {
    trendText = '未选择对比期，仅展示当期水平';
  }

  // 评估结论
  const weakNames = weaknesses.map((w) => w.name);
  const strongNames = strengths.map((s) => s.name);
  let summary = `${objectName}综合战力 ${totalScore} 分，等级「${totalLevel.label}」；${trendText}。`;
  if (strengths.length > 0) {
    summary += `核心优势集中在${strongNames.join('、')}。`;
  }
  if (weaknesses.length > 0) {
    summary += `关键短板为${weakNames.join('、')}，需优先改善。`;
  } else {
    summary += '各维度表现均衡，无明显短板。';
  }

  // 改进建议
  const suggestions: string[] = [];
  for (const w of weaknesses) {
    if (w.suggestion) suggestions.push(`【${w.name}】${w.suggestion}`);
  }
  if (weaknesses.length === 0 && totalScore >= 85) {
    suggestions.push('整体表现卓越，建议沉淀优势打法并输出标杆案例供团队复制。');
  }
  if (weaknesses.length === 0 && totalScore >= 70 && totalScore < 85) {
    suggestions.push('整体表现良好，建议在保持优势维度的同时挖掘细节改善空间。');
  }
  if (weaknesses.length === 0 && totalScore < 70) {
    suggestions.push('各维度得分中等偏下，建议从权重最高的维度入手系统性提升。');
  }

  return { summary, trend, strengths, weaknesses, suggestions };
}
