import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
  Logger,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import type {
  GenerateReportRequest,
  GenerateReportResponse,
  GetReportsParams,
  GetReportsResponse,
  ReportRecord,
} from '@shared/api.interface';

@Controller('api/reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);
  constructor(private readonly service: ReportsService) {}

  /** 生成报表（前端上传 sheets 描述，后端渲染 Excel 并持久化） */
  @Post('generate')
  async generate(
    @Req() req: any,
    @Body() body: GenerateReportRequest,
  ): Promise<GenerateReportResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    const report = await this.service.generate(body, userId);
    return { report };
  }

  /** 报表列表（仅返回当前用户的报表） */
  @Get()
  async findAll(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<GetReportsResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.findAll({
      userId,
      type,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  /** 报表元数据 */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ReportRecord> {
    const record = await this.service.findById(id);
    if (!record) {
      throw new NotFoundException(`报表不存在: ${id}`);
    }
    return record;
  }

  /** 下载报表（attachment） */
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.service.getFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.status(HttpStatus.OK).send(file.buffer);
  }

  /** 在线查看报表（inline；浏览器不支持 xlsx 预览时会自动转为下载） */
  @Get(':id/preview')
  async preview(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.service.getFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.status(HttpStatus.OK).send(file.buffer);
  }

  /** 删除报表（文件 + 记录） */
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string): Promise<{ success: boolean }> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    await this.service.remove(id, userId);
    return { success: true };
  }

  /** 删除当前用户的全部报表（文件 + 记录） */
  @Delete()
  async removeAll(@Req() req: any): Promise<{ success: boolean; deletedCount: number }> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeAll(userId);
  }
}
