import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

// ========== 类型定义 ==========

export type CollaborationMode = 'independent' | 'ensemble' | 'planner-executor-critic';

export interface AiSkillItem {
  id: string;
  skillKey: string;
  name: string;
  description: string | null;
  pageScope: string;
  promptTemplate: string;
  outputSchema: Record<string, unknown>;
  maxTokens: number;
  isBuiltin: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetSkillsResponse {
  items: AiSkillItem[];
}

/** 模块注册表（技能↔模块映射） */
export interface ModuleRegistrySkill {
  id: string;
  skillKey: string;
  name: string;
  version: number;
  isBuiltin: boolean;
  updatedAt: string;
}

export interface ModuleRegistryModule {
  pageScope: string;
  name: string;
  icon: string;
  description: string;
  skills: ModuleRegistrySkill[];
}

export interface ModuleRegistryGroup {
  groupId: string;
  groupName: string;
  icon: string;
  modules: ModuleRegistryModule[];
}

export interface GetModuleMappingResponse {
  groups: ModuleRegistryGroup[];
}

export interface AnalysisConfig {
  collaborationMode: CollaborationMode;
  defaultConfigKey?: string;
  ensembleConfigKeys: string[];
  plannerConfigKey?: string;
  executorConfigKey?: string;
  criticConfigKey?: string;
  isEnabled: boolean;
}

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

export interface AnalysisExecutionResult {
  sessionId: string;
  skillKey: string;
  pageScope: string;
  collaborationMode: CollaborationMode;
  status: 'completed' | 'failed';
  results: ModelCallResult[];
  finalOutput: Record<string, unknown>;
  planOutput?: Record<string, unknown> | null;
  criticOutput?: Record<string, unknown> | null;
  errorMessage?: string;
  latencyMs: number;
  totalUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface InlineModelConfig {
  configKey: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AnalysisExecutionRequest {
  skillKey: string;
  pageScope: string;
  inputData: Record<string, unknown>;
  userQuestion?: string;
  collaborationMode?: CollaborationMode;
  configKeys?: string[];
  inlineModelConfigs?: InlineModelConfig[];
}

export interface SessionHistoryItem {
  id: string;
  skillKey: string;
  pageScope: string;
  collaborationMode: string;
  configKeys: string[];
  userQuestion: string | null;
  status: string;
  errorMessage: string | null;
  latencyMs: number | null;
  usage: Record<string, unknown> | null;
  createdAt: string;
}

export interface SessionHistoryResponse {
  items: SessionHistoryItem[];
}

export interface SessionDetail {
  id: string;
  skillKey: string;
  pageScope: string;
  collaborationMode: string;
  configKeys: string[];
  inputData: Record<string, unknown>;
  userQuestion: string | null;
  outputData: Record<string, unknown>;
  status: string;
  errorMessage: string | null;
  latencyMs: number | null;
  usage: Record<string, unknown> | null;
  createdAt: string;
}

// ========== API 函数 ==========

/** 获取所有已启用的 Skill */
export async function getSkills(): Promise<GetSkillsResponse> {
  const res = await axiosForBackend({ url: '/api/ai-analysis/skills', method: 'GET' });
  return res.data as GetSkillsResponse;
}

/** 按页面获取 Skill */
export async function getSkillsByPage(pageScope: string): Promise<GetSkillsResponse> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/page/${encodeURIComponent(pageScope)}`,
    method: 'GET',
  });
  return res.data as GetSkillsResponse;
}

/** 获取模块注册表与技能映射关系 */
export async function getModuleMapping(): Promise<GetModuleMappingResponse> {
  const res = await axiosForBackend({ url: '/api/ai-analysis/modules', method: 'GET' });
  return res.data as GetModuleMappingResponse;
}

/** 更新 Skill */
export async function updateSkill(
  skillKey: string,
  data: {
    promptTemplate?: string;
    outputSchema?: Record<string, unknown>;
    maxTokens?: number;
    name?: string;
    description?: string;
  },
): Promise<{ item: AiSkillItem }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/${encodeURIComponent(skillKey)}`,
    method: 'PUT',
    data,
  });
  return res.data as { item: AiSkillItem };
}

/** 获取分析配置 */
export async function getAnalysisConfig(): Promise<AnalysisConfig> {
  const res = await axiosForBackend({ url: '/api/ai-analysis/config', method: 'GET' });
  return res.data as AnalysisConfig;
}

/** 更新分析配置 */
export async function updateAnalysisConfig(
  data: Partial<AnalysisConfig>,
): Promise<AnalysisConfig> {
  const res = await axiosForBackend({
    url: '/api/ai-analysis/config',
    method: 'PUT',
    data,
  });
  return res.data as AnalysisConfig;
}

/** 执行分析任务 */
export async function executeAnalysis(
  data: AnalysisExecutionRequest,
): Promise<AnalysisExecutionResult> {
  const res = await axiosForBackend({
    url: '/api/ai-analysis/execute',
    method: 'POST',
    data,
  });
  return res.data as AnalysisExecutionResult;
}

/** 获取分析会话历史 */
export async function getSessionHistory(
  pageScope?: string,
  limit?: number,
): Promise<SessionHistoryResponse> {
  const params: Record<string, string> = {};
  if (pageScope) params.pageScope = pageScope;
  if (limit) params.limit = String(limit);
  const res = await axiosForBackend({
    url: '/api/ai-analysis/sessions',
    method: 'GET',
    params,
  });
  return res.data as SessionHistoryResponse;
}

/** 获取单个会话详情 */
export async function getSessionById(sessionId: string): Promise<{ item: SessionDetail }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/sessions/${encodeURIComponent(sessionId)}`,
    method: 'GET',
  });
  return res.data as { item: SessionDetail };
}

/** 删除单个分析会话记录 */
export async function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/sessions/${encodeURIComponent(sessionId)}`,
    method: 'DELETE',
  });
  return res.data as { deleted: boolean };
}

/** 批量删除指定页面的分析会话记录 */
export async function deleteSessionsByPage(pageScope: string): Promise<{ deleted: number }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/sessions?pageScope=${encodeURIComponent(pageScope)}`,
    method: 'DELETE',
  });
  return res.data as { deleted: number };
}

// ========== M3-2: Skill 基准体系 - 评估反馈 ==========

export type FeedbackDimension = 'accuracy' | 'completeness' | 'usefulness' | 'clarity';

export type FeedbackIssueType =
  | 'missing_analysis'
  | 'wrong_data'
  | 'format_issue'
  | 'too_generic'
  | 'too_verbose'
  | 'other';

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

export interface SkillMetricRecord {
  skillKey: string;
  period: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  schemaValidPasses: number;
  schemaValidFailures: number;
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

export interface SkillIterationSuggestion {
  skillKey: string;
  feedbackCount: number;
  avgRating: number;
  suggestedType: 'auto-feedback' | 'manual';
  reason: string;
  promptSuggestions: string[];
  schemaSuggestions: string[];
  feedbackIds: string[];
}

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

/** 提交反馈 */
export async function submitFeedback(
  sessionId: string,
  data: {
    rating: number;
    dimensions?: Partial<Record<FeedbackDimension, number>>;
    comment?: string;
    issues?: FeedbackIssueType[];
  },
): Promise<{ item: FeedbackRecord }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/sessions/${encodeURIComponent(sessionId)}/feedback`,
    method: 'POST',
    data,
  });
  return res.data as { item: FeedbackRecord };
}

/** 获取会话的反馈 */
export async function getFeedback(sessionId: string): Promise<{ item: FeedbackRecord | null }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/sessions/${encodeURIComponent(sessionId)}/feedback`,
    method: 'GET',
  });
  return res.data as { item: FeedbackRecord | null };
}

/** 获取 Skill 的反馈列表 */
export async function getFeedbacksBySkill(
  skillKey: string,
  limit?: number,
): Promise<{ items: FeedbackRecord[] }> {
  const params: Record<string, string> = {};
  if (limit) params.limit = String(limit);
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/${encodeURIComponent(skillKey)}/feedbacks`,
    method: 'GET',
    params,
  });
  return res.data as { items: FeedbackRecord[] };
}

/** 获取单个 Skill 的性能指标 */
export async function getSkillMetric(
  skillKey: string,
): Promise<{ item: SkillMetricRecord | null }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/${encodeURIComponent(skillKey)}/metrics`,
    method: 'GET',
  });
  return res.data as { item: SkillMetricRecord | null };
}

/** 获取所有 Skill 的性能指标概览 */
export async function getAllSkillMetrics(): Promise<{ items: SkillMetricRecord[] }> {
  const res = await axiosForBackend({
    url: '/api/ai-analysis/metrics/overview',
    method: 'GET',
  });
  return res.data as { items: SkillMetricRecord[] };
}

/** 生成 Skill 迭代建议 */
export async function getIterationSuggestion(
  skillKey: string,
): Promise<{ item: SkillIterationSuggestion | null }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/${encodeURIComponent(skillKey)}/iteration-suggestion`,
    method: 'GET',
  });
  return res.data as { item: SkillIterationSuggestion | null };
}

/** 获取 Skill 迭代历史 */
export async function getIterationHistory(
  skillKey: string,
): Promise<{ items: SkillIterationRecord[] }> {
  const res = await axiosForBackend({
    url: `/api/ai-analysis/skills/${encodeURIComponent(skillKey)}/iterations`,
    method: 'GET',
  });
  return res.data as { items: SkillIterationRecord[] };
}

// ========== M3-3: 结构化 Pipeline ==========

export type PipelineStage =
  | 'intent_parse'
  | 'data_resolve'
  | 'preprocess'
  | 'skill_match'
  | 'prompt_build'
  | 'model_execute'
  | 'validate'
  | 'postprocess';

export type StageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  durationMs: number;
  output?: Record<string, unknown>;
  warnings?: string[];
  error?: string;
}

export interface PipelineContext {
  request: AnalysisExecutionRequest;
  stages: StageResult[];
  status: 'running' | 'completed' | 'failed';
  startTime: number;
  totalDurationMs?: number;
}

export interface PipelineStageDefinition {
  stage: PipelineStage;
  label: string;
  description: string;
}

export interface PipelineConfig {
  skipPreprocess?: boolean;
  skipValidate?: boolean;
  continueOnPreprocessError?: boolean;
  useRepairedOutput?: boolean;
}

/** 执行结构化 Pipeline 分析 */
export async function executePipeline(
  data: AnalysisExecutionRequest & { pipelineConfig?: PipelineConfig },
): Promise<AnalysisExecutionResult & { pipeline: PipelineContext }> {
  const res = await axiosForBackend({
    url: '/api/ai-analysis/pipeline/execute',
    method: 'POST',
    data,
  });
  return res.data as AnalysisExecutionResult & { pipeline: PipelineContext };
}

/** 获取 Pipeline 阶段定义 */
export async function getPipelineStages(): Promise<{ items: PipelineStageDefinition[] }> {
  const res = await axiosForBackend({
    url: '/api/ai-analysis/pipeline/stages',
    method: 'GET',
  });
  return res.data as { items: PipelineStageDefinition[] };
}
