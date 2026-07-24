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
import { ExpenseProfileService } from './expense-profile.service';
import type {
  UploadExpenseRequest,
  UploadExpenseResponse,
  GetExpensesParams,
  GetExpensesResponse,
  DeleteExpenseResponse,
  GetExpenseUploadRecordResponse,
  ExpiryAnalysisFilters,
  ExpiryAnalysisResult,
  ExpiryDrilldownResult,
  ExpiryOver500StoreDetail,
  ExpiryRankingExportResult,
  OverstockAnalysisResult,
  OverstockAnalysisExportResult,
} from '@shared/api.interface';
import { ExpiryAnalysisService } from './expiry-analysis.service';
import { OverstockAnalysisService } from './overstock-analysis.service';

@Controller('api/expenses')
export class ExpenseProfileController {
  private readonly logger = new Logger(ExpenseProfileController.name);
  constructor(
    private readonly service: ExpenseProfileService,
    private readonly expiryAnalysisService: ExpiryAnalysisService,
    private readonly overstockAnalysisService: OverstockAnalysisService,
  ) {}

  @Get('upload-record')
  async getLatestUploadRecord(): Promise<GetExpenseUploadRecordResponse> {
    return this.service.getLatestUploadRecord();
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('sheetType') sheetType?: string,
  ): Promise<GetExpensesResponse> {
    return this.service.findAll(
      parseInt(page ?? '1', 10),
      parseInt(pageSize ?? '20', 10),
      keyword,
      sheetType,
    );
  }

  @Post()
  @HttpCode(200)
  async upload(
    @Req() req: any,
    @Body() body: UploadExpenseRequest,
  ): Promise<UploadExpenseResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    this.logger.log(`上传费用请求: body.expenses 长度 = ${body?.expenses?.length ?? 0}`);
    try {
      const result = await this.service.upsertBatch(body.expenses, userId, false, body.uploadMonths);
      this.logger.log(`上传成功: inserted=${result.inserted}, updated=${result.updated}, total=${result.total}`);
      return result;
    } catch (err) {
      this.logger.error(`上传失败: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  @Post('overwrite')
  @HttpCode(200)
  async overwrite(
    @Req() req: any,
    @Body() body: UploadExpenseRequest,
  ): Promise<UploadExpenseResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    this.logger.log(`覆盖上传费用请求: body.expenses 长度 = ${body?.expenses?.length ?? 0}`);
    try {
      const result = await this.service.upsertBatch(body.expenses, userId, true, body.uploadMonths);
      this.logger.log(`覆盖上传成功: inserted=${result.inserted}, updated=${result.updated}, total=${result.total}`);
      return result;
    } catch (err) {
      this.logger.error(`覆盖上传失败: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  @Delete()
  async removeAll(@Req() req: any): Promise<DeleteExpenseResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeAll(userId);
  }

  @Delete(':id')
  async removeOne(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<DeleteExpenseResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.service.removeOne(id, userId);
  }

  @Get('expiry-analysis')
  async getExpiryAnalysis(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
    @Query('amountThreshold') amountThreshold?: string,
  ): Promise<ExpiryAnalysisResult> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters: ExpiryAnalysisFilters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
      amountThreshold: amountThreshold !== undefined ? Number(amountThreshold) : undefined,
    };
    return this.expiryAnalysisService.analyze(filters);
  }

  @Get('expiry-drilldown')
  async getExpiryDrilldown(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
    @Query('amountThreshold') amountThreshold?: string,
  ): Promise<ExpiryDrilldownResult> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters: ExpiryAnalysisFilters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
      amountThreshold: amountThreshold !== undefined ? Number(amountThreshold) : undefined,
    };
    return this.expiryAnalysisService.getDrilldown(filters);
  }

  @Get('expiry-over500-stores')
  async getOver500StoreDetails(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
    @Query('amountThreshold') amountThreshold?: string,
  ): Promise<ExpiryOver500StoreDetail[]> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters: ExpiryAnalysisFilters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
      amountThreshold: amountThreshold !== undefined ? Number(amountThreshold) : undefined,
    };
    return this.expiryAnalysisService.getOver500StoreDetails(filters);
  }

  @Get('expiry-ranking-export')
  async getExpiryRankingExport(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
  ): Promise<ExpiryRankingExportResult> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters: ExpiryAnalysisFilters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
    };
    return this.expiryAnalysisService.getRankingExport(filters);
  }

  @Get('overstock-analysis')
  async getOverstockAnalysis(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
    @Query('salesRep') salesRep?: string,
  ): Promise<OverstockAnalysisResult> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
      salesRep: split(salesRep),
    };
    return this.overstockAnalysisService.analyze(filters);
  }

  @Get('overstock-analysis-export')
  async getOverstockAnalysisExport(
    @Query('monthFrom') monthFrom?: string,
    @Query('monthTo') monthTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('business') business?: string,
    @Query('specification') specification?: string,
    @Query('salesRep') salesRep?: string,
  ): Promise<OverstockAnalysisExportResult> {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const filters = {
      monthFrom,
      monthTo,
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      business: split(business),
      specification: split(specification),
      salesRep: split(salesRep),
    };
    return this.overstockAnalysisService.getExport(filters);
  }
}
