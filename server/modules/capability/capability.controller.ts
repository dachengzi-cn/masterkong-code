import { Body, Controller, Get, HttpStatus, Put, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CapabilityService } from './capability.service';
import type {
  CapabilityDimensionMeta,
  CapabilityDimensionUpdateRequest,
  CapabilityDimensionUpdateResponse,
  CapabilityExportParams,
  CapabilityInsightsParams,
  CapabilityInsightsResult,
  CapabilityOptions,
  CapabilityScoreParams,
  CapabilityScoreResult,
} from '@shared/api.interface';

@Controller('api/capability')
export class CapabilityController {
  constructor(private readonly capabilityService: CapabilityService) {}

  /** 下拉选项：可选所别、业代（随所别联动）、有数据月份 */
  @Get('options')
  async getOptions(@Req() req: any): Promise<CapabilityOptions> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.capabilityService.getOptions(userId);
  }

  /** 维度元信息 + 当前权重/阈值/启用状态 */
  @Get('dimensions')
  async getDimensions(@Req() req: any): Promise<CapabilityDimensionMeta[]> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.capabilityService.getDimensionMetas(userId);
  }

  /** 保存维度权重/阈值/启用配置 */
  @Put('dimensions')
  async updateDimensions(
    @Req() req: any,
    @Body() body: CapabilityDimensionUpdateRequest,
  ): Promise<CapabilityDimensionUpdateResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.capabilityService.updateDimensions(userId, body);
  }

  /** 核心评估：各维度得分 + 总分/战力等级 + 环比/同比对比 */
  @Get('score')
  async getScore(@Req() req: any, @Query() query: CapabilityScoreParams): Promise<CapabilityScoreResult> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.capabilityService.getScore(query, userId);
  }

  /** 解读与建议：优势/短板/评估结论/改进建议 */
  @Get('insights')
  async getInsights(@Req() req: any, @Query() query: CapabilityInsightsParams): Promise<CapabilityInsightsResult> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.capabilityService.getInsights(query, userId);
  }

  /** 导出评估报告（xlsx 附件直下：维度得分 + 原始指标 + 评估结论） */
  @Get('export')
  async export(
    @Req() req: any,
    @Query() query: CapabilityExportParams,
    @Res() res: Response,
  ): Promise<void> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    const file = await this.capabilityService.exportReport(query, userId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.status(HttpStatus.OK).send(file.buffer);
  }
}
