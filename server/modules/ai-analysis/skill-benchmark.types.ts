/**
 * M3-2 Skill 基准体系 - 类型定义
 * 数据预处理 / 结果校验 / 评估反馈
 */

// ========== M3-2a: 数据预处理 ==========

/** 数据质量等级 */
export type DataQualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'empty';

/** 数据预处理报告 */
export interface DataPreprocessReport {
  /** 质量等级 */
  quality: DataQualityLevel;
  /** 总分 0-100 */
  score: number;
  /** 数据条目数（如果可识别） */
  recordCount: number;
  /** 字段数 */
  fieldCount: number;
  /** 检测到的异常列表 */
  anomalies: DataAnomaly[];
  /** 数据摘要（供模型理解的精简描述） */
  summary: string;
  /** 预处理后的规范化数据 */
  normalizedData: Record<string, unknown>;
  /** 预处理警告（不阻塞执行） */
  warnings: string[];
  /** 预处理错误（阻塞执行） */
  errors: string[];
}

/** 数据异常项 */
export interface DataAnomaly {
  type:
    | 'empty_dataset'
    | 'missing_required_field'
    | 'type_mismatch'
    | 'outlier'
    | 'duplicate_key'
    | 'invalid_value'
    | 'data_truncated'
    | 'inconsistent_format';
  field?: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

// ========== M3-2b: 结果校验 ==========

/** 校验结果等级 */
export type ValidationLevel = 'pass' | 'warning' | 'error';

/** 结果校验报告 */
export interface OutputValidationReport {
  /** 总体校验等级 */
  level: ValidationLevel;
  /** 校验通过的字段数 */
  passedFields: number;
  /** 校验失败的字段数 */
  failedFields: number;
  /** 警告数量 */
  warningCount: number;
  /** 字段级校验详情 */
  fieldResults: FieldValidationResult[];
  /** 修复后的输出（自动填充缺失字段） */
  repairedOutput: Record<string, unknown>;
  /** 校验错误信息 */
  errors: string[];
  /** 校验警告信息 */
  warnings: string[];
}

/** 字段级校验结果 */
export interface FieldValidationResult {
  field: string;
  level: ValidationLevel;
  expectedType?: string;
  actualType?: string;
  message: string;
  repaired?: boolean;
}

// ========== M3-2c: 评估反馈 ==========

/** 反馈维度 */
export type FeedbackDimension = 'accuracy' | 'completeness' | 'usefulness' | 'clarity';

/** 反馈问题类型 */
export type FeedbackIssueType =
  | 'missing_analysis'
  | 'wrong_data'
  | 'format_issue'
  | 'too_generic'
  | 'too_verbose'
  | 'other';

/** 提交反馈请求 */
export interface SubmitFeedbackRequest {
  sessionId: string;
  /** 1-5 评分 */
  rating: number;
  /** 维度评分（1-5），可选 */
  dimensions?: Partial<Record<FeedbackDimension, number>>;
  /** 文本反馈 */
  comment?: string;
  /** 标记的问题类型 */
  issues?: FeedbackIssueType[];
}

/** 反馈记录 */
export interface FeedbackRecord {
  id: string;
  sessionId: string;
  skillKey: string;
  pageScope: string;
  rating: number;
  dimensions: Partial<Record<FeedbackDimension, number>>;
  comment: string | null;
  issues: FeedbackIssueType[];
  isConsumed: boolean;
  createdAt: string;
}

/** Skill 性能指标 */
export interface SkillMetricRecord {
  skillKey: string;
  period: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  /** 成功率 0-100 */
  successRate: number;
  schemaValidPasses: number;
  schemaValidFailures: number;
  /** Schema 校验通过率 0-100 */
  schemaValidRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTotalTokens: number;
  totalFeedbacks: number;
  avgRating: number;
  ratingDistribution: Record<string, number>;
  issueDistribution: Record<string, number>;
  lastExecutionAt: string | null;
  lastCalculatedAt: string;
}

/** Skill 迭代记录 */
export interface SkillIterationRecord {
  id: string;
  skillKey: string;
  fromVersion: number;
  toVersion: number;
  iterationType: 'manual' | 'auto-feedback' | 'auto-ab-test';
  reason: string;
  changesSummary: Record<string, unknown>;
  consumedFeedbackIds: string[];
  createdAt: string;
}

/** Skill 迭代建议（基于反馈自动生成） */
export interface SkillIterationSuggestion {
  skillKey: string;
  /** 触发迭代的反馈数量 */
  feedbackCount: number;
  /** 平均评分 */
  avgRating: number;
  /** 建议的迭代类型 */
  suggestedType: 'auto-feedback' | 'manual';
  /** 建议原因 */
  reason: string;
  /** 建议的 prompt 优化方向 */
  promptSuggestions: string[];
  /** 建议的 schema 调整 */
  schemaSuggestions: string[];
  /** 待消费的反馈 ID 列表 */
  feedbackIds: string[];
}
