import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SkillBenchmarkService } from './skill-benchmark.service';
import type { SubmitFeedbackRequest } from './skill-benchmark.types';

/**
 * M3-2c: Skill 基准体系 - 评估反馈控制器
 * 提供用户反馈、性能指标、迭代建议的 API 端点
 */
@Controller('api/ai-analysis')
export class SkillBenchmarkController {
  constructor(private readonly benchmarkService: SkillBenchmarkService) {}

  // ========== 用户反馈 ==========

  /** 提交反馈 */
  @Post('sessions/:sessionId/feedback')
  async submitFeedback(
    @Param('sessionId') sessionId: string,
    @Body() body: Omit<SubmitFeedbackRequest, 'sessionId'>,
  ) {
    const feedback = await this.benchmarkService.submitFeedback({
      ...body,
      sessionId,
    });
    return { item: feedback };
  }

  /** 获取会话的反馈 */
  @Get('sessions/:sessionId/feedback')
  async getFeedback(@Param('sessionId') sessionId: string) {
    const feedback = await this.benchmarkService.getFeedbackBySession(sessionId);
    return { item: feedback };
  }

  /** 获取 Skill 的反馈列表 */
  @Get('skills/:skillKey/feedbacks')
  async getFeedbacksBySkill(
    @Param('skillKey') skillKey: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const feedbacks = await this.benchmarkService.getFeedbacksBySkill(skillKey, limitNum);
    return { items: feedbacks };
  }

  // ========== 性能指标 ==========

  /** 获取单个 Skill 的性能指标 */
  @Get('skills/:skillKey/metrics')
  async getSkillMetric(@Param('skillKey') skillKey: string) {
    const metric = await this.benchmarkService.getSkillMetric(skillKey);
    return { item: metric };
  }

  /** 获取所有 Skill 的性能指标概览 */
  @Get('metrics/overview')
  async getAllMetrics() {
    const metrics = await this.benchmarkService.getAllSkillMetrics();
    return { items: metrics };
  }

  // ========== Skill 迭代 ==========

  /** 生成 Skill 迭代建议 */
  @Get('skills/:skillKey/iteration-suggestion')
  async getIterationSuggestion(@Param('skillKey') skillKey: string) {
    const suggestion = await this.benchmarkService.generateIterationSuggestion(skillKey);
    return { item: suggestion };
  }

  /** 获取 Skill 迭代历史 */
  @Get('skills/:skillKey/iterations')
  async getIterationHistory(@Param('skillKey') skillKey: string) {
    const iterations = await this.benchmarkService.getIterationHistory(skillKey);
    return { items: iterations };
  }
}
