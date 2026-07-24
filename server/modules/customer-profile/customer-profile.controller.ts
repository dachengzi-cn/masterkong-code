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
import { CustomerProfileService } from './customer-profile.service';
import type {
  CustomerSummary,
  UploadCustomerRequest,
  UploadCustomerResponse,
  GetCustomersParams,
  GetCustomersResponse,
  DeleteCustomerResponse,
  GetCustomerDimensionsResponse,
  GetClassificationResponse,
  FilterOptions,
  FormatDrilldownResponse,
  GetCustomerUploadRecordResponse,
} from '@shared/api.interface';

@Controller('api/customers')
export class CustomerProfileController {
  private readonly logger = new Logger(CustomerProfileController.name);
  constructor(private readonly service: CustomerProfileService) {}

  @Get('summary')
  async getSummary(): Promise<CustomerSummary> {
    return this.service.getSummary();
  }

  @Get('upload-record')
  async getLatestUploadRecord(): Promise<GetCustomerUploadRecordResponse> {
    return this.service.getLatestUploadRecord();
  }

  @Get('classification/drilldown')
  async getFormatDrilldown(
    @Query('region') region: string,
  ): Promise<FormatDrilldownResponse> {
    return this.service.getFormatDrilldown(region);
  }

  @Get('classification')
  async getClassification(): Promise<GetClassificationResponse> {
    return this.service.getClassification();
  }

  @Get('filter-options')
  async getFilterOptions(
    @Query('region') region?: string,
  ): Promise<FilterOptions> {
    const regions = region ? region.split(',').filter(Boolean) : undefined;
    return this.service.getFilterOptions(regions);
  }

  @Get('dimensions')
  async getDimensions(
    @Query('datasetId') datasetId?: string,
  ): Promise<GetCustomerDimensionsResponse> {
    return this.service.getDimensions(datasetId);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ): Promise<GetCustomersResponse> {
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
    @Body() body: UploadCustomerRequest,
  ): Promise<UploadCustomerResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    this.logger.log(`上传请求: body.customers 长度 = ${body?.customers?.length ?? 0}`);
    try {
      const result = await this.service.upsertBatch(body.customers, userId);
      this.logger.log(`上传成功: inserted=${result.inserted}, updated=${result.updated}, total=${result.total}`);
      return result;
    } catch (err) {
      this.logger.error(`上传失败: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  @Delete()
  async removeAll(@Req() req: any): Promise<DeleteCustomerResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeAll(userId);
  }

  @Delete(':id')
  async removeOne(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<DeleteCustomerResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeOne(id, userId);
  }
}
