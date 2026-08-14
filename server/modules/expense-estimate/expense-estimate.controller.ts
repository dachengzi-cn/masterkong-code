import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Req,
  Param,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ExpenseEstimateService } from './expense-estimate.service';
import type {
  CreateExpenseEstimateRequest,
  UpdateExpenseEstimateRequest,
  ExpenseEstimateListResponse,
  ExpenseEstimateFilterParams,
  ExpenseEstimateSummary,
  ExpenseEstimateOptions,
  ExpenseEstimateMutationResponse,
} from '@shared/api.interface';

@Controller('api/expense-estimates')
export class ExpenseEstimateController {
  private readonly logger = new Logger(ExpenseEstimateController.name);

  constructor(private readonly service: ExpenseEstimateService) {}

  @Get('options')
  async getOptions(): Promise<ExpenseEstimateOptions> {
    return this.service.getOptions();
  }

  @Get('summary')
  async getSummary(@Query() query: Record<string, string>): Promise<ExpenseEstimateSummary> {
    return this.service.summary(this.toFilters(query));
  }

  @Get()
  async list(@Query() query: Record<string, string>): Promise<ExpenseEstimateListResponse> {
    return this.service.list(this.toFilters(query));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: any,
    @Body() body: CreateExpenseEstimateRequest,
  ): Promise<ExpenseEstimateMutationResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    try {
      const result = await this.service.create(body, userId);
      this.logger.log(`费用登记创建成功: id=${result.id}`);
      return result;
    } catch (err) {
      this.logger.error(`费用登记创建失败: ${(err as Error).message}`);
      throw err;
    }
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateExpenseEstimateRequest,
  ): Promise<ExpenseEstimateMutationResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    const result = await this.service.update(id, body, userId);
    this.logger.log(`费用登记更新成功: id=${id}`);
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
  ): Promise<ExpenseEstimateMutationResponse> {
    const result = await this.service.remove(id);
    this.logger.log(`费用登记删除成功: id=${id}`);
    return result;
  }

  private toFilters(query: Record<string, string>): ExpenseEstimateFilterParams {
    return {
      monthFrom: query.monthFrom,
      monthTo: query.monthTo,
      region: query.region,
      department: query.department,
      subject: query.subject,
      activity: query.activity,
      keyword: query.keyword,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    };
  }
}
