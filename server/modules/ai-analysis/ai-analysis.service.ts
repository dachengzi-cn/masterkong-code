import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc } from 'drizzle-orm';
import { aiSkill, aiAnalysisSession, aiAnalysisConfig } from '@server/database/schema';
import { AiConfigService } from '../ai/ai-config.service';
import { AiService } from '../ai/ai.service';
import { BUILTIN_SKILLS, PLANNER_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT } from './ai-analysis.constants';
import { SkillPreprocessor } from './skill-preprocessor';
import { SkillValidator } from './skill-validator';
import type {
  SkillDefinition,
  SkillRecord,
  CollaborationMode,
  AnalysisExecutionRequest,
  AnalysisExecutionResult,
  ModelCallResult,
  AnalysisConfig,
  InlineModelConfig,
} from './ai-analysis.types';
import type { DecryptedAiConfig } from '../ai/ai-config.types';

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly aiConfigService: AiConfigService,
    private readonly aiService: AiService,
    private readonly preprocessor: SkillPreprocessor,
    private readonly validator: SkillValidator,
  ) {}

  // ========== Skill 注册中心 ==========

  /** 初始化内置 Skill（模块启动时调用） */
  async seedBuiltinSkills(): Promise<void> {
    try {
      for (const skill of BUILTIN_SKILLS) {
        const existing = await this.db
          .select({ id: aiSkill.id })
          .from(aiSkill)
          .where(eq(aiSkill.skillKey, skill.skillKey))
          .limit(1);

        if (existing.length === 0) {
          await this.db.insert(aiSkill).values({
            skillKey: skill.skillKey,
            name: skill.name,
            description: skill.description ?? null,
            pageScope: skill.pageScope,
            promptTemplate: skill.promptTemplate,
            outputSchema: skill.outputSchema,
            defaultConfigKey: skill.defaultConfigKey ?? null,
            maxTokens: skill.maxTokens ?? 4096,
            isBuiltin: true,
            isEnabled: true,
            version: 1,
          });
          this.logger.log(`Seeded builtin skill: ${skill.skillKey}`);
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to seed builtin skills',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** 获取所有已启用的 Skill */
  async findAllSkills(): Promise<SkillRecord[]> {
    const rows = await this.db
      .select()
      .from(aiSkill)
      .where(eq(aiSkill.isEnabled, true))
      .orderBy(aiSkill.pageScope, aiSkill.skillKey);
    return rows.map(this.toSkillRecord);
  }

  /** 按页面获取 Skill 列表 */
  async findSkillsByPage(pageScope: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select()
      .from(aiSkill)
      .where(and(eq(aiSkill.pageScope, pageScope), eq(aiSkill.isEnabled, true)))
      .orderBy(aiSkill.skillKey);
    return rows.map(this.toSkillRecord);
  }

  /** 按 key 获取 Skill */
  async findSkillByKey(skillKey: string): Promise<SkillRecord | null> {
    const rows = await this.db
      .select()
      .from(aiSkill)
      .where(eq(aiSkill.skillKey, skillKey))
      .limit(1);
    return rows.length > 0 ? this.toSkillRecord(rows[0]) : null;
  }

  /** 更新 Skill（支持自定义 Skill 的迭代优化） */
  async updateSkill(
    skillKey: string,
    updates: Partial<Pick<SkillDefinition, 'promptTemplate' | 'outputSchema' | 'maxTokens' | 'name' | 'description'>>,
  ): Promise<SkillRecord> {
    const skill = await this.findSkillByKey(skillKey);
    if (!skill) {
      throw new NotFoundException(`Skill not found: ${skillKey}`);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.promptTemplate !== undefined) updateData.promptTemplate = updates.promptTemplate;
    if (updates.outputSchema !== undefined) updateData.outputSchema = updates.outputSchema;
    if (updates.maxTokens !== undefined) updateData.maxTokens = updates.maxTokens;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;

    // 内置 skill 更新时递增版本号
    if (skill.isBuiltin) {
      updateData.version = skill.version + 1;
    }

    const rows = await this.db
      .update(aiSkill)
      .set(updateData)
      .where(eq(aiSkill.skillKey, skillKey))
      .returning();

    return this.toSkillRecord(rows[0]);
  }

  private toSkillRecord(row: typeof aiSkill.$inferSelect): SkillRecord {
    return {
      id: row.id,
      skillKey: row.skillKey,
      name: row.name,
      description: row.description ?? undefined,
      pageScope: row.pageScope,
      promptTemplate: row.promptTemplate,
      outputSchema: row.outputSchema as Record<string, unknown>,
      defaultConfigKey: row.defaultConfigKey ?? undefined,
      maxTokens: row.maxTokens ?? 4096,
      isBuiltin: row.isBuiltin,
      isEnabled: row.isEnabled,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ========== 分析配置管理 ==========

  /** 获取分析配置（单行配置表） */
  async getAnalysisConfig(): Promise<AnalysisConfig> {
    const rows = await this.db.select().from(aiAnalysisConfig).limit(1);
    if (rows.length === 0) {
      // 如果配置表为空，返回默认配置
      return {
        collaborationMode: 'independent',
        ensembleConfigKeys: [],
        isEnabled: true,
      };
    }
    const row = rows[0];
    return {
      collaborationMode: row.collaborationMode as CollaborationMode,
      defaultConfigKey: row.defaultConfigKey ?? undefined,
      ensembleConfigKeys: (row.ensembleConfigKeys as string[]) ?? [],
      plannerConfigKey: row.plannerConfigKey ?? undefined,
      executorConfigKey: row.executorConfigKey ?? undefined,
      criticConfigKey: row.criticConfigKey ?? undefined,
      isEnabled: row.isEnabled,
    };
  }

  /** 更新分析配置 */
  async updateAnalysisConfig(updates: Partial<AnalysisConfig>): Promise<AnalysisConfig> {
    const rows = await this.db.select().from(aiAnalysisConfig).limit(1);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.collaborationMode !== undefined) updateData.collaborationMode = updates.collaborationMode;
    if (updates.defaultConfigKey !== undefined) updateData.defaultConfigKey = updates.defaultConfigKey;
    if (updates.ensembleConfigKeys !== undefined) updateData.ensembleConfigKeys = updates.ensembleConfigKeys;
    if (updates.plannerConfigKey !== undefined) updateData.plannerConfigKey = updates.plannerConfigKey;
    if (updates.executorConfigKey !== undefined) updateData.executorConfigKey = updates.executorConfigKey;
    if (updates.criticConfigKey !== undefined) updateData.criticConfigKey = updates.criticConfigKey;
    if (updates.isEnabled !== undefined) updateData.isEnabled = updates.isEnabled;

    if (rows.length === 0) {
      // 插入新配置行
      const inserted = await this.db
        .insert(aiAnalysisConfig)
        .values({
          collaborationMode: (updates.collaborationMode as string) ?? 'independent',
          defaultConfigKey: (updates.defaultConfigKey as string) ?? null,
          ensembleConfigKeys: (updates.ensembleConfigKeys as string[]) ?? [],
          plannerConfigKey: (updates.plannerConfigKey as string) ?? null,
          executorConfigKey: (updates.executorConfigKey as string) ?? null,
          criticConfigKey: (updates.criticConfigKey as string) ?? null,
          isEnabled: updates.isEnabled ?? true,
        })
        .returning();
      return this.toAnalysisConfig(inserted[0]);
    }

    const updated = await this.db
      .update(aiAnalysisConfig)
      .set(updateData)
      .where(eq(aiAnalysisConfig.id, rows[0].id))
      .returning();
    return this.toAnalysisConfig(updated[0]);
  }

  private toAnalysisConfig(row: typeof aiAnalysisConfig.$inferSelect): AnalysisConfig {
    return {
      collaborationMode: row.collaborationMode as CollaborationMode,
      defaultConfigKey: row.defaultConfigKey ?? undefined,
      ensembleConfigKeys: (row.ensembleConfigKeys as string[]) ?? [],
      plannerConfigKey: row.plannerConfigKey ?? undefined,
      executorConfigKey: row.executorConfigKey ?? undefined,
      criticConfigKey: row.criticConfigKey ?? undefined,
      isEnabled: row.isEnabled,
    };
  }

  // ========== 分析引擎 ==========

  /** 执行分析任务 */
  async executeAnalysis(request: AnalysisExecutionRequest): Promise<AnalysisExecutionResult> {
    const startTime = Date.now();

    // 1. 获取 Skill 定义
    const skill = await this.findSkillByKey(request.skillKey);
    if (!skill) {
      throw new NotFoundException(`Skill not found: ${request.skillKey}`);
    }

    // 2. 获取分析配置（请求中的参数覆盖全局配置）
    const globalConfig = await this.getAnalysisConfig();
    const mode: CollaborationMode = request.collaborationMode ?? globalConfig.collaborationMode;

    // 3. 创建分析会话记录
    const configKeys = await this.resolveConfigKeys(request, globalConfig, mode);
    if (configKeys.length === 0) {
      throw new BadRequestException('未配置可用的 AI 模型，请在设置中配置后重试');
    }

    // M3-2a: 数据预处理（规范化、异常检测、质量评分）
    const preprocessReport = this.preprocessor.preprocess(request.inputData, request.pageScope);
    if (preprocessReport.errors.length > 0) {
      this.logger.warn(
        `数据预处理发现错误 [${request.skillKey}]: ${preprocessReport.errors.join('; ')}`,
      );
      // 空数据直接返回失败
      if (preprocessReport.quality === 'empty') {
        return {
          sessionId: 'preprocess-failed',
          skillKey: request.skillKey,
          pageScope: request.pageScope,
          collaborationMode: mode,
          status: 'failed',
          results: [],
          finalOutput: {},
          errorMessage: `数据预处理失败: ${preprocessReport.errors.join('; ')}`,
          latencyMs: Date.now() - startTime,
        };
      }
    }
    // 将预处理报告注入输入数据
    const enhancedInputData = this.preprocessor.injectReportIntoData(
      preprocessReport.normalizedData,
      preprocessReport,
    );
    const enhancedRequest: AnalysisExecutionRequest = {
      ...request,
      inputData: enhancedInputData,
    };

    const sessionRow = await this.db
      .insert(aiAnalysisSession)
      .values({
        skillKey: request.skillKey,
        pageScope: request.pageScope,
        collaborationMode: mode,
        configKeys,
        inputData: enhancedInputData,
        userQuestion: request.userQuestion ?? null,
        status: 'running',
      })
      .returning();

    const sessionId = sessionRow[0].id;

    try {
      // 4. 根据协同模式执行分析
      let result: Omit<AnalysisExecutionResult, 'sessionId'>;

      switch (mode) {
        case 'independent':
          result = await this.executeIndependent(skill, enhancedRequest, configKeys);
          break;
        case 'ensemble':
          result = await this.executeEnsemble(skill, enhancedRequest, configKeys);
          break;
        case 'planner-executor-critic':
          result = await this.executePlannerExecutorCritic(skill, enhancedRequest, globalConfig);
          break;
        default:
          throw new BadRequestException(`不支持的协同模式: ${mode}`);
      }

      const latencyMs = Date.now() - startTime;

      // M3-2b: 结果校验（Schema 校验 + 自动修复）
      let finalOutput = result.finalOutput;
      let validationReport: ReturnType<SkillValidator['validate']> | null = null;
      if (result.status === 'completed' && finalOutput) {
        validationReport = this.validator.validate(
          finalOutput,
          skill.outputSchema,
          skill.skillKey,
        );
        // 使用修复后的输出
        finalOutput = {
          ...validationReport.repairedOutput,
          _validationReport: {
            level: validationReport.level,
            passedFields: validationReport.passedFields,
            failedFields: validationReport.failedFields,
            warningCount: validationReport.warningCount,
            errors: validationReport.errors,
            warnings: validationReport.warnings,
          },
          _dataQuality: {
            quality: preprocessReport.quality,
            score: preprocessReport.score,
            recordCount: preprocessReport.recordCount,
          },
        };
      }

      // 5. 更新会话记录
      await this.db
        .update(aiAnalysisSession)
        .set({
          status: result.status,
          outputData: finalOutput,
          errorMessage: result.errorMessage ?? null,
          latencyMs,
          usage: result.totalUsage ?? null,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalysisSession.id, sessionId));

      return {
        sessionId,
        ...result,
        finalOutput,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '分析执行失败';

      await this.db
        .update(aiAnalysisSession)
        .set({
          status: 'failed',
          errorMessage,
          latencyMs,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalysisSession.id, sessionId));

      return {
        sessionId,
        skillKey: request.skillKey,
        pageScope: request.pageScope,
        collaborationMode: mode,
        status: 'failed',
        results: [],
        finalOutput: {},
        errorMessage,
        latencyMs,
      };
    }
  }

  /** 解析当前模式需要的 configKey 列表，并过滤不存在的配置 */
  private async resolveConfigKeys(
    request: AnalysisExecutionRequest,
    config: AnalysisConfig,
    mode: CollaborationMode,
  ): Promise<string[]> {
    // 请求中显式指定的模型优先
    let rawKeys: string[];
    if (request.configKeys && request.configKeys.length > 0) {
      rawKeys = request.configKeys;
    } else {
      switch (mode) {
        case 'independent':
          rawKeys = config.defaultConfigKey ? [config.defaultConfigKey] : [];
          break;
        case 'ensemble':
          rawKeys = config.ensembleConfigKeys ?? [];
          break;
        case 'planner-executor-critic':
          rawKeys = [
            config.plannerConfigKey,
            config.executorConfigKey,
            config.criticConfigKey,
          ].filter((k): k is string => !!k);
          break;
        default:
          rawKeys = [];
      }
    }

    // 校验并过滤不存在的模型配置，若全部失效则兜底使用当前激活配置
    const inlineConfigs = request.inlineModelConfigs;
    const existingKeys: string[] = [];
    for (const key of rawKeys) {
      // 优先检查内联配置
      const inlineMatch = inlineConfigs?.find((c) => c.configKey === key);
      if (inlineMatch) {
        existingKeys.push(key);
        continue;
      }
      // 其次检查数据库
      const modelConfig = await this.aiConfigService.findByConfigKey(key);
      if (modelConfig) {
        existingKeys.push(key);
      } else {
        this.logger.warn(`AI 分析配置中的模型不存在，已自动忽略: ${key}`);
      }
    }

    if (existingKeys.length > 0) {
      return existingKeys;
    }

    const activeConfig = await this.aiConfigService.findActiveConfig();
    if (activeConfig) {
      this.logger.log(`AI 分析配置全部失效，兜底使用当前激活模型: ${activeConfig.configKey}`);
      return [activeConfig.configKey];
    }

    return [];
  }

  /** 独立模式：使用单个模型执行分析 */
  private async executeIndependent(
    skill: SkillRecord,
    request: AnalysisExecutionRequest,
    configKeys: string[],
  ): Promise<Omit<AnalysisExecutionResult, 'sessionId'>> {
    const configKey = configKeys[0];
    const modelResult = await this.callModel(skill, request, configKey);

    return {
      skillKey: skill.skillKey,
      pageScope: skill.pageScope,
      collaborationMode: 'independent',
      status: modelResult.error ? 'failed' : 'completed',
      results: [modelResult],
      finalOutput: modelResult.parsedContent ?? { rawContent: modelResult.content },
      errorMessage: modelResult.error,
      totalUsage: modelResult.usage
        ? {
            promptTokens: modelResult.usage.promptTokens,
            completionTokens: modelResult.usage.completionTokens,
            totalTokens: modelResult.usage.totalTokens,
          }
        : undefined,
    };
  }

  /** 集成模式：多模型并行执行，聚合结果 */
  private async executeEnsemble(
    skill: SkillRecord,
    request: AnalysisExecutionRequest,
    configKeys: string[],
  ): Promise<Omit<AnalysisExecutionResult, 'sessionId'>> {
    // 并行调用所有模型
    const modelResults = await Promise.all(
      configKeys.map((key) => this.callModel(skill, request, key)),
    );

    // 聚合结果：合并各模型的分析输出
    const aggregated = this.aggregateEnsembleResults(modelResults);

    const totalUsage = this.sumUsage(modelResults);

    return {
      skillKey: skill.skillKey,
      pageScope: skill.pageScope,
      collaborationMode: 'ensemble',
      status: modelResults.every((r) => r.error) ? 'failed' : 'completed',
      results: modelResults,
      finalOutput: aggregated,
      totalUsage,
    };
  }

  /** 规划-执行-评判模式：三阶段顺序执行 */
  private async executePlannerExecutorCritic(
    skill: SkillRecord,
    request: AnalysisExecutionRequest,
    config: AnalysisConfig,
  ): Promise<Omit<AnalysisExecutionResult, 'sessionId'>> {
    const plannerKey = config.plannerConfigKey;
    const executorKey = config.executorConfigKey;
    const criticKey = config.criticConfigKey;

    if (!plannerKey || !executorKey || !criticKey) {
      throw new BadRequestException('规划-执行-评判模式需要配置 planner、executor、critic 三个模型');
    }

    // 阶段 1：规划
    const planResult = await this.callPlanner(request, plannerKey);
    if (planResult.error) {
      return {
        skillKey: skill.skillKey,
        pageScope: skill.pageScope,
        collaborationMode: 'planner-executor-critic',
        status: 'failed',
        results: [planResult],
        finalOutput: {},
        planOutput: null,
        criticOutput: null,
        errorMessage: `规划阶段失败: ${planResult.error}`,
      };
    }

    // 阶段 2：执行（将规划结果注入执行 prompt）
    const executorRequest: AnalysisExecutionRequest = {
      ...request,
      inputData: {
        ...request.inputData,
        _analysisPlan: planResult.parsedContent,
      },
    };
    const executorResult = await this.callModel(skill, executorRequest, executorKey);

    if (executorResult.error) {
      return {
        skillKey: skill.skillKey,
        pageScope: skill.pageScope,
        collaborationMode: 'planner-executor-critic',
        status: 'failed',
        results: [planResult, executorResult],
        finalOutput: {},
        planOutput: planResult.parsedContent,
        criticOutput: null,
        errorMessage: `执行阶段失败: ${executorResult.error}`,
      };
    }

    // 阶段 3：评审
    const criticResult = await this.callCritic(
      request,
      executorResult.parsedContent ?? { rawContent: executorResult.content },
      criticKey,
    );

    // 合并执行结果与评审结果
    const finalOutput = {
      ...executorResult.parsedContent,
      _criticReview: criticResult.parsedContent,
    };

    const totalUsage = this.sumUsage([planResult, executorResult, criticResult]);

    return {
      skillKey: skill.skillKey,
      pageScope: skill.pageScope,
      collaborationMode: 'planner-executor-critic',
      status: 'completed',
      results: [planResult, executorResult, criticResult],
      finalOutput,
      planOutput: planResult.parsedContent,
      criticOutput: criticResult.parsedContent,
      totalUsage,
    };
  }

  // ========== 模型调用封装 ==========

  /** 解析模型配置：优先从 inlineModelConfigs 中查找，其次从数据库查找 */
  private async resolveModelConfig(
    configKey: string,
    inlineConfigs?: InlineModelConfig[],
  ): Promise<DecryptedAiConfig | null> {
    // 1. 检查内联配置（前端传递的自定义模型）
    if (inlineConfigs && inlineConfigs.length > 0) {
      const inline = inlineConfigs.find((c) => c.configKey === configKey);
      if (inline) {
        return {
          id: 'inline',
          configKey: inline.configKey,
          name: inline.name,
          providerId: inline.providerId,
          apiKey: inline.apiKey,
          baseUrl: inline.baseUrl,
          model: inline.model,
          isBuiltin: false,
          isActive: false,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    }

    // 2. 从数据库查找
    return this.aiConfigService.findByConfigKey(configKey);
  }

  /** 调用单个模型执行 Skill 分析 */
  private async callModel(
    skill: SkillRecord,
    request: AnalysisExecutionRequest,
    configKey: string,
  ): Promise<ModelCallResult> {
    const config = await this.resolveModelConfig(configKey, request.inlineModelConfigs);
    if (!config) {
      return {
        configKey,
        modelName: configKey,
        content: '',
        parsedContent: null,
        latencyMs: 0,
        error: `模型配置不存在: ${configKey}`,
      };
    }

    // 构建提示词
    const prompt = this.buildPrompt(skill, request);
    const messages = [
      { role: 'system' as const, content: '你是一位专业的数据分析专家，请严格按照 JSON 格式输出分析结果。' },
      { role: 'user' as const, content: prompt },
    ];

    const startTime = Date.now();

    try {
      const result = await this.aiService.chatCompletions({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        maxTokens: skill.maxTokens ?? 4096,
        timeoutMs: 120000, // 分析任务使用 120s 超时（默认 60s 不足）
      });

      const responseData = result.data as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const message = responseData?.choices?.[0]?.message;
      const content = message?.content?.trim() || message?.reasoning_content?.trim() || '';

      if (!content) {
        return {
          configKey,
          modelName: config.name,
          content: '',
          parsedContent: null,
          latencyMs: result.latencyMs,
          error: '模型返回内容为空',
        };
      }

      const parsed = this.tryParseJson(content);

      return {
        configKey,
        modelName: config.name,
        content,
        parsedContent: parsed,
        latencyMs: result.latencyMs,
        usage: responseData?.usage
          ? {
              promptTokens: responseData.usage.prompt_tokens,
              completionTokens: responseData.usage.completion_tokens,
              totalTokens: responseData.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      let errorMsg = error instanceof Error ? error.message : '模型调用失败';
      // 友好提示超时错误
      if (errorMsg.includes('aborted') || errorMsg.includes('AbortError') || errorMsg.includes('timeout')) {
        errorMsg = `模型响应超时（${Math.round(latencyMs / 1000)}s），请检查模型服务可用性或稍后重试`;
      }
      this.logger.warn(`[callModel] ${configKey} 失败 (${latencyMs}ms): ${errorMsg}`);
      return {
        configKey,
        modelName: config.name,
        content: '',
        parsedContent: null,
        latencyMs,
        error: errorMsg,
      };
    }
  }

  /** 规划阶段：调用规划模型生成分析计划 */
  private async callPlanner(
    request: AnalysisExecutionRequest,
    configKey: string,
  ): Promise<ModelCallResult> {
    const config = await this.resolveModelConfig(configKey, request.inlineModelConfigs);
    if (!config) {
      return {
        configKey,
        modelName: configKey,
        content: '',
        parsedContent: null,
        latencyMs: 0,
        error: `模型配置不存在: ${configKey}`,
      };
    }

    const prompt = `## 分析需求
页面：${request.pageScope}
用户问题：${request.userQuestion ?? '无特定问题，请基于数据进行全面分析'}

## 数据摘要
${JSON.stringify(request.inputData).slice(0, 4000)}

请制定详细的分析计划。`;

    const messages = [
      { role: 'system' as const, content: PLANNER_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ];

    return this.callModelDirect(config, messages, 2048);
  }

  /** 评判阶段：调用评判模型审查分析结果 */
  private async callCritic(
    request: AnalysisExecutionRequest,
    analysisResult: Record<string, unknown>,
    configKey: string,
  ): Promise<ModelCallResult> {
    const config = await this.resolveModelConfig(configKey, request.inlineModelConfigs);
    if (!config) {
      return {
        configKey,
        modelName: configKey,
        content: '',
        parsedContent: null,
        latencyMs: 0,
        error: `模型配置不存在: ${configKey}`,
      };
    }

    const prompt = `## 原始分析需求
页面：${request.pageScope}
用户问题：${request.userQuestion ?? '无特定问题'}

## 分析结果
${JSON.stringify(analysisResult).slice(0, 6000)}

请评审以上分析结果的质量。`;

    const messages = [
      { role: 'system' as const, content: CRITIC_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ];

    return this.callModelDirect(config, messages, 2048);
  }

  /** 直接调用模型（用于规划/评判阶段，不走 Skill 模板） */
  private async callModelDirect(
    config: DecryptedAiConfig,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
  ): Promise<ModelCallResult> {
    const startTime = Date.now();

    try {
      const result = await this.aiService.chatCompletions({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        maxTokens,
        timeoutMs: 120000, // 分析任务使用 120s 超时
      });

      const responseData = result.data as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const message = responseData?.choices?.[0]?.message;
      const content = message?.content?.trim() || message?.reasoning_content?.trim() || '';

      const parsed = content ? this.tryParseJson(content) : null;

      return {
        configKey: config.configKey,
        modelName: config.name,
        content,
        parsedContent: parsed,
        latencyMs: result.latencyMs,
        usage: responseData?.usage
          ? {
              promptTokens: responseData.usage.prompt_tokens,
              completionTokens: responseData.usage.completion_tokens,
              totalTokens: responseData.usage.total_tokens,
            }
          : undefined,
        error: content ? undefined : '模型返回内容为空',
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      let errorMsg = error instanceof Error ? error.message : '模型调用失败';
      if (errorMsg.includes('aborted') || errorMsg.includes('AbortError') || errorMsg.includes('timeout')) {
        errorMsg = `模型响应超时（${Math.round(latencyMs / 1000)}s），请检查模型服务可用性或稍后重试`;
      }
      return {
        configKey: config.configKey,
        modelName: config.name,
        content: '',
        parsedContent: null,
        latencyMs,
        error: errorMsg,
      };
    }
  }

  // ========== 工具方法 ==========

  /** 构建 Skill 提示词，替换模板占位符 */
  private buildPrompt(skill: SkillRecord, request: AnalysisExecutionRequest): string {
    // 数据量过大时截断，避免超出 token 限制
    const inputDataStr = this.truncateData(request.inputData, 8000);
    const userQuestion = request.userQuestion || '请基于以上数据进行全面分析';

    return skill.promptTemplate
      .replace('{{inputData}}', inputDataStr)
      .replace('{{userQuestion}}', userQuestion);
  }

  /** 截断过大的 JSON 数据 */
  private truncateData(data: unknown, maxChars: number): string {
    const str = JSON.stringify(data, null, 2);
    if (str.length <= maxChars) {
      return str;
    }
    // 截断并添加提示
    return str.slice(0, maxChars) + '\n\n[... 数据已截断，仅显示前 ' + maxChars + ' 字符 ...]';
  }

  /** 尝试从模型输出中解析 JSON */
  private tryParseJson(content: string): Record<string, unknown> | null {
    // 尝试直接解析
    try {
      return JSON.parse(content);
    } catch {
      // ignore
    }
    // 尝试提取 JSON 代码块
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const extracted = jsonMatch[1].trim();
      try {
        return JSON.parse(extracted);
      } catch {
        // 尝试修复后解析
        const repaired = this.repairJsonString(extracted);
        if (repaired) return repaired;
      }
    }
    // 尝试提取第一个 { ... } 块
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // 尝试修复后解析
        const repaired = this.repairJsonString(braceMatch[0]);
        if (repaired) return repaired;
      }
    }
    // 最后尝试修复整段内容
    const repairedFull = this.repairJsonString(content);
    if (repairedFull) return repairedFull;
    return null;
  }

  /**
   * 修复常见的 JSON 格式问题（模型输出常见缺陷）
   * - Python 风格单引号 → 双引号
   * - None → null, True → true, False → false
   * - 尾随逗号
   * - 键名缺少引号
   */
  private repairJsonString(raw: string): Record<string, unknown> | null {
    try {
      let fixed = raw;

      // 1. 将 Python 风格的 None/True/False 转为 JSON 的 null/true/false
      fixed = fixed
        .replace(/\bNone\b/g, 'null')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false');

      // 2. 将单引号包裹的字符串转为双引号
      // 匹配 'xxx' 形式的字符串（不处理转义单引号的复杂场景）
      fixed = fixed.replace(/'([^']*)'/g, (_match, inner) => {
        // 转义内部双引号
        const escaped = inner.replace(/"/g, '\\"');
        return `"${escaped}"`;
      });

      // 3. 移除尾随逗号（,} 或 ,] 或 , 后跟空白再 } 或 ]）
      fixed = fixed.replace(/,\s*([}\]])/g, '$1');

      // 4. 修复键名缺少引号的情况（如 {key: value} → {"key": value}）
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // 5. 修复字符串内部错误的逗号（如 'High,' Description' 这类模型常见错误）
      // 此步骤较保守，仅处理明显的键值对断开
      fixed = fixed.replace(/",\s*'/g, '", "');

      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }

  /** 聚合集成模式的多模型结果 */
  private aggregateEnsembleResults(results: ModelCallResult[]): Record<string, unknown> {
    const validResults = results.filter((r) => r.parsedContent !== null);
    if (validResults.length === 0) {
      return { error: '所有模型均未返回有效结果', rawContents: results.map((r) => r.content) };
    }
    if (validResults.length === 1) {
      return validResults[0].parsedContent!;
    }

    // 合并各模型的 summary 和 recommendations
    const summaries: string[] = [];
    const recommendations: string[] = [];
    const riskAlerts: unknown[] = [];
    const modelSources: string[] = [];

    for (const result of validResults) {
      const content = result.parsedContent!;
      modelSources.push(result.modelName);

      if (typeof content.summary === 'string') {
        summaries.push(`【${result.modelName}】${content.summary}`);
      }
      if (Array.isArray(content.recommendations)) {
        recommendations.push(...(content.recommendations as string[]));
      }
      if (Array.isArray(content.riskAlerts)) {
        riskAlerts.push(...content.riskAlerts);
      }
    }

    const aggregatedSummary = summaries.join('\n\n');
    const aggregatedRecommendations = Array.from(new Set(recommendations));

    return {
      // 保留第一个模型的完整结构作为基础
      ...validResults[0].parsedContent!,
      // 用聚合结果覆盖关键字段
      summary: aggregatedSummary,
      recommendations: aggregatedRecommendations,
      riskAlerts,
      _ensembleMeta: {
        modelCount: validResults.length,
        modelSources,
      },
    };
  }

  /** 汇总 token 使用量 */
  private sumUsage(results: ModelCallResult[]): AnalysisExecutionResult['totalUsage'] {
    return results.reduce(
      (acc, r) => ({
        promptTokens: (acc?.promptTokens ?? 0) + (r.usage?.promptTokens ?? 0),
        completionTokens: (acc?.completionTokens ?? 0) + (r.usage?.completionTokens ?? 0),
        totalTokens: (acc?.totalTokens ?? 0) + (r.usage?.totalTokens ?? 0),
      }),
      {} as NonNullable<AnalysisExecutionResult['totalUsage']>,
    );
  }

  // ========== 会话历史 ==========

  /** 获取分析会话历史 */
  async getSessionHistory(pageScope?: string, limit = 20): Promise<typeof aiAnalysisSession.$inferSelect[]> {
    const conditions = pageScope ? eq(aiAnalysisSession.pageScope, pageScope) : undefined;
    const query = this.db
      .select()
      .from(aiAnalysisSession)
      .orderBy(desc(aiAnalysisSession.createdAt))
      .limit(limit);

    if (conditions) {
      return await query.where(conditions);
    }
    return await query;
  }

  /** 获取单个会话详情 */
  async getSessionById(sessionId: string): Promise<typeof aiAnalysisSession.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(aiAnalysisSession)
      .where(eq(aiAnalysisSession.id, sessionId))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  /** 删除分析会话记录 */
  async deleteSession(sessionId: string): Promise<boolean> {
    const rows = await this.db
      .delete(aiAnalysisSession)
      .where(eq(aiAnalysisSession.id, sessionId))
      .returning({ id: aiAnalysisSession.id });
    return rows.length > 0;
  }

  /** 批量删除分析会话记录 */
  async deleteSessionsByPageScope(pageScope: string): Promise<number> {
    const rows = await this.db
      .delete(aiAnalysisSession)
      .where(eq(aiAnalysisSession.pageScope, pageScope))
      .returning({ id: aiAnalysisSession.id });
    return rows.length;
  }
}
