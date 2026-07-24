import { Controller, Get, Post, Delete, Query, Param, Body, Req } from '@nestjs/common';
import { RouteMappingService } from './route-mapping.service';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  GetRouteMappingsResponse,
  UploadRouteMappingRequest,
  UploadRouteMappingResponse,
  DeleteRouteMappingResponse,
} from '@shared/api.interface';

@Controller('api/route-mappings')
export class RouteMappingController {
  constructor(private readonly routeMappingService: RouteMappingService) {}

  @Get()
  async getRouteMappings(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ): Promise<GetRouteMappingsResponse> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 20;
    return this.routeMappingService.getRouteMappings(p, ps, keyword);
  }

  @NeedLogin()
  @Post()
  async uploadRouteMappings(
    @Req() req: any,
    @Body() body: UploadRouteMappingRequest,
  ): Promise<UploadRouteMappingResponse> {
    const userId: string = req.userContext.userId;
    return this.routeMappingService.uploadRouteMappings(body.mappings, userId);
  }

  @NeedLogin()
  @Delete(':id')
  async deleteRouteMapping(@Param('id') id: string): Promise<DeleteRouteMappingResponse> {
    return this.routeMappingService.deleteRouteMapping(id);
  }
}
