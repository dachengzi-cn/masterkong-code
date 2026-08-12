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
  /** 近三月（不含当月）每月该品牌/规格匹配箱数，按月升序排列 */
  monthlyBoxes?: number[];
  /** 近三月（不含当月）每月该业代总箱数（不含品牌/规格过滤），按月升序排列 */
  monthlyTotalBoxes?: number[];
  /** 筛选时间段内成交≥2次的门店数 */
  repeatDealStores?: number;
  /** 筛选时间段内成交门店总数 */
  dealStores?: number;
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

/** 业代月度未成交门店统计（单月） */
export interface SalesRepUnconvertedMonthly {
  /** 月份，格式 YYYY-MM */
  month: string;
  /** 展示标签，如 2026年2月 */
  monthLabel: string;
  /** 该业代服务门店数 */
  serviceStores: number;
  /** 该月未成交门店数 */
  unconvertedStores: number;
}

/** 业代未成交门店下钻响应（近六个月分月 + 连续N个月未成交） */
export interface SalesRepUnconvertedDrilldownResponse {
  salesRep: string;
  region: string;
  tier: string;
  /** 近六个月分月未成交统计（最近月在前） */
  months: SalesRepUnconvertedMonthly[];
  /** 连续2个月未成交门店数（6个月窗口内存在连续2个月无成交记录） */
  consecutive2Months: number;
  /** 连续3个月未成交门店数（6个月窗口内存在连续3个月无成交记录） */
  consecutive3Months: number;
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
  /** 付费数据源标识：固定为 'atp'（ATP 费用分析系统） */
  paidDataSource: 'atp';
  /** 统计所依据的 ATP 最新可用月份（YYYY-MM），无 ATP 费用数据时为 null */
  paidPeriod: string | null;
  /** 是否获取到 ATP 费用数据（false 时付费指标恒为 0） */
  hasAtpData: boolean;
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

/** ATP 绩效自定义分档参数（费比/销额阈值），未传时使用系统默认值 */
export interface AtpThresholdParams {
  /** 费比≦X 上界（小数），默认 0.1 */
  feeLe10?: number;
  /** 费比>Y 下界（小数），默认 0.15 */
  feeGt15?: number;
  /** 销额<X 元 阈值，默认 1000 */
  salesLt1000?: number;
  /** 销额<Y 元 阈值，默认 2000 */
  salesLt2000?: number;
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

// ===== 报表生成（后端生成 Excel，前端全局下载按钮查看/下载）=====

/** 单元格样式（xlsx-js-style 兼容子集，字段与前端导出保持一致） */
export interface ReportCellStyle {
  font?: {
    bold?: boolean;
    sz?: number;
    color?: { rgb?: string };
  };
  fill?: {
    fgColor?: { rgb?: string };
    patternType?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right' | 'fill';
    vertical?: 'top' | 'center' | 'bottom';
    wrapText?: boolean;
  };
  border?: {
    top?: { style?: string; color?: { rgb?: string } };
    bottom?: { style?: string; color?: { rgb?: string } };
    left?: { style?: string; color?: { rgb?: string } };
    right?: { style?: string; color?: { rgb?: string } };
  };
  numFmt?: string;
}

/** 报表单元格：v=值，s=样式（可选），z=数字格式（如 '0.00%'，xlsx 兼容） */
export interface ReportCell {
  v: string | number | boolean | null | undefined;
  s?: ReportCellStyle;
  z?: string;
  /** xlsx 单元格类型：'n' 数值（配合 z 数字格式生效）、's' 字符串、'b' 布尔等 */
  t?: 'n' | 's' | 'b' | 'd' | 'e';
}

/** 一行数据：原始值或带样式的单元格对象（xlsx AOA 兼容） */
export type ReportRow = Array<string | number | boolean | null | ReportCell>;

/** 单个 Sheet 描述（前端上传，后端渲染 Excel） */
export interface ReportSheetData {
  sheetName: string;
  /** 二维数组（AOA），单元格可为原始值或 { v, s } 对象 */
  rows: ReportRow[];
  /** 列宽（字符宽度，null 表示默认） */
  colWidths?: Array<number | null>;
  /** 合并单元格（行列从 0 开始） */
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  /** 是否显示网格线，默认 true */
  showGridLines?: boolean;
}

/** 生成报表请求 */
export interface GenerateReportRequest {
  /** 报表类型（用于分类/筛选），如 service-analysis / expiry-analysis / overstock / unconverted / atp / sales-rep-heatmap / brand-spec / expiry-ranking / expiry-drilldown */
  type: string;
  /** 报表标题（全局下载列表中展示） */
  title: string;
  /** 下载文件名（不含扩展名，后端自动补 .xlsx） */
  fileName: string;
  sheets: ReportSheetData[];
}

/** 报表记录（元数据） */
export interface ReportRecord {
  id: string;
  type: string;
  title: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
}

export interface GenerateReportResponse {
  report: ReportRecord;
}

export interface GetReportsParams {
  type?: string;
  page?: number;
  pageSize?: number;
}

export interface GetReportsResponse {
  items: ReportRecord[];
  total: number;
}

// ===== 业务综合能力评估（战力雷达图）=====

/** 评估对象层级：所别（营业所）/ 业代（人员） */
export type CapabilityLevel = 'region' | 'rep';

/** 对比类型：无 / 环比 / 同比 */
export type CapabilityCompareType = 'none' | 'mom' | 'yoy';

/** 维度方向：正向（越高越好）/ 反向（越低越好） */
export type CapabilityDimensionDirection = 'up' | 'down';

/** 维度能力等级：优势（绿）/ 中等（黄）/ 短板（红） */
export type CapabilityScoreLevel = 'strength' | 'medium' | 'weak';

/** 维度元信息（注册表 → 前端展示，后续新增指标在此扩展） */
export interface CapabilityDimensionMeta {
  key: string;
  name: string;
  description: string;
  /** 数据来源说明（客户资料/费用资料/成交数据集） */
  dataSource: string;
  /** 计算方法说明 */
  calcMethod: string;
  /** 标准化方法说明 */
  standardization: string;
  /** 原始值单位（如 元/%、无单位留空） */
  unit?: string;
  /** 方向 */
  direction: CapabilityDimensionDirection;
  /** 当前是否启用 */
  enabled: boolean;
  /** 当前生效权重（0~1，配置表为准，缺省回退注册表默认） */
  weight: number;
  /** 优势阈值（默认 75） */
  thresholdHigh: number;
  /** 短板阈值（默认 60） */
  thresholdLow: number;
  sortOrder: number;
  /** 短板时的改进建议文案 */
  suggestionText: string;
}

/** 维度得分明细（雷达图 + 表格 + 导出共用） */
export interface CapabilityDimensionScore {
  key: string;
  name: string;
  /** 0~100 标准分 */
  score: number;
  level: CapabilityScoreLevel;
  /** 原始指标值（未标准化） */
  rawValue: number | null;
  /** 原始值展示文案（含单位） */
  rawLabel?: string;
  weight: number;
  /** 对比期得分差（compareType 非 none 时存在） */
  compare?: {
    mom?: number | null;
    yoy?: number | null;
  };
}

/** 总分战力等级 */
export interface CapabilityTotalLevel {
  code: 'S' | 'A' | 'B' | 'C';
  label: string;
  /** 展示用颜色（十六进制） */
  color: string;
  minScore: number;
}

/** 评估结果（score 接口返回） */
export interface CapabilityScoreResult {
  level: CapabilityLevel;
  region: string;
  salesRep?: string;
  monthFrom: string;
  monthTo: string;
  compareType: CapabilityCompareType;
  scores: CapabilityDimensionScore[];
  totalScore: number;
  totalLevel: CapabilityTotalLevel;
  rawValues: Record<string, number | null>;
  /** 对比期结果（mom/yoy），none 时为 null */
  compare: {
    type: 'mom' | 'yoy';
    /** 对比期标签，如 "2026-06" */
    label: string;
    totalScore: number | null;
    scores: Array<{ key: string; score: number | null; rawValue: number | null }>;
  } | null;
}

/** 优势/短板单项识别 */
export interface CapabilityStrengthWeakness {
  key: string;
  name: string;
  score: number;
  level: CapabilityScoreLevel;
  /** 识别理由（基于原始值/排名） */
  reason: string;
  /** 改进建议（短板时提供） */
  suggestion?: string;
}

/** 解读与建议（insights 接口返回） */
export interface CapabilityInsightsResult {
  /** 评估结论一句话 */
  summary: string;
  /** 总分趋势（相对对比期，无对比期时按最弱维度趋势 flat） */
  trend: 'up' | 'down' | 'flat';
  strengths: CapabilityStrengthWeakness[];
  weaknesses: CapabilityStrengthWeakness[];
  suggestions: string[];
}

/** 下拉选项（options 接口返回） */
export interface CapabilityOptions {
  /** 可选所别 */
  regions: string[];
  /** 所别 → 业代列表 */
  salesReps: Record<string, string[]>;
  /** 有数据的月份（YYYY-MM，含近 13 个月） */
  months: string[];
}

/** 维度配置更新请求（PUT dimensions） */
export interface CapabilityDimensionUpdateRequest {
  dimensions: Array<{
    key: string;
    weight?: number;
    enabled?: boolean;
    thresholdHigh?: number;
    thresholdLow?: number;
  }>;
}

/** 维度配置更新响应 */
export interface CapabilityDimensionUpdateResponse {
  success: boolean;
  dimensions: CapabilityDimensionMeta[];
}

/** 评分/解读/导出通用参数 */
export interface CapabilityScoreParams {
  level?: CapabilityLevel;
  region?: string;
  salesRep?: string;
  monthFrom?: string;
  monthTo?: string;
  compareType?: CapabilityCompareType;
}

/** 解读参数（与评分一致） */
export type CapabilityInsightsParams = CapabilityScoreParams;

/** 导出参数（与评分一致） */
export type CapabilityExportParams = CapabilityScoreParams;

/** 导出文件内容说明（导出为 xlsx 附件，非接口响应体） */
export interface CapabilityExportResult {
  fileName: string;
  sheetNames: string[];
}

// ==================== 数据库表格可视化 ====================

/** 列数据类型分类（用于前端展示与筛选） */
export type DbColumnKind =
  | 'number'
  | 'text'
  | 'date'
  | 'boolean'
  | 'json'
  | 'uuid'
  | 'other';

/** 数据库表基本信息 */
export interface DbTableInfo {
  schema: string;
  name: string;
  /** BASE TABLE / VIEW */
  type: string;
  /** pg 估算行数 */
  rowEstimate: number;
  comment: string | null;
  columnCount: number;
}

/** 数据库连接信息 */
export interface DbSystemInfo {
  database: string;
  host: string;
  version: string | null;
}

/** 表列表响应 */
export interface DbTableListResponse extends DbSystemInfo {
  tables: DbTableInfo[];
}

/** 列结构信息 */
export interface DbColumnInfo {
  name: string;
  ordinal: number;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  columnDefault: string | null;
  comment: string | null;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  kind: DbColumnKind;
}

/** 表结构响应 */
export interface DbTableStructureResponse {
  table: DbTableInfo;
  columns: DbColumnInfo[];
  totalRows: number;
}

/** 列筛选条件（服务端过滤） */
export interface DbTableFilter {
  type: 'text' | 'number' | 'date' | 'boolean';
  /** text：包含关键字；number：精确值；boolean：true/false */
  value?: string | number | boolean;
  /** number/date 范围下界 */
  min?: string | number;
  /** number/date 范围上界 */
  max?: string | number;
}

/** 数据查询参数 */
export interface DbTableDataParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** 全局关键字（对文本类列 ILIKE 匹配） */
  q?: string;
  filters?: Record<string, DbTableFilter>;
}

/** 分页数据响应 */
export interface DbTableDataResponse {
  columns: DbColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

/** 单列统计结果 */
export interface DbColumnStats {
  name: string;
  kind: DbColumnKind;
  /** 非空行数 */
  count: number;
  totalCount: number;
  nullCount: number;
  distinctCount: number | null;
  min: string | number | null;
  max: string | number | null;
  sum: number | null;
  avg: number | null;
  /** 文本列高频值（前 8） */
  topValues: Array<{ value: string; count: number }>;
  /** 数值列直方图 / 日期列按天计数 */
  histogram: Array<{ bucket: string; count: number }>;
}

/** 统计响应 */
export interface DbTableStatsResponse {
  totalRows: number;
  columns: DbColumnStats[];
}

/** 导出 JSON 响应（供前端生成 Excel） */
export interface DbTableExportJsonResponse {
  columns: DbColumnInfo[];
  rows: Record<string, unknown>[];
  count: number;
}


