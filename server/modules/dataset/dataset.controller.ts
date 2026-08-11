import { Controller, Get, Post, Delete, Query, Param, Req, Body } from '@nestjs/common';
import { DatasetService } from './dataset.service';
import type {
  GetDatasetsResponse,
  GetDatasetsParams,
  CreateDatasetRequest,
  CreateDatasetResponse,
  AppendRecordsRequest,
  AppendRecordsResponse,
  DeleteDatasetResponse,
  DatasetDetail,
  KpiData,
  TrendChartData,
  BarChartData,
  PieChartData,
  ChartFilterParams,
  HeatmapResponse,
  HeatmapFilterParams,
  TimeGranularity,
  GetUnconvertedStoresResponse,
  BrandSpecStatsResponse,
  BrandSpecMonthlyStatsResponse,
  SalesRepDrilldownResponse,
  SalesRepUnconvertedDrilldownResponse,
  SystemStatusResponse,
  CheckDuplicatesRequest,
  CheckDuplicatesResponse,
  DatasetSpecOptions,
  AtpPerformanceResponse,
  AtpPerformanceStoreDetailResponse,
  AtpAvailableMonthsResponse,
} from '@shared/api.interface';

@Controller('api/datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Get('system-status')
  async getSystemStatus(): Promise<SystemStatusResponse> {
    return this.datasetService.getSystemStatus();
  }

  @Get()
  async findAll(@Query() query: GetDatasetsParams): Promise<GetDatasetsResponse> {
    const page = query.page ? parseInt(String(query.page), 10) : 1;
    const pageSize = query.pageSize ? parseInt(String(query.pageSize), 10) : 20;
    return this.datasetService.findAll(page, pageSize);
  }

  @Post()
  async create(@Req() req: any, @Body() body: CreateDatasetRequest): Promise<CreateDatasetResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.datasetService.create(body.name, body.fields, body.records, userId, body.dedupMode, body.existingDatasetId);
  }

  @Post('merge-by-months')
  async mergeByMonths(@Req() req: any, @Body() body: CreateDatasetRequest & { uploadMonths?: string[] }): Promise<CreateDatasetResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.datasetService.mergeByMonths(body.name, body.fields, body.records ?? [], userId, body.uploadMonths);
  }

  @Post('check-duplicates')
  async checkDuplicates(@Body() body: CheckDuplicatesRequest): Promise<CheckDuplicatesResponse> {
    return this.datasetService.checkDuplicates(body.fields, body.records);
  }

  @Get('atp-months')
  async getAtpAvailableMonths(): Promise<AtpAvailableMonthsResponse> {
    return this.datasetService.getAtpAvailableMonths();
  }

  @Get('atp-performance')
  async getAtpPerformance(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('granularity') granularity?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('brand') brand?: string,
    @Query('salesRep') salesRep?: string,
    @Query('specification') specification?: string,
    @Query('feeLe10') feeLe10?: string,
    @Query('feeGt15') feeGt15?: string,
    @Query('salesLt1000') salesLt1000?: string,
    @Query('salesLt2000') salesLt2000?: string,
  ): Promise<AtpPerformanceResponse> {
    const g = (['day', 'week', 'month', 'year'].includes(granularity ?? '') ? granularity : 'day') as TimeGranularity;
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    const num = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return this.datasetService.getAtpPerformance(dateFrom, dateTo, g, {
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      isPaid: split(isPaid),
      customerKeyword,
      brand: split(brand),
      salesRep: split(salesRep),
      specification: split(specification),
    }, {
      feeLe10: num(feeLe10),
      feeGt15: num(feeGt15),
      salesLt1000: num(salesLt1000),
      salesLt2000: num(salesLt2000),
    });
  }

  @Get('atp-performance-store-detail')
  async getAtpPerformanceStoreDetail(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('granularity') granularity?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('brand') brand?: string,
    @Query('salesRep') salesRep?: string,
    @Query('specification') specification?: string,
    @Query('feeLe10') feeLe10?: string,
    @Query('feeGt15') feeGt15?: string,
    @Query('salesLt1000') salesLt1000?: string,
    @Query('salesLt2000') salesLt2000?: string,
  ): Promise<AtpPerformanceStoreDetailResponse> {
    const g = (['day', 'week', 'month', 'year'].includes(granularity ?? '') ? granularity : 'day') as TimeGranularity;
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    const num = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return this.datasetService.getAtpPerformanceStoreDetail(dateFrom, dateTo, g, {
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      isPaid: split(isPaid),
      customerKeyword,
      brand: split(brand),
      salesRep: split(salesRep),
      specification: split(specification),
    }, {
      feeLe10: num(feeLe10),
      feeGt15: num(feeGt15),
      salesLt1000: num(salesLt1000),
      salesLt2000: num(salesLt2000),
    });
  }

  @Post(':id/records')
  async appendRecords(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AppendRecordsRequest,
  ): Promise<AppendRecordsResponse> {
    const userId: string = req.userContext?.userId ?? 'dev-user';
    return this.datasetService.appendRecords(id, body.records, userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<DeleteDatasetResponse> {
    return this.datasetService.remove(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<DatasetDetail> {
    return this.datasetService.findOne(id);
  }

  @Get(':id/kpis')
  async getKpis(
    @Param('id') id: string,
    @Query() query: ChartFilterParams,
  ): Promise<KpiData> {
    return this.datasetService.getKpis(id, query);
  }

  @Get(':id/charts/trend')
  async getTrendChart(
    @Param('id') id: string,
    @Query() query: ChartFilterParams,
  ): Promise<TrendChartData> {
    return this.datasetService.getTrendChart(id, query);
  }

  @Get(':id/charts/bar')
  async getBarChart(
    @Param('id') id: string,
    @Query() query: ChartFilterParams,
  ): Promise<BarChartData> {
    return this.datasetService.getBarChart(id, query);
  }

  @Get(':id/charts/pie')
  async getPieChart(
    @Param('id') id: string,
    @Query() query: ChartFilterParams,
  ): Promise<PieChartData> {
    return this.datasetService.getPieChart(id, query);
  }

  @Get(':id/heatmap')
  async getHeatmap(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('granularity') granularity?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('compositeFormat') compositeFormat?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('brand') brand?: string,
    @Query('salesRep') salesRep?: string,
    @Query('sheetType') sheetType?: string,
    @Query('specification') specification?: string,
    @Query('route') route?: string,
    @Query('mode') mode?: string,
  ): Promise<HeatmapResponse> {
    const g = (['day', 'week', 'month', 'year'].includes(granularity ?? '') ? granularity : 'day') as TimeGranularity;
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    const m = mode === 'daily' ? 'daily' : 'cumulative';
    return this.datasetService.getHeatmapData(id, dateFrom, dateTo, g, {
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      compositeFormat: split(compositeFormat),
      isPaid: split(isPaid),
      customerKeyword,
      brand: split(brand),
      salesRep: split(salesRep),
      sheetType: split(sheetType) as HeatmapFilterParams['sheetType'],
      specification: split(specification),
      route: split(route),
      mode: m,
    });
  }

  @Post(':id/cleanup-duplicates')
  async cleanupDuplicates(@Param('id') id: string): Promise<{ removed: number }> {
    return this.datasetService.cleanupDuplicates(id);
  }

  @Get(':id/unconverted-stores')
  async getUnconvertedStores(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('brand') brand?: string,
    @Query('salesRep') salesRep?: string,
    @Query('sheetType') sheetType?: string,
    @Query('specification') specification?: string,
    @Query('route') route?: string,
  ): Promise<GetUnconvertedStoresResponse> {
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    return this.datasetService.getUnconvertedStores(id, dateFrom, dateTo, {
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      isPaid: split(isPaid),
      customerKeyword,
      brand: split(brand),
      salesRep: split(salesRep),
      sheetType: split(sheetType) as HeatmapFilterParams['sheetType'],
      specification: split(specification),
      route: split(route),
    });
  }

  @Get(':id/brand-spec-stats')
  async getBrandSpecStats(
    @Param('id') id: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('dealDateFrom') dealDateFrom?: string,
    @Query('dealDateTo') dealDateTo?: string,
    @Query('region') region?: string,
    @Query('tier') tier?: string,
    @Query('dealerType') dealerType?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('brand') brand?: string,
    @Query('salesRep') salesRep?: string,
    @Query('sheetType') sheetType?: string,
    @Query('specification') specification?: string,
    @Query('route') route?: string,
  ): Promise<BrandSpecStatsResponse> {
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    return this.datasetService.getBrandSpecStats(id, dateFrom, dateTo, {
      region: split(region),
      tier: split(tier),
      dealerType: split(dealerType),
      isPaid: split(isPaid),
      customerKeyword,
      brand: split(brand),
      salesRep: split(salesRep),
      sheetType: split(sheetType) as HeatmapFilterParams['sheetType'],
      specification: split(specification),
      route: split(route),
    }, dealDateFrom, dealDateTo);
  }

  @Get('brand-spec-options')
  async getAllBrandSpecOptions(): Promise<{ brands: string[]; specifications: string[] }> {
    return this.datasetService.getAllBrandSpecOptions();
  }

  @Get(':id/brand-spec-monthly')
  async getBrandSpecMonthlyStats(
    @Param('id') id: string,
    @Query('salesRep') salesRep: string,
    @Query('region') region: string,
    @Query('tier') tier: string,
    @Query('brand') brand?: string,
    @Query('specification') specification?: string,
    @Query('sheetType') sheetType?: string,
    @Query('dealerType') dealerType?: string,
    @Query('isPaid') isPaid?: string,
    @Query('customerKeyword') customerKeyword?: string,
    @Query('route') route?: string,
  ): Promise<BrandSpecMonthlyStatsResponse> {
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    return this.datasetService.getBrandSpecMonthlyStats(id, salesRep, region, tier, {
      brand: split(brand),
      specification: split(specification),
      sheetType: split(sheetType) as HeatmapFilterParams['sheetType'],
      dealerType: split(dealerType),
      isPaid: split(isPaid),
      customerKeyword,
      route: split(route),
    });
  }

  @Get(':id/spec-options')
  async getSpecOptions(
    @Param('id') id: string,
    @Query('sheetType') sheetType?: string,
    @Query('brand') brand?: string,
  ): Promise<DatasetSpecOptions> {
    const split = (v?: string) => v ? v.split(',').filter(Boolean) : undefined;
    return this.datasetService.getSpecOptions(id, split(sheetType), split(brand));
  }

  @Get(':id/sales-rep-drilldown')
  async getSalesRepDrilldown(
    @Param('id') id: string,
    @Query('salesRep') salesRep: string,
    @Query('region') region: string,
    @Query('tier') tier: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ): Promise<SalesRepDrilldownResponse> {
    return this.datasetService.getSalesRepDrilldown(id, salesRep, region, tier, dateFrom, dateTo);
  }

  @Get(':id/sales-rep-unconverted-drilldown')
  async getSalesRepUnconvertedDrilldown(
    @Param('id') id: string,
    @Query('salesRep') salesRep: string,
    @Query('region') region: string,
    @Query('tier') tier: string,
    @Query('dateTo') dateTo: string,
  ): Promise<SalesRepUnconvertedDrilldownResponse> {
    return this.datasetService.getSalesRepUnconvertedDrilldown(id, salesRep, region, tier, dateTo);
  }

}
