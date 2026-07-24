import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Req,
  Param,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { RouteProfileService } from './route-profile.service';
import type {
  UploadRouteRequest,
  UploadRouteResponse,
  GetRoutesParams,
  GetRoutesResponse,
  DeleteRouteResponse,
  GetRouteUploadRecordResponse,
} from '@shared/api.interface';

@Controller('api/routes')
export class RouteProfileController {
  private readonly logger = new Logger(RouteProfileController.name);
  constructor(private readonly service: RouteProfileService) {}

  @Get('upload-record')
  async getLatestUploadRecord(): Promise<GetRouteUploadRecordResponse> {
    return this.service.getLatestUploadRecord();
  }

  @Get('names')
  async getRouteNames(): Promise<string[]> {
    return this.service.getAllRouteNames();
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ): Promise<GetRoutesResponse> {
    return this.service.findAll(
      parseInt(page ?? '1', 10),
      parseInt(pageSize ?? '20', 10),
      keyword,
    );
  }

  @Post()
  @HttpCode(200)
  async upload(
    @Req() req: any,
    @Body() body: UploadRouteRequest,
  ): Promise<UploadRouteResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    this.logger.log(`上传请求: body.routes 长度 = ${body?.routes?.length ?? 0}`);
    try {
      const result = await this.service.upsertBatch(body.routes, userId);
      this.logger.log(`上传成功: inserted=${result.inserted}, updated=${result.updated}, total=${result.total}`);
      return result;
    } catch (err) {
      this.logger.error(`上传失败: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  @Delete()
  async removeAll(@Req() req: any): Promise<DeleteRouteResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeAll(userId);
  }

  @Delete(':id')
  async removeOne(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<DeleteRouteResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeOne(id, userId);
  }
}
