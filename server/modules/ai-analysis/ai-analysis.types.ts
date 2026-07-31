/** Skill 定义结构 */
export interface SkillDefinition {
  skillKey: string;
  name: string;
  description?: string;
  pageScope: string;
  promptTemplate: string;
  outputSchema: Record<string, unknown>;
  defaultConfigKey?: string;
  maxTokens?: number;
}

/** 数据库中的 Skill 行（含元数据） */
export interface SkillRecord extends SkillDefinition {
  id: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 协同模式类型 */
export type CollaborationMode = 'independent' | 'ensemble' | 'planner-executor-critic';

/** 内联模型配置（用于前端传递自定义模型参数，无需数据库查找） */
export interface InlineModelConfig {
  configKey: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 分析执行请求 */
export interface AnalysisExecutionRequest {
  /** 要使用的 skill key */
  skillKey: string;
  /** 分析页面来源 */
  pageScope: string;
  /** 输入数据（结构化 JSON） */
  inputData: Record<string, unknown>;
  /** 用户自然语言问题（可选） */
  userQuestion?: string;
  /** 协同模式（覆盖全局配置） */
  collaborationMode?: CollaborationMode;
  /** 指定使用的模型 configKey 列表（覆盖全局配置） */
  configKeys?: string[];
  /** 内联模型配置列表（用于 custom: 前缀的自定义模型，前端直接传递参数） */
  inlineModelConfigs?: InlineModelConfig[];
}

/** 单模型调用结果 */
export interface ModelCallResult {
  configKey: string;
  modelName: string;
  content: string;
  parsedContent: Record<string, unknown> | null;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
}

/** 分析执行结果 */
export interface AnalysisExecutionResult {
  sessionId: string;
  skillKey: string;
  pageScope: string;
  collaborationMode: CollaborationMode;
  status: 'completed' | 'failed';
  /** 独立模式：单个结果；集成模式：多模型结果聚合；规划-执行-评判：含计划与评审 */
  results: ModelCallResult[];
  /** 聚合后的最终分析输出 */
  finalOutput: Record<string, unknown>;
  /** 规划阶段输出（仅 planner-executor-critic 模式） */
  planOutput?: Record<string, unknown> | null;
  /** 评审阶段输出（仅 planner-executor-critic 模式） */
  criticOutput?: Record<string, unknown> | null;
  errorMessage?: string;
  latencyMs?: number;
  totalUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** 分析配置 */
export interface AnalysisConfig {
  collaborationMode: CollaborationMode;
  defaultConfigKey?: string;
  ensembleConfigKeys: string[];
  plannerConfigKey?: string;
  executorConfigKey?: string;
  criticConfigKey?: string;
  isEnabled: boolean;
}
