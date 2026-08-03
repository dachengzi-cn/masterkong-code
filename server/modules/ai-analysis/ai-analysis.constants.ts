import type { SkillDefinition } from './ai-analysis.types';

/**
 * 内置 Skill 定义：覆盖五大分析页面
 * 每个 Skill 包含提示词模板、输出 schema、默认参数
 */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  // ========== 累计成交分析 ==========
  {
    skillKey: 'cumulative-conversion-analysis',
    name: '累计成交分析',
    description: '分析累计成交率趋势、业代排名、未成交门店与异常波动',
    pageScope: 'dashboard/cumulative',
    promptTemplate: `你是一位专业的快消品数据分析专家。请基于以下累计成交分析数据，进行深度洞察。

## 分析任务
1. **整体趋势**：总结累计成交率的变化趋势，识别增长/下滑拐点
2. **业代排名**：分析 top/bottom 业代的表现差异，找出关键驱动因素
3. **异常波动**：识别成交率突变（日环比 >15%）的日期与可能原因
4. **未成交门店**：统计未成交门店分布，给出优先跟进建议
5. **行动建议**：基于以上分析给出 3-5 条可执行的业务行动建议

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "trendAnalysis": "趋势分析文字描述",
  "topPerformers": [{"name": "业代名", "rate": "成交率", "insight": "表现原因分析"}],
  "bottomPerformers": [{"name": "业代名", "rate": "成交率", "issue": "问题分析"}],
  "anomalies": [{"date": "日期", "change": "变化幅度", "possibleCause": "可能原因"}],
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`,
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        trendAnalysis: { type: 'string' },
        topPerformers: { type: 'array' },
        bottomPerformers: { type: 'array' },
        anomalies: { type: 'array' },
        recommendations: { type: 'array' },
        riskAlerts: { type: 'array' },
      },
    },
    maxTokens: 4096,
  },

  // ========== 当日成交分析 ==========
  {
    skillKey: 'daily-conversion-analysis',
    name: '当日成交分析',
    description: '分析每日成交率波动、周末效应与最佳/最差营业日',
    pageScope: 'dashboard/daily',
    promptTemplate: `你是一位专业的快消品数据分析专家。请基于以下当日成交分析数据，进行深度洞察。

## 分析任务
1. **日成交率走势**：总结每日成交率走势，识别周末/工作日差异
2. **最佳/最差营业日**：找出成交率最高和最低的日期，分析原因
3. **业代日维度表现**：分析哪些业代在特定日期表现突出或落后
4. **成交节奏**：分析月内成交节奏（上旬/中旬/下旬）的变化规律
5. **行动建议**：基于以上分析给出 3-5 条可执行的业务行动建议

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "dailyTrend": "日成交率走势分析",
  "bestDay": {"date": "日期", "rate": "成交率", "reason": "原因分析"},
  "worstDay": {"date": "日期", "rate": "成交率", "reason": "原因分析"},
  "weekendEffect": "周末效应分析",
  "rhythmAnalysis": "月内成交节奏分析",
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`,
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        dailyTrend: { type: 'string' },
        bestDay: { type: 'object' },
        worstDay: { type: 'object' },
        weekendEffect: { type: 'string' },
        rhythmAnalysis: { type: 'string' },
        recommendations: { type: 'array' },
        riskAlerts: { type: 'array' },
      },
    },
    maxTokens: 4096,
  },

  // ========== 品牌 & 规格分析 ==========
  {
    skillKey: 'brand-spec-analysis',
    name: '品牌规格分析',
    description: '分析品牌与规格的成交覆盖、组合优化与机会品类',
    pageScope: 'dashboard/brand-spec',
    promptTemplate: `你是一位专业的快消品品类管理专家。请基于以下品牌 & 规格成交分析数据，进行深度洞察。

## 分析任务
1. **品牌成交概览**：各品牌成交门店数与覆盖率分析
2. **规格成交概览**：各规格成交门店数与覆盖率分析
3. **品牌-规格组合**：识别高潜力组合与薄弱组合
4. **机会品类**：找出覆盖率低但潜力大的品牌/规格，给出推广建议
5. **行动建议**：基于以上分析给出 3-5 条可执行的品类行动建议

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "brandOverview": [{"brand": "品牌名", "storeCount": "成交门店数", "coverage": "覆盖率", "insight": "分析"}],
  "specOverview": [{"spec": "规格名", "storeCount": "成交门店数", "coverage": "覆盖率", "insight": "分析"}],
  "topCombinations": [{"brand": "品牌", "spec": "规格", "strength": "组合强度", "opportunity": "机会分析"}],
  "opportunityCategories": [{"category": "品牌/规格", "potential": "潜力评分", "action": "推广建议"}],
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`,
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        brandOverview: { type: 'array' },
        specOverview: { type: 'array' },
        topCombinations: { type: 'array' },
        opportunityCategories: { type: 'array' },
        recommendations: { type: 'array' },
        riskAlerts: { type: 'array' },
      },
    },
    maxTokens: 4096,
  },

  // ========== 临期费用分析 ==========
  {
    skillKey: 'expiry-expense-analysis',
    name: '临期费用分析',
    description: '分析临期费用金额趋势、区域分布、规格集中度与风险预警',
    pageScope: 'expense/expiry',
    promptTemplate: `你是一位专业的快消品费用管理专家。请基于以下临期费用分析数据，进行深度洞察。

## 分析任务
1. **费用趋势**：总结临期费用月度变化趋势，识别环比异常增长
2. **区域分布**：分析各区域/所别临期费用占比与排名
3. **规格集中度**：识别临期费用 Top 规格及其占比变化
4. **超 500 元门店**：分析超 500 元临期费用门店的分布与月度变化
5. **风险预警**：基于数据识别高/中/低风险区域或规格
6. **行动建议**：给出 3-5 条可执行的费用管控建议

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "trendAnalysis": "费用趋势分析",
  "regionDistribution": [{"region": "区域", "amount": "金额", "share": "占比", "momChange": "环比变化", "insight": "分析"}],
  "specConcentration": [{"spec": "规格", "amount": "金额", "share": "占比", "trend": "趋势"}],
  "over500Analysis": "超500元门店分析",
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`,
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        trendAnalysis: { type: 'string' },
        regionDistribution: { type: 'array' },
        specConcentration: { type: 'array' },
        over500Analysis: { type: 'string' },
        recommendations: { type: 'array' },
        riskAlerts: { type: 'array' },
      },
    },
    maxTokens: 4096,
  },

  // ========== ATP 费用分析 ==========
  {
    skillKey: 'atp-expense-analysis',
    name: 'ATP费用分析',
    description: '分析ATP投入费比、付费点销额占比与业代绩效分布',
    pageScope: 'expense/atp',
    promptTemplate: `你是一位专业的快消品通路营销费用管理专家。请基于以下ATP费用绩效分析数据，进行深度洞察。

## 分析任务
1. **费用效率概览**：分析整体投入费比与付费点销额占比水平
2. **费比分布**：分析费比 ≤10% / 10-15% / >15% / 未成交 的分布情况
3. **业代绩效排名**：识别费比最优和最差的业代，分析差异原因
4. **销额分层**：分析销额 <1000 / 1000-2000 / >2000 的付费点分布
5. **异常预警**：识别费比过高或销额过低的异常业代/门店
6. **行动建议**：给出 3-5 条可执行的ATP费用优化建议

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "efficiencyOverview": "费用效率概览",
  "feeRatioDistribution": {"le10": "占比", "between10to15": "占比", "gt15": "占比", "noDeal": "占比", "analysis": "分布分析"},
  "topPerformers": [{"name": "业代名", "feeRatio": "费比", "salesRatio": "销额占比", "insight": "分析"}],
  "bottomPerformers": [{"name": "业代名", "feeRatio": "费比", "issue": "问题分析"}],
  "salesLayer": {"lt1000": "数量", "lt2000": "数量", "gt2000": "数量", "analysis": "分层分析"},
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`,
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        efficiencyOverview: { type: 'string' },
        feeRatioDistribution: { type: 'object' },
        topPerformers: { type: 'array' },
        bottomPerformers: { type: 'array' },
        salesLayer: { type: 'object' },
        recommendations: { type: 'array' },
        riskAlerts: { type: 'array' },
      },
    },
    maxTokens: 4096,
  },
];

/** 协同模式枚举 */
export const COLLABORATION_MODES = {
  INDEPENDENT: 'independent',
  ENSEMBLE: 'ensemble',
  PLANNER_EXECUTOR_CRITIC: 'planner-executor-critic',
} as const;

export type CollaborationMode = typeof COLLABORATION_MODES[keyof typeof COLLABORATION_MODES];

/** 规划-执行-评判模式的系统提示词 */
export const PLANNER_SYSTEM_PROMPT = `你是一位数据分析规划专家。你的任务是：
1. 分析用户的数据分析需求
2. 将需求拆解为具体的分析步骤
3. 为每个步骤定义预期输出
请以 JSON 格式返回分析计划：
{
  "steps": [{"id": 1, "description": "步骤描述", "expectedOutput": "预期输出", "focusMetrics": ["关注指标"]}],
  "dataRequirements": ["需要的数据字段"],
  "priorityAreas": ["优先分析领域"]
}`;

export const CRITIC_SYSTEM_PROMPT = `你是一位数据分析质量评审专家。你的任务是：
1. 审查分析结果的准确性与完整性
2. 识别可能的遗漏或错误
3. 提供改进建议
请以 JSON 格式返回评审结果：
{
  "qualityScore": 1-10,
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "improvements": ["改进建议1", "改进建议2"],
  "finalAssessment": "最终评估"
}`;
