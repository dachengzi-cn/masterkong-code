import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { AnalysisPipelineService } from './analysis-pipeline.service';
import type { AnalysisExecutionRequest } from './ai-analysis.types';
import type { CollaborationMode } from './ai-analysis.types';
import type { PipelineConfig } from './analysis-pipeline.service';

@Controller('api/ai-analysis')
export class AiAnalysisController {
  constructor(
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly pipelineService: AnalysisPipelineService,
  ) {}

  // ========== Skill 管理 ==========

  /** 获取所有已启用的 Skill */
  @Get('skills')
  async findAllSkills() {
    const skills = await this.aiAnalysisService.findAllSkills();
    return {
      items: skills.map((s) => ({
        id: s.id,
        skillKey: s.skillKey,
        name: s.name,
        description: s.description ?? null,
        pageScope: s.pageScope,
        promptTemplate: s.promptTemplate,
        outputSchema: s.outputSchema,
        maxTokens: s.maxTokens ?? 4096,
        isBuiltin: s.isBuiltin,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  }

  /** 按页面获取 Skill */
  @Get('skills/page/:pageScope')
  async findSkillsByPage(@Param('pageScope') pageScope: string) {
    const skills = await this.aiAnalysisService.findSkillsByPage(pageScope);
    return {
      items: skills.map((s) => ({
        id: s.id,
        skillKey: s.skillKey,
        name: s.name,
        description: s.description ?? null,
        pageScope: s.pageScope,
        promptTemplate: s.promptTemplate,
        outputSchema: s.outputSchema,
        maxTokens: s.maxTokens ?? 4096,
        isBuiltin: s.isBuiltin,
        version: s.version,
      })),
    };
  }

  /** 获取模块注册表与技能映射关系 */
  @Get('modules')
  async getModuleMapping() {
    const mapping = await this.aiAnalysisService.getModuleMapping();
    return {
      groups: mapping.map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        icon: group.icon,
        modules: group.modules.map((mod) => ({
          pageScope: mod.pageScope,
          name: mod.name,
          icon: mod.icon,
          description: mod.description,
          skills: mod.skills.map((s) => ({
            id: s.id,
            skillKey: s.skillKey,
            name: s.name,
            version: s.version,
            isBuiltin: s.isBuiltin,
            updatedAt: s.updatedAt.toISOString(),
          })),
        })),
      })),
    };
  }

  /** 更新 Skill（迭代优化） */
  @Put('skills/:skillKey')
  async updateSkill(
    @Param('skillKey') skillKey: string,
    @Body() body: {
      promptTemplate?: string;
      outputSchema?: Record<string, unknown>;
      maxTokens?: number;
      name?: string;
      description?: string;
    },
  ) {
    const skill = await this.aiAnalysisService.updateSkill(skillKey, body);
    return {
      item: {
        id: skill.id,
        skillKey: skill.skillKey,
        name: skill.name,
        description: skill.description ?? null,
        pageScope: skill.pageScope,
        promptTemplate: skill.promptTemplate,
        outputSchema: skill.outputSchema,
        maxTokens: skill.maxTokens ?? 4096,
        isBuiltin: skill.isBuiltin,
        version: skill.version,
        updatedAt: skill.updatedAt.toISOString(),
      },
    };
  }

  // ========== 分析配置 ==========

  /** 获取分析配置 */
  @Get('config')
  async getConfig() {
    const config = await this.aiAnalysisService.getAnalysisConfig();
    return config;
  }

  /** 更新分析配置 */
  @Put('config')
  async updateConfig(@Body() body: {
    collaborationMode?: CollaborationMode;
    defaultConfigKey?: string;
    ensembleConfigKeys?: string[];
    plannerConfigKey?: string;
    executorConfigKey?: string;
    criticConfigKey?: string;
    isEnabled?: boolean;
  }) {
    const config = await this.aiAnalysisService.updateAnalysisConfig(body);
    return config;
  }

  // ========== 分析执行 ==========

  /** 执行分析任务 */
  @Post('execute')
  async executeAnalysis(@Body() body: AnalysisExecutionRequest) {
    const result = await this.aiAnalysisService.executeAnalysis(body);
    return result;
  }

  // ========== M3-3: 结构化 Pipeline ==========

  /** 执行结构化 Pipeline 分析（返回阶段级执行详情） */
  @Post('pipeline/execute')
  async executePipeline(
    @Body() body: AnalysisExecutionRequest & { pipelineConfig?: PipelineConfig },
  ) {
    const { pipelineConfig, ...request } = body;
    const result = await this.pipelineService.execute(request, pipelineConfig ?? {});
    return result;
  }

  /** 获取 Pipeline 阶段定义 */
  @Get('pipeline/stages')
  async getPipelineStages() {
    return { items: this.pipelineService.getStageDefinitions() };
  }

  // ========== 会话历史 ==========

  /** 获取分析会话历史 */
  @Get('sessions')
  async getSessionHistory(
    @Query('pageScope') pageScope?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const sessions = await this.aiAnalysisService.getSessionHistory(pageScope, limitNum);
    return {
      items: sessions.map((s) => ({
        id: s.id,
        skillKey: s.skillKey,
        pageScope: s.pageScope,
        collaborationMode: s.collaborationMode,
        configKeys: s.configKeys,
        userQuestion: s.userQuestion,
        status: s.status,
        errorMessage: s.errorMessage,
        latencyMs: s.latencyMs,
        usage: s.usage,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  /** 获取单个会话详情 */
  @Get('sessions/:sessionId')
  async getSessionById(@Param('sessionId') sessionId: string) {
    const session = await this.aiAnalysisService.getSessionById(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    return {
      item: {
        id: session.id,
        skillKey: session.skillKey,
        pageScope: session.pageScope,
        collaborationMode: session.collaborationMode,
        configKeys: session.configKeys,
        inputData: session.inputData,
        userQuestion: session.userQuestion,
        outputData: session.outputData,
        status: session.status,
        errorMessage: session.errorMessage,
        latencyMs: session.latencyMs,
        usage: session.usage,
        createdAt: session.createdAt.toISOString(),
      },
    };
  }

  /** 删除单个分析会话记录 */
  @Delete('sessions/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    const deleted = await this.aiAnalysisService.deleteSession(sessionId);
    return { deleted, sessionId };
  }

  /** 批量删除指定页面的分析会话记录 */
  @Delete('sessions')
  async deleteSessionsByPage(@Query('pageScope') pageScope?: string) {
    if (!pageScope) {
      return { error: 'pageScope is required' };
    }
    const count = await this.aiAnalysisService.deleteSessionsByPageScope(pageScope);
    return { deleted: count, pageScope };
  }
}
