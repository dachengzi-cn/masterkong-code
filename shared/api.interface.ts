/* 前后端共享的类型写在这里 */

export type FieldConfig = {
  name: string;
  type: 'text' | 'number' | 'date';
};

export type DatasetStatus = 'pending' | 'parsed' | 'failed';

export interface Dataset {
  id: string;
  name: string;
  rowCount: number;
  status: DatasetStatus;
  fields: FieldConfig[];
  createdAt: string;
}

export interface DatasetListItem {
  id: string;
  name: string;
  rowCount: number;
  status: DatasetStatus;
  createdAt: string;
}

export interface GetDatasetsResponse {
  items: DatasetListItem[];
  total: number;
}

export interface GetDatasetsParams {
  page?: number;
  pageSize?: number;
}

export interface CreateDatasetRequest {
  name: string;
  fields: FieldConfig[];
  records: Record<string, unknown>[];
  dedupMode?: 'overwrite' | 'new_only';
  existingDatasetId?: string;
  uploadMonths?: string[];
}

export interface CheckDuplicatesRequest {
  fields: FieldConfig[];
  records: Record<string, unknown>[];
}

export interface CheckDuplicatesResponse {
  duplicateCount: number;
  totalCount: number;
  existingDatasetId: string | null;
  existingDatasetName: string | null;
}

export interface AppendRecordsRequest {
  records: Record<string, unknown>[];
}

export interface AppendRecordsResponse {
  appended: number;
}

export interface CreateDatasetResponse {
  id: string;
}

export interface DeleteDatasetResponse {
  success: boolean;
}

export interface DatasetDetail {
  id: string;
  name: string;
  fields: FieldConfig[];
  rowCount: number;
  createdAt: string;
  customerCodeField?: string;
}

export interface KpiData {
  totalRecords: number;
  totalAmount: number;
  avgValue: number;
  maxValue: number;
  minValue: number;
  yearOnYearChange: number;
}

export interface TrendChartData {
  xAxis: string[];
  series: Array<{
    name: string;
    data: number[];
  }>;
}

export interface BarChartData {
  categories: string[];
  data: number[];
}

export interface PieChartData {
  items: Array<{
    name: string;
    value: number;
  }>;
}

export interface ChartFilterParams {
  dimension?: string;
  metric?: string;
  startDate?: string;
  endDate?: string;
  filters?: Record<string, string[]>;
  customerDimension?: string;
}

export interface CustomerProfile {
  customerCode: string;
  customerName: string;
  region: string;
  tier: string;
  extras: Record<string, unknown>;
}

export interface CustomerSummary {
  totalCustomers: number;
  regions: string[];
  tiers: string[];
}

export interface CustomerUploadRecord {
  fileName: string;
  uploadTime: string;
  rowCount: number;
}

export type GetCustomerUploadRecordResponse = CustomerUploadRecord | null;

export interface UploadCustomerRequest {
  customers: CustomerProfile[];
}

export interface UploadCustomerResponse {
  inserted: number;
  updated: number;
  total: number;
}

export interface GetCustomersParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface GetCustomersResponse {
  items: CustomerProfile[];
  total: number;
}

export interface CustomerDimension {
  field: string;
  label: string;
}

export interface GetCustomerDimensionsResponse {
  dimensions: CustomerDimension[];
  matched: boolean;
}

export interface DeleteCustomerResponse {
  success: boolean;
}

export interface ClassificationRow {
  region: string;
  tier: string;
  customerManager: string;
  storeCount: number;
  paidStoreCount: number;
  paidAmount: number;
}

export interface StoreFormatItem {
  region: string;
  simpleType: string;
  storeCount: number;
}

export interface FormatDrilldownPersonnel {
  name: string;
  formats: Record<string, number>;
  totalStores: number;
}

export interface FormatDrilldownMonthlyRate {
  month: string;
  rates: Record<string, number>;
}

export interface FormatDrilldownResponse {
  personnel: FormatDrilldownPersonnel[];
  monthlyRates: FormatDrilldownMonthlyRate[];
  formatTypes: string[];
}

export type SheetType = '一阶订单' | '二阶订单' | '一阶回单' | '二阶回单';

export const SHEET_TYPES: SheetType[] = ['一阶订单', '二阶订单', '一阶回单', '二阶回单'];

export interface HeatmapFilterParams {
  region?: string[];
  tier?: string[];
  dealerType?: string[];
  compositeFormat?: string[];
  isPaid?: string[];
  customerKeyword?: string;
  brand?: string[];
  salesRep?: string[];
  sheetType?: SheetType[];
  specification?: string[];
  route?: string[];
  /** 成交率计算模式：cumulative=累计成交率（默认），daily=当日成交率 */
  mode?: 'cumulative' | 'daily';
}

export type TimeGranularity = 'day' | 'week' | 'month' | 'year';

export interface HeatmapColumnHeader {
  index: number;
  label: string;
  subLabel?: string;
  isHoliday?: boolean;
}

export interface HeatmapDailyData {
  day: number;
  label: string;
  rate: number | null;
  stores: number | null;
  /** 当日线路总点数（分母，仅当日模式） */
  routeStores?: number | null;
  /** 当日订单箱数 */
  orders?: number | null;
}

export type HeatmapRowType = 'data' | 'tier' | 'region' | 'total';

export interface HeatmapRow {
  salesRep: string;
  region: string;
  tier: string;
  servicePoints: number;
  totalOrders: number;
  dailyData: HeatmapDailyData[];
  /** 行类型：data=普通业代数据行，tier=一阶/二阶合计，region=所别合计，total=部别合计 */
  rowType?: HeatmapRowType;
}

export interface HeatmapResponse {
  rows: HeatmapRow[];
  columns: HeatmapColumnHeader[];
  granularity: TimeGranularity;
  year: number;
  month: number;
  daysInMonth: number;
  dateFrom: string;
  dateTo: string;
}

export interface BrandSpecStatsRow {
  salesRep: string;
  region: string;
  tier: string;
  servicePoints: number;
  totalOrders: number;
  storeCount: number;
  rowType?: HeatmapRowType;
}

export interface BrandSpecStatsResponse {
  rows: BrandSpecStatsRow[];
}

export interface BrandSpecMonthlyStat {
  month: string;
  boxCount: number;
  storeCount: number;
}

export interface BrandSpecDimensionMonthlyStat {
  dimensionType: 'brand' | 'specification';
  dimensionValue: string;
  monthly: BrandSpecMonthlyStat[];
}

export interface BrandSpecMonthlyStatsResponse {
  rows: BrandSpecDimensionMonthlyStat[];
}

export interface UnconvertedStoreItem {
  customerCode: string;
  customerName: string;
  region: string;
  tier: string;
  salesRep: string;
  extras: Record<string, unknown>;
  /** 品牌成交状态: 1=成交, 0=未成交, key为品牌名 */
  brandStatus?: Record<string, 0 | 1>;
}

export interface GetUnconvertedStoresResponse {
  items: UnconvertedStoreItem[];
  total: number;
}

export interface FormatDealItem {
  formatType: string;
  totalStores: number;
  dealtStores: number;
  dealRate: number;
}

export interface BrandDealItem {
  brand: string;
  totalStores: number;
  dealtStores: number;
  dealRate: number;
}

export interface SpecDealItem {
  specification: string;
  totalStores: number;
  dealtStores: number;
  dealRate: number;
}

export interface SalesRepDrilldownResponse {
  formatBreakdown: FormatDealItem[];
  brandBreakdown: BrandDealItem[];
  specificationBreakdown: SpecDealItem[];
}

export interface SystemStatusResponse {
  latestCustomerUpdatedAt: string | null;
  latestDatasetCreatedAt: string | null;
  latestDatasetName: string | null;
  totalCustomers: number;
  totalDatasets: number;
}

export interface FilterOptions {
  regions: string[];
  tiers: string[];
  dealerTypes: string[];
  brands: string[];
  salesReps: string[];
  specifications: string[];
}

export interface DatasetSpecOptions {
  brands: string[];
  specifications: string[];
  /** 品牌与规格的原始对应关系，用于前端双向联动过滤 */
  pairs: Array<{ brand: string; specification: string }>;
}

export interface GetClassificationResponse {
  rows: ClassificationRow[];
  regionSummary: Array<{
    region: string;
    storeCount: number;
    paidStoreCount: number;
    paidAmount: number;
  }>;
  tierSummary: Array<{
    tier: string;
    storeCount: number;
    paidStoreCount: number;
    paidAmount: number;
  }>;
  storeFormatSummary: StoreFormatItem[];
  totalStoreCount: number;
  totalPaidStoreCount: number;
  totalPaidAmount: number;
}

export interface RouteMappingItem {
  id: string;
  customerCode: string;
  routeCode: string;
  routeName: string;
  createdAt: string;
}

export interface GetRouteMappingsParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface GetRouteMappingsResponse {
  items: RouteMappingItem[];
  total: number;
}

export interface UploadRouteMappingRequest {
  mappings: Array<{
    customerCode: string;
    routeCode: string;
    routeName?: string;
  }>;
}

export interface UploadRouteMappingResponse {
  inserted: number;
  updated: number;
  total: number;
}

export interface DeleteRouteMappingResponse {
  success: boolean;
}

// Route Profile 相关类型
export interface RouteProfile {
  customerCode: string;
  routeName: string;
  extras: Record<string, unknown>;
}

export interface RouteUploadRecord {
  fileName: string;
  uploadTime: string;
  rowCount: number;
}

export type GetRouteUploadRecordResponse = RouteUploadRecord | null;

export interface UploadRouteRequest {
  routes: RouteProfile[];
}

export interface UploadRouteResponse {
  inserted: number;
  updated: number;
  total: number;
}

export interface GetRoutesParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface GetRoutesResponse {
  items: RouteProfile[];
  total: number;
}

export interface DeleteRouteResponse {
  success: boolean;
}

// Expense Profile 相关类型
export interface ExpenseRecord {
  customerCode: string;
  customerName: string;
  sheetType: string;
  extras: Record<string, unknown>;
}

export interface ExpenseProfile {
  customerCode: string;
  customerName: string;
  extras: Record<string, unknown>;
}

export interface ExpenseUploadRecord {
  fileName: string;
  uploadTime: string;
  rowCount: number;
}

export type GetExpenseUploadRecordResponse = ExpenseUploadRecord | null;

export interface UploadExpenseRequest {
  expenses: ExpenseRecord[];
  uploadMonths?: string[];
}

export interface UploadExpenseResponse {
  inserted: number;
  updated: number;
  total: number;
}

export interface GetExpensesParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sheetType?: string;
}

export interface GetExpensesResponse {
  items: ExpenseRecord[];
  total: number;
}

export interface DeleteExpenseResponse {
  success: boolean;
}

export interface ExpenseSheetSummary {
  name: string;
  rowCount: number;
}

export type ExpiryRiskLevel = 'high' | 'medium' | 'low';

export interface ExpiryStoreOver500Item {
  office: string;
  count: number;
}

export interface ExpiryTopSpecificationItem {
  specification: string;
  amount: number;
  share: number;
}

export interface ExpiryOfficeStoreMom {
  office: string;
  count: number;
  momChange: number;
}

export interface ExpiryOfficeAmountMom {
  office: string;
  amount: number;
  momChange: number;
}

export interface ExpiryKpiData {
  totalAmount: number;
  monthOverMonthChange: number;
  topOfficeName?: string;
  topOfficeMomChange?: number;
  involvedStoreCount: number;
  storeOver500ByOffice: ExpiryStoreOver500Item[];
  topSpecifications: ExpiryTopSpecificationItem[];
  officeStoreMom: ExpiryOfficeStoreMom[];
  officeAmountMom: ExpiryOfficeAmountMom[];
}

export interface ExpiryTrendItem {
  month: string;
  amount: number;
  recordCount: number;
  momDifference?: number;
  tier1Amount?: number;
  tier2Amount?: number;
}

export interface ExpiryRankingItem {
  dimension: string;
  value: string;
  amount: number;
  recordCount: number;
  share: number;
}

export interface ExpiryWarningItem {
  id: string;
  type: string;
  level: ExpiryRiskLevel;
  title: string;
  description: string;
  amount?: number;
  suggestion: string;
}

export interface ExpiryOfficeRankingItem {
  office: string;
  amount: number;
}

export interface ExpiryAnalysisFilters {
  monthFrom?: string;
  monthTo?: string;
  region?: string[];
  tier?: string[];
  dealerType?: string[];
  business?: string[];
  specification?: string[];
  amountThreshold?: number;
}

export interface ExpiryAnalysisResult {
  kpis: ExpiryKpiData;
  trend: ExpiryTrendItem[];
  regionRank: ExpiryRankingItem[];
  tierRank: ExpiryRankingItem[];
  dealerTypeRank: ExpiryRankingItem[];
  businessRank: ExpiryRankingItem[];
  specificationRank: ExpiryRankingItem[];
  warnings: ExpiryWarningItem[];
  topCurrentMonthOffices: ExpiryOfficeRankingItem[];
  topThreeMonthOffices: ExpiryOfficeRankingItem[];
  availableFilters: {
    regions: string[];
    tiers: string[];
    dealerTypes: string[];
    businesses: string[];
    specifications: string[];
    months: string[];
  };
}

export interface ExpiryDrilldownStoreOver500Row {
  region: string;
  tier: string;
  business: string;
  monthlyCounts: Record<string, number>;
  totalCount: number;
}

export interface ExpiryDrilldownSpecShareRow {
  specification: string;
  monthlyShares: Record<string, number>;
  monthlyAmounts: Record<string, number>;
  totalAmount: number;
  isTop5: boolean;
}

export interface ExpiryDrilldownOfficeSpecShareRow {
  region: string;
  specification: string;
  monthlyData: Record<string, { share: number; amount: number; rank: number }>;
  isConsecutiveTop1: boolean;
}

export interface ExpiryDrilldownResult {
  months: string[];
  storeOver500Monthly: ExpiryDrilldownStoreOver500Row[];
  over500StoreSpecShare: ExpiryDrilldownSpecShareRow[];
  officeMonthlySpecShare: ExpiryDrilldownOfficeSpecShareRow[];
}

export interface ExpiryRankingExportCell {
  amount: number;
  share: number;
  recordCount: number;
}

export interface ExpiryRankingExportRow {
  dimensionValue: string;
  total: ExpiryRankingExportCell;
  offices: Record<string, ExpiryRankingExportCell>;
}

export interface ExpiryRankingExportSheet {
  sheetName: string;
  rowHeader: string;
  offices: string[];
  rows: ExpiryRankingExportRow[];
}

export interface ExpiryRankingExportResult {
  region: ExpiryRankingExportSheet;
  tier: ExpiryRankingExportSheet;
  dealerType: ExpiryRankingExportSheet;
  business: ExpiryRankingExportSheet;
  specification: ExpiryRankingExportSheet;
}

export interface ExpiryOver500StoreDetail {
  customerCode: string;
  customerName?: string;
  region: string;
  tier: string;
  business: string;
  dealerType: string;
  month: string;
  amount: number;
  topSpecifications: {
    specification: string;
    amount: number;
    share: number;
  }[];
}

export interface OverstockAnalysisFilters {
  monthFrom?: string;
  monthTo?: string;
  region?: string[];
  tier?: string[];
  dealerType?: string[];
  business?: string[];
  specification?: string[];
  salesRep?: string[];
}

export interface OverstockStoreRiskItem {
  customerCode: string;
  customerName: string;
  region: string;
  business: string;
  salesRep: string;
  purchaseAmount: number;
  purchaseQuantity: number;
  expiryAmount: number;
  conversionRate: number;
  isFlagged: boolean;
}

export interface OverstockRepRiskItem {
  salesRep: string;
  region: string;
  storeCount: number;
  purchaseAmount: number;
  purchaseQuantity: number;
  expiryAmount: number;
  conversionRate: number;
  isFlagged: boolean;
}

export interface OverstockSpecRiskItem {
  specification: string;
  purchaseAmount: number;
  purchaseQuantity: number;
  expiryAmount: number;
  conversionRate: number;
}

export interface OverstockCohortItem {
  customerCode: string;
  customerName: string;
  region: string;
  business: string;
  salesRep: string;
  specification: string;
  purchaseMonth: string;
  purchaseAmount: number;
  purchaseQuantity: number;
  expiryMonth4Amount: number;
  expiryMonth5Amount: number;
  expiryAmount: number;
  conversionRate: number;
}

/** 总进货金额下钻：单条明细（某临期月 → 某偏移进货月 的门店/规格进货金额） */
export interface OverstockPurchaseDrilldownItem {
  /** 临期发生月（筛选月） */
  expiryMonth: string;
  /** 对应的进货月（临期月往前偏移 offset 个月） */
  purchaseMonth: string;
  /** 偏移月数：4 或 5 */
  offset: number;
  customerCode: string;
  customerName: string;
  region: string;
  business: string;
  salesRep: string;
  specification: string;
  /** 该门店该规格在该进货月的进货金额 */
  purchaseAmount: number;
  /** 该门店该规格在该进货月的进货数量 */
  purchaseQuantity: number;
  /** 该进货批次对应的临期金额 */
  expiryAmount: number;
}

/** 总进货金额下钻：按「进货月」分组的汇总 */
export interface OverstockPurchaseDrilldownGroup {
  expiryMonth: string;
  purchaseMonth: string;
  offset: number;
  purchaseAmount: number;
  purchaseQuantity: number;
  expiryAmount: number;
  storeCount: number;
  itemCount: number;
  items: OverstockPurchaseDrilldownItem[];
}

export interface OverstockPurchaseDrilldown {
  totalPurchaseAmount: number;
  totalPurchaseQuantity: number;
  groups: OverstockPurchaseDrilldownGroup[];
}

export interface OverstockAnalysisResult {
  summary: {
    totalPurchaseAmount: number;
    totalExpiryAmount: number;
    avgConversionRate: number;
    flaggedStoreCount: number;
    flaggedRepCount: number;
    threshold: number;
  };
  /** 总进货金额下钻明细（按偏移 -4/-5 的进货月分组） */
  purchaseDrilldown: OverstockPurchaseDrilldown;
  storeRisks: OverstockStoreRiskItem[];
  repRisks: OverstockRepRiskItem[];
  specRisks: OverstockSpecRiskItem[];
  cohorts: OverstockCohortItem[];
  availableFilters: {
    regions: string[];
    tiers: string[];
    dealerTypes: string[];
    businesses: string[];
    specifications: string[];
    salesReps: string[];
    months: string[];
  };
}

export interface OverstockAnalysisExportResult {
  summary: OverstockAnalysisResult['summary'];
  storeRisks: OverstockStoreRiskItem[];
  repRisks: OverstockRepRiskItem[];
  specRisks: OverstockSpecRiskItem[];
  cohorts: OverstockCohortItem[];
}

export interface AtpPerformanceRow {
  region: string;
  tier: string;
  salesRep: string;
  totalPoints: number;
  paidPoints: number;
  paidAmount: number;
  totalStoreSales: number;
  paidStoreSales: number;
  paidPointFeeRatio: number;
  paidPointSalesRatio: number;
  feeRatioLe10?: number;
  feeRatio10to15?: number;
  feeRatioGt15?: number;
  feeRatioNoDeal?: number;
  feeRatioLe10Ratio?: number;
  feeRatio10to15Ratio?: number;
  feeRatioGt15Ratio?: number;
  feeRatioNoDealRatio?: number;
  salesLt1000Count?: number;
  salesLt1000Ratio?: number;
  salesLt2000Count?: number;
  salesLt2000Ratio?: number;
}

export interface AtpPerformanceResponse {
  rows: AtpPerformanceRow[];
}

export interface AtpPerformanceStoreRow extends AtpPerformanceRow {
  customerName: string;
  customerCode: string;
}

export interface AtpPerformanceStoreDetailResponse {
  rows: AtpPerformanceStoreRow[];
}

export interface AtpAvailableMonthsResponse {
  months: string[];
}

// AI 模型配置相关类型
export interface AiModelConfigItem {
  id: string;
  configKey: string;
  name: string;
  providerId: string;
  baseUrl: string;
  model: string;
  isBuiltin: boolean;
  isActive: boolean;
  isEnabled: boolean;
  /** 返回给前端的 API Key 为脱敏后的占位值 */
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetAiModelConfigsResponse {
  items: AiModelConfigItem[];
  activeConfigKey: string | null;
}

export interface SetActiveAiModelConfigRequest {
  configKey: string;
}

export interface SetActiveAiModelConfigResponse {
  success: boolean;
  activeConfigKey: string | null;
}

export interface UpdateAiModelConfigRequest {
  name?: string;
  providerId?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  isEnabled?: boolean;
}

export interface UpdateAiModelConfigResponse {
  item: AiModelConfigItem;
}

export interface TestAiModelConfigRequest {
  configKey: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

export interface TestAiModelConfigMetrics {
  latencyMs: number;
  statusCode: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface TestAiModelConfigResponse {
  ok: boolean;
  content?: string;
  error?: string;
  metrics?: TestAiModelConfigMetrics;
}


