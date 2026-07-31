import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  aiAnalysisFeedback,
  aiAnalysisSession,
  aiSkill,
  aiSkillIteration,
} from '@server/database/schema';
import type {
  SubmitFeedbackRequest,
  FeedbackRecord,
  SkillMetricRecord,
  SkillIterationRecord,
  SkillIterationSuggestion,
  FeedbackDimension,
  FeedbackIssueType,
} from './skill-benchmark.types';

/**
 * M3-2c: Skill 基准体系 - 评估反馈服务
 * 职责：
 * 1. 用户反馈采集（评分 + 维度 + 文本 + 问题类型）
 * 2. Skill 性能指标聚合统计（成功率、延迟、评分、Schema 通过率）
 * 3. 基于反馈的 Skill 迭代建议生成
 * 4. 迭代记录管理（支持回滚）
 */
@Injectable()
export class SkillBenchmarkService {
  private readonly logger = new Logger(SkillBenchmarkService.name);

  /** 触发自动迭代建议的阈值 */
  private readonly AUTO_ITERATION_THRESHOLD = {
    minFeedbacks: 3,
    maxAvgRating: 3.0,
    minFailureRate: 0.3,
  };

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  // ========== 用户反馈 ==========

  /**
   * 提交用户反馈
   */
  async submitFeedback(request: SubmitFeedbackRequest): Promise<FeedbackRecord> {
    // 1. 验证 session 存在
    const session = await this.db
      .select()
      .from(aiAnalysisSession)
      .where(eq(aiAnalysisSession.id, request.sessionId))
      .limit(1);

    if (session.length === 0) {
      throw new NotFoundException(`分析会话不存在: ${request.sessionId}`);
    }

    const sessionRow = session[0];

    // 2. 校验评分范围
    if (request.rating < 1 || request.rating > 5) {
      throw new BadRequestException('评分必须在 1-5 之间');
    }

    // 3. 校验维度评分
    if (request.dimensions) {
      for (const [, score] of Object.entries(request.dimensions)) {
        if (score < 1 || score > 5) {
          throw new BadRequestException('维度评分必须在 1-5 之间');
        }
      }
    }

    // 4. 检查是否已存在反馈（一个 session 仅允许一条反馈）
    const existing = await this.db
      .select({ id: aiAnalysisFeedback.id })
      .from(aiAnalysisFeedback)
      .where(eq(aiAnalysisFeedback.sessionId, request.sessionId))
      .limit(1);

    if (existing.length > 0) {
      // 更新已有反馈
      const updated = await this.db
        .update(aiAnalysisFeedback)
        .set({
          rating: request.rating,
          dimensions: (request.dimensions ?? {}) as Record<string, unknown>,
          comment: request.comment ?? null,
          issues: (request.issues ?? []) as unknown as Record<string, unknown>,
          isConsumed: false,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalysisFeedback.sessionId, request.sessionId))
        .returning();

      return this.toFeedbackRecord(updated[0]);
    }

    // 5. 插入新反馈
    const inserted = await this.db
      .insert(aiAnalysisFeedback)
      .values({
        sessionId: request.sessionId,
        skillKey: sessionRow.skillKey,
        pageScope: sessionRow.pageScope,
        rating: request.rating,
        dimensions: (request.dimensions ?? {}) as Record<string, unknown>,
        comment: request.comment ?? null,
        issues: (request.issues ?? []) as unknown as Record<string, unknown>,
        isConsumed: false,
      })
      .returning();

    return this.toFeedbackRecord(inserted[0]);
  }

  /**
   * 获取会话的反馈
   */
  async getFeedbackBySession(sessionId: string): Promise<FeedbackRecord | null> {
    const rows = await this.db
      .select()
      .from(aiAnalysisFeedback)
      .where(eq(aiAnalysisFeedback.sessionId, sessionId))
      .limit(1);
    return rows.length > 0 ? this.toFeedbackRecord(rows[0]) : null;
  }

  /**
   * 获取 Skill 的所有反馈
   */
  async getFeedbacksBySkill(skillKey: string, limit = 50): Promise<FeedbackRecord[]> {
    const rows = await this.db
      .select()
      .from(aiAnalysisFeedback)
      .where(eq(aiAnalysisFeedback.skillKey, skillKey))
      .orderBy(desc(aiAnalysisFeedback.createdAt))
      .limit(limit);
    return rows.map((r) => this.toFeedbackRecord(r));
  }

  // ========== 性能指标 ==========

  /**
   * 获取 Skill 性能指标（实时聚合）
   */
  async getSkillMetric(skillKey: string): Promise<SkillMetricRecord | null> {
    // 1. 从 session 表聚合执行统计
    const sessionStats = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${aiAnalysisSession.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${aiAnalysisSession.status} = 'failed')::int`,
        avgLatency: sql<number>`coalesce(avg(${aiAnalysisSession.latencyMs}), 0)::numeric(12,2)`,
        p95Latency: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${aiAnalysisSession.latencyMs}), 0)::numeric(12,2)`,
        avgTokens: sql<number>`coalesce(avg((${aiAnalysisSession.usage}->>'total_tokens')::numeric), 0)::numeric(12,2)`,
        lastExecution: sql<Date>`max(${aiAnalysisSession.createdAt})`,
      })
      .from(aiAnalysisSession)
      .where(eq(aiAnalysisSession.skillKey, skillKey));

    if (sessionStats.length === 0 || sessionStats[0].total === 0) {
      // 无执行记录，返回空指标
      return {
        skillKey,
        period: 'all-time',
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        schemaValidPasses: 0,
        schemaValidFailures: 0,
        schemaValidRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        avgTotalTokens: 0,
        totalFeedbacks: 0,
        avgRating: 0,
        ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        issueDistribution: {},
        lastExecutionAt: null,
        lastCalculatedAt: new Date().toISOString(),
      };
    }

    const stat = sessionStats[0];

    // 2. 获取所有反馈记录，在应用层聚合（避免复杂 SQL 子查询）
    const feedbacks = await this.db
      .select({
        rating: aiAnalysisFeedback.rating,
        issues: aiAnalysisFeedback.issues,
      })
      .from(aiAnalysisFeedback)
      .where(eq(aiAnalysisFeedback.skillKey, skillKey));

    const totalFeedbacks = feedbacks.length;
    const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    const issueDistribution: Record<string, number> = {};
    let ratingSum = 0;

    for (const f of feedbacks) {
      ratingSum += f.rating;
      ratingDistribution[String(f.rating)] = (ratingDistribution[String(f.rating)] ?? 0) + 1;
      const issues = (f.issues as unknown[]) ?? [];
      for (const issue of issues) {
        const key = String(issue);
        issueDistribution[key] = (issueDistribution[key] ?? 0) + 1;
      }
    }

    const avgRating = totalFeedbacks > 0 ? Math.round((ratingSum / totalFeedbacks) * 100) / 100 : 0;

    // Schema 校验统计从 outputData 中读取 _validationReport
    const schemaStats = await this.aggregateSchemaValidation(skillKey);

    const total = Number(stat.total) || 0;
    const successful = Number(stat.successful) || 0;

    return {
      skillKey,
      period: 'all-time',
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: Number(stat.failed) || 0,
      successRate: total > 0 ? Math.round((successful / total) * 10000) / 100 : 0,
      schemaValidPasses: schemaStats.passes,
      schemaValidFailures: schemaStats.failures,
      schemaValidRate:
        schemaStats.passes + schemaStats.failures > 0
          ? Math.round((schemaStats.passes / (schemaStats.passes + schemaStats.failures)) * 10000) / 100
          : 0,
      avgLatencyMs: Number(stat.avgLatency) || 0,
      p95LatencyMs: Number(stat.p95Latency) || 0,
      avgTotalTokens: Number(stat.avgTokens) || 0,
      totalFeedbacks,
      avgRating,
      ratingDistribution,
      issueDistribution,
      lastExecutionAt: stat.lastExecution ? new Date(stat.lastExecution).toISOString() : null,
      lastCalculatedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取所有 Skill 的性能指标概览
   */
  async getAllSkillMetrics(): Promise<SkillMetricRecord[]> {
    const skills = await this.db
      .select({ skillKey: aiSkill.skillKey })
      .from(aiSkill)
      .where(eq(aiSkill.isEnabled, true));

    const metrics: SkillMetricRecord[] = [];
    for (const skill of skills) {
      const metric = await this.getSkillMetric(skill.skillKey);
      if (metric) metrics.push(metric);
    }
    return metrics;
  }

  // ========== Skill 迭代 ==========

  /**
   * 生成 Skill 迭代建议（基于低分反馈）
   */
  async generateIterationSuggestion(skillKey: string): Promise<SkillIterationSuggestion | null> {
    // 1. 获取未消费的低分反馈
    const lowFeedbacks = await this.db
      .select()
      .from(aiAnalysisFeedback)
      .where(
        and(
          eq(aiAnalysisFeedback.skillKey, skillKey),
          eq(aiAnalysisFeedback.isConsumed, false),
          sql`${aiAnalysisFeedback.rating} <= 3`,
        ),
      )
      .orderBy(desc(aiAnalysisFeedback.createdAt))
      .limit(20);

    if (lowFeedbacks.length < this.AUTO_ITERATION_THRESHOLD.minFeedbacks) {
      return null;
    }

    // 2. 计算平均评分
    const avgRating =
      lowFeedbacks.reduce((sum, f) => sum + f.rating, 0) / lowFeedbacks.length;

    // 3. 统计问题类型分布
    const issueCounts: Record<string, number> = {};
    for (const f of lowFeedbacks) {
      const issues = (f.issues as unknown[]) ?? [];
      for (const issue of issues) {
        const key = String(issue);
        issueCounts[key] = (issueCounts[key] ?? 0) + 1;
      }
    }

    // 4. 生成建议
    const promptSuggestions: string[] = [];
    const schemaSuggestions: string[] = [];

    if (issueCounts['missing_analysis']) {
      promptSuggestions.push('增加分析维度的覆盖度，确保所有关键字段都有对应分析');
    }
    if (issueCounts['wrong_data']) {
      promptSuggestions.push('强化数据引用准确性，要求模型明确标注数据来源');
    }
    if (issueCounts['format_issue']) {
      promptSuggestions.push('明确输出 JSON 格式要求，添加格式示例');
    }
    if (issueCounts['too_generic']) {
      promptSuggestions.push('要求分析更具体化，避免泛泛而谈，必须引用具体数值');
    }
    if (issueCounts['too_verbose']) {
      promptSuggestions.push('精简输出长度，控制 summary 在 200 字以内');
    }

    // 基于评分分布给出 schema 建议
    if (avgRating < 2.5) {
      schemaSuggestions.push('考虑简化 outputSchema，减少必填字段数量');
    }
    if (issueCounts['missing_analysis'] > 0) {
      schemaSuggestions.push('在 outputSchema 中增加更多可选分析字段');
    }

    return {
      skillKey,
      feedbackCount: lowFeedbacks.length,
      avgRating: Math.round(avgRating * 100) / 100,
      suggestedType: avgRating < this.AUTO_ITERATION_THRESHOLD.maxAvgRating ? 'auto-feedback' : 'manual',
      reason: `基于 ${lowFeedbacks.length} 条低分反馈（平均评分 ${avgRating.toFixed(2)}），建议优化 Skill`,
      promptSuggestions: promptSuggestions.length > 0 ? promptSuggestions : ['暂无具体建议，请人工审查反馈'],
      schemaSuggestions: schemaSuggestions.length > 0 ? schemaSuggestions : ['暂无 schema 调整建议'],
      feedbackIds: lowFeedbacks.map((f) => f.id),
    };
  }

  /**
   * 获取 Skill 的迭代历史
   */
  async getIterationHistory(skillKey: string): Promise<SkillIterationRecord[]> {
    const rows = await this.db
      .select()
      .from(aiSkillIteration)
      .where(eq(aiSkillIteration.skillKey, skillKey))
      .orderBy(desc(aiSkillIteration.createdAt))
      .limit(20);
    return rows.map((r) => this.toIterationRecord(r));
  }

  /**
   * 记录 Skill 迭代（手动或自动触发时调用）
   */
  async recordIteration(params: {
    skillKey: string;
    fromVersion: number;
    toVersion: number;
    iterationType: 'manual' | 'auto-feedback' | 'auto-ab-test';
    reason: string;
    changesSummary: Record<string, unknown>;
    consumedFeedbackIds?: string[];
    previousPromptTemplate?: string;
    previousOutputSchema?: Record<string, unknown>;
  }): Promise<SkillIterationRecord> {
    const inserted = await this.db
      .insert(aiSkillIteration)
      .values({
        skillKey: params.skillKey,
        fromVersion: params.fromVersion,
        toVersion: params.toVersion,
        iterationType: params.iterationType,
        reason: params.reason,
        changesSummary: params.changesSummary,
        consumedFeedbackIds: (params.consumedFeedbackIds ?? []) as unknown as Record<string, unknown>,
        previousPromptTemplate: params.previousPromptTemplate ?? null,
        previousOutputSchema: (params.previousOutputSchema ?? null) as Record<string, unknown> | null,
      })
      .returning();

    // 标记已消费的反馈
    if (params.consumedFeedbackIds && params.consumedFeedbackIds.length > 0) {
      for (const feedbackId of params.consumedFeedbackIds) {
        await this.db
          .update(aiAnalysisFeedback)
          .set({ isConsumed: true, updatedAt: new Date() })
          .where(eq(aiAnalysisFeedback.id, feedbackId));
      }
    }

    return this.toIterationRecord(inserted[0]);
  }

  // ========== 工具方法 ==========

  /**
   * 聚合 Schema 校验统计（从 session outputData 中读取）
   */
  private async aggregateSchemaValidation(
    skillKey: string,
  ): Promise<{ passes: number; failures: number }> {
    try {
      const rows = await this.db
        .select({
          outputData: aiAnalysisSession.outputData,
        })
        .from(aiAnalysisSession)
        .where(eq(aiAnalysisSession.skillKey, skillKey));

      let passes = 0;
      let failures = 0;

      for (const row of rows) {
        const output = row.outputData as Record<string, unknown> | null;
        if (!output) continue;

        // 检查 _validationReport
        const report = output._validationReport as Record<string, unknown> | undefined;
        if (report && typeof report === 'object') {
          const level = report.level as string;
          if (level === 'pass') {
            passes++;
          } else if (level === 'error') {
            failures++;
          }
        }
      }

      return { passes, failures };
    } catch (error) {
      this.logger.warn(
        `Failed to aggregate schema validation for ${skillKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { passes: 0, failures: 0 };
    }
  }

  /**
   * 规范化评分分布
   */
  private normalizeRatingDist(dist: unknown): Record<string, number> {
    const result: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    if (dist && typeof dist === 'object') {
      for (const [key, value] of Object.entries(dist as Record<string, unknown>)) {
        result[key] = Number(value) || 0;
      }
    }
    return result;
  }

  /**
   * 规范化问题分布
   */
  private normalizeIssueDist(dist: unknown): Record<string, number> {
    const result: Record<string, number> = {};
    if (dist && typeof dist === 'object') {
      for (const [key, value] of Object.entries(dist as Record<string, unknown>)) {
        result[key] = Number(value) || 0;
      }
    }
    return result;
  }

  /**
   * 转换为反馈记录
   */
  private toFeedbackRecord(row: typeof aiAnalysisFeedback.$inferSelect): FeedbackRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      skillKey: row.skillKey,
      pageScope: row.pageScope,
      rating: row.rating,
      dimensions: (row.dimensions ?? {}) as Partial<Record<FeedbackDimension, number>>,
      comment: row.comment,
      issues: (row.issues ?? []) as unknown as FeedbackIssueType[],
      isConsumed: row.isConsumed,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 转换为迭代记录
   */
  private toIterationRecord(row: typeof aiSkillIteration.$inferSelect): SkillIterationRecord {
    return {
      id: row.id,
      skillKey: row.skillKey,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
      iterationType: row.iterationType as 'manual' | 'auto-feedback' | 'auto-ab-test',
      reason: row.reason,
      changesSummary: (row.changesSummary ?? {}) as Record<string, unknown>,
      consumedFeedbackIds: (row.consumedFeedbackIds ?? []) as unknown as string[],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
