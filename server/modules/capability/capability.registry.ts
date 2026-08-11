import type { CapabilityDimensionMeta, CapabilityTotalLevel } from '@shared/api.interface';

/**
 * 业务综合能力评估 —— 维度注册表（单一事实来源）
 *
 * 后续新增评估指标时，只需在 CAPABILITY_DIMENSIONS 中追加一条定义，
 * 并在 capability-analyzer.ts 的 buildObjectRawMetrics 中补充对应原始指标聚合逻辑，
 * 前端无需改动即可自动展示新维度。
 */

export type CapabilityDimensionKey =
  | 'sales_achievement'
  | 'item_distribution'
  | 'atp_performance'
  | 'expiry_control'
  | 'service_coverage'
  | 'deal_conversion'
  | 'store_productivity'
  | 'customer_structure';

export interface CapabilityDimensionDefinition {
  key: CapabilityDimensionKey;
  name: string;
  description: string;
  /** 正向 = 越高越好；反向 = 越低越好 */
  direction: 'up' | 'down';
  dataSource: string;
  calcMethod: string;
  standardization: string;
  unit?: string;
  defaultWeight: number;
  thresholdHigh: number;
  thresholdLow: number;
  sortOrder: number;
  /** 短板时的改进建议文案 */
  suggestionText: string;
}

export const CAPABILITY_DIMENSIONS: CapabilityDimensionDefinition[] = [
  {
    key: 'sales_achievement',
    name: '业绩达成',
    description: '评估区间内客户销额合计的组内相对水平',
    direction: 'up',
    dataSource: '费用资料-客户销额',
    calcMethod: '区间内该对象负责客户的销额（回单金额/客户销额/门店销额/销额）求和',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '元',
    defaultWeight: 0.18,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 1,
    suggestionText: '聚焦高潜客户提升订单频次与客单价，扩大核心品项销额占比',
  },
  {
    key: 'item_distribution',
    name: '品项铺货率',
    description: '成交覆盖规格数占全量在售规格数的比例',
    direction: 'up',
    dataSource: '成交数据集',
    calcMethod: '区间内对象成交去重规格数 ÷ 全量去重规格数',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '%',
    defaultWeight: 0.13,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 2,
    suggestionText: '针对未铺货的畅销规格制定二次铺货计划，结合促销政策推动品项渗透',
  },
  {
    key: 'atp_performance',
    name: 'ATP 投入绩效',
    description: '付费点销额占比与付费点费比健康度的综合表现',
    direction: 'up',
    dataSource: '客户资料 + 费用资料-客户销额/ATP费用',
    calcMethod: '付费点销额占比 × 0.6 + 付费点费比（≤10% 占比）× 0.4',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '分',
    defaultWeight: 0.15,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 3,
    suggestionText: '优化付费点资源配置，将 ATP 费用向费比健康、产出高的客户倾斜',
  },
  {
    key: 'expiry_control',
    name: '临期品管控',
    description: '临期金额占销额比例（越低越好）',
    direction: 'down',
    dataSource: '费用资料-临期记录 + 客户销额',
    calcMethod: '区间内临期金额合计 ÷ 销额合计',
    standardization: '反向维度：同层组横向百分位取 100 - 百分位（0~100 分）',
    unit: '%',
    defaultWeight: 0.12,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 4,
    suggestionText: '加强临期品预警与退货协同，推动门店先进先出与促销消化',
  },
  {
    key: 'service_coverage',
    name: '服务覆盖率',
    description: '付费点数占总点数的比例',
    direction: 'up',
    dataSource: '客户资料',
    calcMethod: '对象负责客户付费点数合计 ÷ 总点数合计',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '%',
    defaultWeight: 0.13,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 5,
    suggestionText: '扩大付费服务客户基数，将优质服务资源向高价值门店覆盖',
  },
  {
    key: 'deal_conversion',
    name: '成交转化率',
    description: '区间内有成交记录的客户占负责客户总数的比例',
    direction: 'up',
    dataSource: '成交数据集 + 客户资料',
    calcMethod: '区间内成交去重客户数 ÷ 负责客户总数',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '%',
    defaultWeight: 0.12,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 6,
    suggestionText: '针对长期未成交客户建立跟进机制，提升拜访转化效率',
  },
  {
    key: 'store_productivity',
    name: '单店产出',
    description: '平均每个服务点的销额贡献',
    direction: 'up',
    dataSource: '费用资料-客户销额 + 客户资料',
    calcMethod: '销额合计 ÷ 总点数合计',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '元/点',
    defaultWeight: 0.09,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 7,
    suggestionText: '识别低产出门店，通过品类结构优化与陈列升级提升单店产出',
  },
  {
    key: 'customer_structure',
    name: '客户结构健康',
    description: '付费客户占比与合作状态良好占比的加权平均',
    direction: 'up',
    dataSource: '客户资料',
    calcMethod: '付费客户占比 × 0.5 + 合作状态良好客户占比 × 0.5',
    standardization: '同层组横向百分位标准化（0~100 分）',
    unit: '分',
    defaultWeight: 0.08,
    thresholdHigh: 75,
    thresholdLow: 60,
    sortOrder: 8,
    suggestionText: '优化客户组合，减少失效/停业客户占比，提升付费客户结构质量',
  },
];

/** 总分战力等级（S ≥85 / A 70~84 / B 55~69 / C <55） */
export const CAPABILITY_TOTAL_LEVELS: CapabilityTotalLevel[] = [
  { code: 'S', label: '卓越', color: '#2FA36B', minScore: 85 },
  { code: 'A', label: '优秀', color: '#1E6FEB', minScore: 70 },
  { code: 'B', label: '良好', color: '#E9A12B', minScore: 55 },
  { code: 'C', label: '待提升', color: '#E14A3B', minScore: 0 },
];

/** 维度等级颜色（与 AGENTS.md 语义色一致） */
export const CAPABILITY_SCORE_LEVEL_COLORS: Record<string, string> = {
  strength: '#2FA36B',
  medium: '#E9A12B',
  weak: '#E14A3B',
};

/** 根据注册表构建默认维度元信息（数据库无配置时使用） */
export function buildDefaultDimensionMetas(): CapabilityDimensionMeta[] {
  return CAPABILITY_DIMENSIONS.map((d) => ({
    key: d.key,
    name: d.name,
    description: d.description,
    dataSource: d.dataSource,
    calcMethod: d.calcMethod,
    standardization: d.standardization,
    unit: d.unit,
    direction: d.direction,
    enabled: true,
    weight: d.defaultWeight,
    thresholdHigh: d.thresholdHigh,
    thresholdLow: d.thresholdLow,
    sortOrder: d.sortOrder,
    suggestionText: d.suggestionText,
  }));
}

export function getDimensionDefinition(key: string): CapabilityDimensionDefinition | undefined {
  return CAPABILITY_DIMENSIONS.find((d) => d.key === key);
}

/** 判断总分所属战力等级 */
export function getTotalLevel(totalScore: number): CapabilityTotalLevel {
  for (const level of CAPABILITY_TOTAL_LEVELS) {
    if (totalScore >= level.minScore) return level;
  }
  return CAPABILITY_TOTAL_LEVELS[CAPABILITY_TOTAL_LEVELS.length - 1];
}

/** 判断维度得分等级：≥thresholdHigh 优势 / ≥thresholdLow 中等 / 其余短板 */
export function classifyScore(
  score: number,
  thresholdHigh: number,
  thresholdLow: number,
): 'strength' | 'medium' | 'weak' {
  if (score >= thresholdHigh) return 'strength';
  if (score >= thresholdLow) return 'medium';
  return 'weak';
}
