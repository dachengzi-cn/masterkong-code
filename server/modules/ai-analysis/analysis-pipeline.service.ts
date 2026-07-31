import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { SkillPreprocessor } from './skill-preprocessor';
import { SkillValidator } from './skill-validator';
import type {
  AnalysisExecutionRequest,
  AnalysisExecutionResult,
  SkillRecord,
} from './ai-analysis.types';
import type { DataPreprocessReport, OutputValidationReport } from './skill-benchmark.types';

/**
 * M3-3: 结构化分析 Pipeline
 * 将分析流程拆分为独立阶段，支持阶段级状态跟踪、错误隔离与可配置
 */

/** Pipeline 阶段 */
export type PipelineStage =
  | 'intent_parse'
  | 'data_resolve'
  | 'preprocess'
  | 'skill_match'
  | 'prompt_build'
  | 'model_execute'
  | 'validate'
  | 'postprocess';

/** 阶段状态 */
export type StageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

/** 阶段执行结果 */
export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  /** 阶段执行耗时（毫秒） */
  durationMs: number;
  /** 阶段输出数据 */
  output?: Record<string, unknown>;
  /** 阶段错误信息（非致命） */
  warnings?: string[];
  /** 阶段错误信息（致命） */
  error?: string;
}

/** Pipeline 执行上下文 */
export interface PipelineContext {
  /** 原始请求 */
  request: AnalysisExecutionRequest;
  /** 解析后的 Skill */
  skill?: SkillRecord;
  /** 预处理报告 */
  preprocessReport?: DataPreprocessReport;
  /** 校验报告 */
  validationReport?: OutputValidationReport;
  /** 增强后的输入数据 */
  enhancedInputData?: Record<string, unknown>;
  /** 模型执行结果 */
  executionResult?: AnalysisExecutionResult;
  /** 最终输出 */
  finalOutput?: Record<string, unknown>;
  /** 各阶段执行记录 */
  stages: StageResult[];
  /** Pipeline 整体状态 */
  status: 'running' | 'completed' | 'failed';
  /** Pipeline 开始时间 */
  startTime: number;
  /** Pipeline 总耗时 */
  totalDurationMs?: number;
}

/** Pipeline 配置 */
export interface PipelineConfig {
  /** 是否跳过预处理阶段 */
  skipPreprocess?: boolean;
  /** 是否跳过校验阶段 */
  skipValidate?: boolean;
  /** 预处理失败时是否继续（空数据仍可尝试分析） */
  continueOnPreprocessError?: boolean;
  /** 校验失败时是否使用修复后的输出 */
  useRepairedOutput?: boolean;
}

/**
 * 结构化分析 Pipeline 服务
 * 编排预处理 → 模型执行 → 校验的完整流程，提供阶段级可观测性
 */
@Injectable()
export class AnalysisPipelineService {
  private readonly logger = new Logger(AnalysisPipelineService.name);

  /** 默认 Pipeline 配置 */
  private readonly DEFAULT_CONFIG: PipelineConfig = {
    skipPreprocess: false,
    skipValidate: false,
    continueOnPreprocessError: false,
    useRepairedOutput: true,
  };

  constructor(
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly preprocessor: SkillPreprocessor,
    private readonly validator: SkillValidator,
  ) {}

  /**
   * 执行结构化分析 Pipeline
   * 与 AiAnalysisService.executeAnalysis 功能一致，但提供更细粒度的阶段跟踪
   */
  async execute(
    request: AnalysisExecutionRequest,
    config: PipelineConfig = {},
  ): Promise<AnalysisExecutionResult & { pipeline: PipelineContext }> {
    const mergedConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    const context: PipelineContext = {
      request,
      stages: [],
      status: 'running',
      startTime,
    };

    try {
      // 阶段 1: intent_parse - 解析用户意图
      await this.runStage(context, 'intent_parse', async () => {
        const userQuestion = request.userQuestion?.trim();
        const intent = this.parseIntent(userQuestion, request.pageScope);
        return { output: { intent, userQuestion: userQuestion ?? '' } };
      });

      // 阶段 2: data_resolve - 数据解析
      await this.runStage(context, 'data_resolve', async () => {
        const inputData = request.inputData;
        const recordCount = this.estimateRecords(inputData);
        return {
          output: {
            inputData,
            recordCount,
            fieldCount: Object.keys(inputData).length,
          },
        };
      });

      // 阶段 3: preprocess - 数据预处理（可跳过）
      if (!mergedConfig.skipPreprocess) {
        await this.runStage(context, 'preprocess', async () => {
          const report = this.preprocessor.preprocess(request.inputData, request.pageScope);
          context.preprocessReport = report;

          if (report.errors.length > 0 && !mergedConfig.continueOnPreprocessError) {
            if (report.quality === 'empty') {
              throw new BadRequestException(`数据预处理失败: ${report.errors.join('; ')}`);
            }
          }

          const enhancedData = this.preprocessor.injectReportIntoData(
            report.normalizedData,
            report,
          );
          context.enhancedInputData = enhancedData;

          return {
            output: {
              quality: report.quality,
              score: report.score,
              recordCount: report.recordCount,
              anomalyCount: report.anomalies.length,
            },
            warnings: report.warnings,
            error: report.errors.length > 0 ? report.errors.join('; ') : undefined,
          };
        });

        // 如果预处理阶段失败且不继续，则直接返回
        const preprocessStage = context.stages.find((s) => s.stage === 'preprocess');
        if (preprocessStage?.status === 'failed' && !mergedConfig.continueOnPreprocessError) {
          context.status = 'failed';
          context.totalDurationMs = Date.now() - startTime;
          return this.buildFailedResult(context, preprocessStage.error ?? '预处理失败');
        }
      }

      // 阶段 4 + 5 + 6: skill_match → prompt_build → model_execute
      // 这三个阶段在 AiAnalysisService.executeAnalysis 中耦合执行，这里委托执行
      await this.runStage(context, 'model_execute', async () => {
        // 使用增强后的输入数据（如果预处理执行了）
        const enhancedRequest: AnalysisExecutionRequest = context.enhancedInputData
          ? { ...request, inputData: context.enhancedInputData }
          : request;

        const result = await this.aiAnalysisService.executeAnalysis(enhancedRequest);
        context.executionResult = result;

        return {
          output: {
            sessionId: result.sessionId,
            status: result.status,
            collaborationMode: result.collaborationMode,
            modelCount: result.results.length,
            latencyMs: result.latencyMs,
          },
          error: result.errorMessage,
        };
      });

      // 检查模型执行是否成功
      if (context.executionResult?.status === 'failed') {
        context.status = 'failed';
        context.totalDurationMs = Date.now() - startTime;
        return {
          ...context.executionResult,
          pipeline: context,
        };
      }

      // 阶段 7: validate - 结果校验（可跳过）
      if (!mergedConfig.skipValidate && context.executionResult?.finalOutput) {
        await this.runStage(context, 'validate', async () => {
          // 获取 skill 用于校验
          const skills = await this.aiAnalysisService.findAllSkills();
          const skill = skills.find((s) => s.skillKey === request.skillKey);

          if (!skill) {
            return {
              status: 'skipped' as StageStatus,
              output: { reason: 'Skill not found, validation skipped' },
            };
          }

          const report = this.validator.validate(
            context.executionResult!.finalOutput,
            skill.outputSchema,
            skill.skillKey,
          );
          context.validationReport = report;

          return {
            output: {
              level: report.level,
              passedFields: report.passedFields,
              failedFields: report.failedFields,
              warningCount: report.warningCount,
            },
            warnings: report.warnings,
            error: report.errors.length > 0 ? report.errors.join('; ') : undefined,
          };
        });
      }

      // 阶段 8: postprocess - 后处理
      await this.runStage(context, 'postprocess', async () => {
        let finalOutput = context.executionResult?.finalOutput ?? {};

        // 如果有校验报告且配置使用修复输出
        if (
          mergedConfig.useRepairedOutput &&
          context.validationReport &&
          context.validationReport.level !== 'pass'
        ) {
          finalOutput = {
            ...context.validationReport.repairedOutput,
            _pipelineMeta: {
              stages: context.stages.map((s) => ({
                stage: s.stage,
                status: s.status,
                durationMs: s.durationMs,
              })),
              totalDurationMs: Date.now() - startTime,
              dataQuality: context.preprocessReport
                ? {
                    quality: context.preprocessReport.quality,
                    score: context.preprocessReport.score,
                  }
                : undefined,
              validationLevel: context.validationReport.level,
            },
          };
        } else {
          finalOutput = {
            ...finalOutput,
            _pipelineMeta: {
              stages: context.stages.map((s) => ({
                stage: s.stage,
                status: s.status,
                durationMs: s.durationMs,
              })),
              totalDurationMs: Date.now() - startTime,
            },
          };
        }

        context.finalOutput = finalOutput;
        return { output: { hasPipelineMeta: true } };
      });

      context.status = 'completed';
      context.totalDurationMs = Date.now() - startTime;

      this.logger.log(
        `Pipeline completed [${request.skillKey}]: ${context.totalDurationMs}ms, ` +
          `${context.stages.filter((s) => s.status === 'completed').length}/${context.stages.length} stages succeeded`,
      );

      return {
        ...(context.executionResult as AnalysisExecutionResult),
        finalOutput: context.finalOutput ?? context.executionResult?.finalOutput ?? {},
        pipeline: context,
      };
    } catch (error) {
      context.status = 'failed';
      context.totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Pipeline 执行失败';

      this.logger.error(
        `Pipeline failed [${request.skillKey}]: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.buildFailedResult(context, errorMessage);
    }
  }

  /**
   * 执行单个阶段（带状态跟踪和计时）
   */
  private async runStage(
    context: PipelineContext,
    stage: PipelineStage,
    executor: () => Promise<Partial<StageResult> | void>,
  ): Promise<void> {
    const stageStartTime = Date.now();
    const stageResult: StageResult = {
      stage,
      status: 'running',
      durationMs: 0,
    };

    try {
      const result = await executor();
      const stageData = (result ?? {}) as Partial<StageResult>;

      if (stageData.status) {
        stageResult.status = stageData.status;
      } else {
        stageResult.status = 'completed';
      }

      if (stageData.output) stageResult.output = stageData.output;
      if (stageData.warnings) stageResult.warnings = stageData.warnings;
      if (stageData.error) stageResult.error = stageData.error;

      // 非致命错误标记为 completed（带 warning）
      if (stageResult.error && stageResult.status === 'completed') {
        this.logger.warn(`Stage ${stage} completed with error: ${stageResult.error}`);
      }
    } catch (error) {
      stageResult.status = 'failed';
      stageResult.error = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Stage ${stage} failed: ${stageResult.error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    stageResult.durationMs = Date.now() - stageStartTime;
    context.stages.push(stageResult);

    // 致命错误抛出（由调用方决定是否继续）
    if (stageResult.status === 'failed' && this.isCriticalStage(stage)) {
      throw new Error(stageResult.error ?? `Stage ${stage} failed`);
    }
  }

  /**
   * 判断是否为关键阶段（失败会终止整个 pipeline）
   */
  private isCriticalStage(stage: PipelineStage): boolean {
    return stage === 'model_execute';
  }

  /**
   * 解析用户意图
   */
  private parseIntent(
    userQuestion: string | undefined,
    pageScope: string,
  ): { type: string; focus: string[] } {
    if (!userQuestion) {
      return { type: 'general', focus: [] };
    }

    const lowerQ = userQuestion.toLowerCase();
    const focus: string[] = [];

    if (lowerQ.includes('趋势') || lowerQ.includes('变化')) focus.push('trend');
    if (lowerQ.includes('异常') || lowerQ.includes('风险')) focus.push('anomaly');
    if (lowerQ.includes('排名') || lowerQ.includes('对比')) focus.push('ranking');
    if (lowerQ.includes('建议') || lowerQ.includes('行动')) focus.push('recommendation');
    if (lowerQ.includes('区域') || lowerQ.includes('分布')) focus.push('distribution');

    return {
      type: focus.length > 0 ? 'targeted' : 'general',
      focus,
    };
  }

  /**
   * 估算记录数
   */
  private estimateRecords(data: Record<string, unknown>): number {
    let max = 0;
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > max) max = value.length;
    }
    return max;
  }

  /**
   * 构建失败结果
   */
  private buildFailedResult(
    context: PipelineContext,
    errorMessage: string,
  ): AnalysisExecutionResult & { pipeline: PipelineContext } {
    return {
      sessionId: context.executionResult?.sessionId ?? 'pipeline-failed',
      skillKey: context.request.skillKey,
      pageScope: context.request.pageScope,
      collaborationMode: context.executionResult?.collaborationMode ?? 'independent',
      status: 'failed',
      results: context.executionResult?.results ?? [],
      finalOutput: context.finalOutput ?? {},
      errorMessage,
      latencyMs: context.totalDurationMs ?? 0,
      pipeline: context,
    };
  }

  /**
   * 获取 Pipeline 阶段定义（供前端展示）
   */
  getStageDefinitions(): Array<{ stage: PipelineStage; label: string; description: string }> {
    return [
      {
        stage: 'intent_parse',
        label: '意图解析',
        description: '解析用户分析需求，识别关注维度',
      },
      {
        stage: 'data_resolve',
        label: '数据解析',
        description: '解析输入数据，统计字段与记录数',
      },
      {
        stage: 'preprocess',
        label: '数据预处理',
        description: '规范化数据、检测异常、质量评分',
      },
      {
        stage: 'skill_match',
        label: 'Skill 匹配',
        description: '根据 pageScope 匹配分析 Skill',
      },
      {
        stage: 'prompt_build',
        label: '提示词构建',
        description: '基于 Skill 模板构建模型提示词',
      },
      {
        stage: 'model_execute',
        label: '模型执行',
        description: '调用大模型执行分析（支持多模式协同）',
      },
      {
        stage: 'validate',
        label: '结果校验',
        description: 'Schema 校验、必填字段检测、自动修复',
      },
      {
        stage: 'postprocess',
        label: '后处理',
        description: '注入 Pipeline 元数据、生成最终输出',
      },
    ];
  }
}
