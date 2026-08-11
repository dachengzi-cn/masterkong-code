/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, bigint, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const routeMapping = pgTable("route_mapping", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerCode: varchar("customer_code", { length: 255 }).notNull(),
  routeCode: varchar("route_code", { length: 255 }).notNull(),
  routeName: varchar("route_name", { length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_route_mapping_customer_code").on(table.customerCode),
  index("idx_route_mapping_route_code").on(table.routeCode),
]);

export const customerProfile = pgTable("customer_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerCode: varchar("customer_code", { length: 255 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  region: varchar("region", { length: 255 }).notNull(),
  tier: varchar("tier", { length: 255 }).notNull(),
  /**
   * @type Record<string, unknown>
   */
  extras: jsonb("extras").notNull().default('{}'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("customer_profile_customer_code_key").on(table.customerCode),
  index("idx_customer_profile_code").on(table.customerCode),
  index("idx_customer_profile_region").on(table.region),
  index("idx_customer_profile_tier").on(table.tier),
]);

export const dataRecord = pgTable("data_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id").notNull(),
  /**
   * @type Record<string, unknown>
   */
  content: jsonb("content").notNull().default('{}'),
  contentHash: varchar("content_hash", { length: 32 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_data_record_dataset_id").on(table.datasetId),
  index("idx_data_record_dataset_hash").on(table.datasetId, table.contentHash),
  foreignKey({
    columns: [table.datasetId],
    foreignColumns: [dataset.id],
    name: "data_record_dataset_id_fkey",
  }).onDelete("cascade"),
]);

export const dataset = pgTable("dataset", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  rowCount: integer("row_count").notNull().default(0),
  status: varchar("status", { length: 50 }).notNull().default('pending'),
  /**
   * @type Array<{name: string; type: "text" | "number" | "date"}>
   */
  fields: jsonb("fields").notNull().default('[]'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const routeProfile = pgTable("route_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerCode: varchar("customer_code", { length: 255 }).notNull().unique(),
  routeName: varchar("route_name", { length: 255 }).notNull(),
  /**
   * @type Record<string, unknown>
   */
  extras: jsonb("extras").notNull().default('{}'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("route_profile_customer_code_key").on(table.customerCode),
  index("idx_route_profile_customer_code").on(table.customerCode),
]);

// ========== M7: 报表记录（后端生成 Excel 报表）==========
export const reportRecord = pgTable("report_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 报表类型：service-analysis / expiry-analysis / overstock / unconverted / atp / sales-rep-heatmap / brand-spec / expiry-ranking / expiry-drilldown
  type: varchar("type", { length: 100 }).notNull(),
  // 报表标题（全局下载列表展示）
  title: varchar("title", { length: 500 }).notNull(),
  // 下载文件名（含 .xlsx）
  fileName: varchar("file_name", { length: 255 }).notNull(),
  // 存储相对路径（server/storage/reports 下）
  filePath: text("file_path").notNull(),
  // 文件大小（字节）
  fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default('ready'),
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_report_record_type").on(table.type),
  index("idx_report_record_created").on(table.createdAt),
]);

// table aliases
export const customerProfileTable = customerProfile;
export const dataRecordTable = dataRecord;
export const datasetTable = dataset;
export const routeMappingTable = routeMapping;
export const expenseProfile = pgTable("expense_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerCode: varchar("customer_code", { length: 255 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }),
  sheetType: varchar("sheet_type", { length: 255 }).notNull(),
  /**
   * @type Record<string, unknown>
   */
  extras: jsonb("extras").notNull().default('{}'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_expense_profile_customer_code").on(table.customerCode),
  index("idx_expense_profile_sheet_type").on(table.sheetType),
]);

export const aiModelConfig = pgTable("ai_model_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	configKey: varchar("config_key", { length: 255 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	apiKeyEncrypted: text("api_key_encrypted").notNull(),
	baseUrl: varchar("base_url", { length: 512 }).notNull(),
	model: varchar("model", { length: 255 }).notNull(),
	isBuiltin: boolean("is_builtin").notNull().default(false),
	isActive: boolean("is_active").notNull().default(false),
	isEnabled: boolean("is_enabled").notNull().default(true),
	// System field: Creation time (auto-filled, do not modify)
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	// System field: Creator (auto-filled, do not modify)
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	// System field: Update time (auto-filled, do not modify)
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	// System field: Updater (auto-filled, do not modify)
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	uniqueIndex("ai_model_config_config_key_key").on(table.configKey),
	index("idx_ai_model_config_active").on(table.isActive),
	index("idx_ai_model_config_builtin").on(table.isBuiltin),
]);

export const aiSkill = pgTable("ai_skill", {
	id: uuid("id").primaryKey().defaultRandom(),
	skillKey: varchar("skill_key", { length: 255 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	pageScope: varchar("page_scope", { length: 255 }).notNull(),
	promptTemplate: text("prompt_template").notNull(),
	outputSchema: jsonb("output_schema").notNull().default('{}'),
	defaultConfigKey: varchar("default_config_key", { length: 255 }),
	maxTokens: integer("max_tokens").default(4096),
	isBuiltin: boolean("is_builtin").notNull().default(false),
	isEnabled: boolean("is_enabled").notNull().default(true),
	version: integer("version").notNull().default(1),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	uniqueIndex("ai_skill_skill_key_key").on(table.skillKey),
	index("idx_ai_skill_page_scope").on(table.pageScope),
	index("idx_ai_skill_builtin").on(table.isBuiltin),
]);

export const aiAnalysisSession = pgTable("ai_analysis_session", {
	id: uuid("id").primaryKey().defaultRandom(),
	skillKey: varchar("skill_key", { length: 255 }).notNull(),
	pageScope: varchar("page_scope", { length: 255 }).notNull(),
	collaborationMode: varchar("collaboration_mode", { length: 100 }).notNull().default('independent'),
	configKeys: jsonb("config_keys").notNull().default('[]'),
	inputData: jsonb("input_data").notNull().default('{}'),
	userQuestion: text("user_question"),
	outputData: jsonb("output_data").notNull().default('{}'),
	status: varchar("status", { length: 50 }).notNull().default('pending'),
	errorMessage: text("error_message"),
	latencyMs: integer("latency_ms"),
	usage: jsonb("usage"),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	index("idx_ai_analysis_session_skill").on(table.skillKey),
	index("idx_ai_analysis_session_page").on(table.pageScope),
	index("idx_ai_analysis_session_status").on(table.status),
]);

export const aiAnalysisConfig = pgTable("ai_analysis_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	collaborationMode: varchar("collaboration_mode", { length: 100 }).notNull().default('independent'),
	defaultConfigKey: varchar("default_config_key", { length: 255 }),
	ensembleConfigKeys: jsonb("ensemble_config_keys").notNull().default('[]'),
	plannerConfigKey: varchar("planner_config_key", { length: 255 }),
	executorConfigKey: varchar("executor_config_key", { length: 255 }),
	criticConfigKey: varchar("critic_config_key", { length: 255 }),
	isEnabled: boolean("is_enabled").notNull().default(true),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const aiDesignDoc = pgTable("ai_design_doc", {
	id: uuid("id").primaryKey().defaultRandom(),
	docKey: varchar("doc_key", { length: 255 }).notNull(),
	title: varchar("title", { length: 255 }).notNull(),
	category: varchar("category", { length: 100 }).notNull(),
	content: text("content").notNull().default(''),
	version: integer("version").notNull().default(1),
	isLatest: boolean("is_latest").notNull().default(true),
	source: varchar("source", { length: 50 }).notNull().default('manual'),
	status: varchar("status", { length: 50 }).notNull().default('draft'),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	index("idx_ai_design_doc_key").on(table.docKey),
	index("idx_ai_design_doc_category").on(table.category),
	index("idx_ai_design_doc_latest").on(table.docKey, table.isLatest),
	index("idx_ai_design_doc_status").on(table.status),
]);

// ========== M3-2: Skill 基准体系 - 评估反馈表 ==========
export const aiAnalysisFeedback = pgTable("ai_analysis_feedback", {
	id: uuid("id").primaryKey().defaultRandom(),
	sessionId: uuid("session_id").notNull(),
	skillKey: varchar("skill_key", { length: 255 }).notNull(),
	pageScope: varchar("page_scope", { length: 255 }).notNull(),
	// 评分 1-5
	rating: integer("rating").notNull(),
	// 反馈维度：accuracy / completeness / usefulness / clarity
	dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
	comment: text("comment"),
	// 问题类型：missing_analysis / wrong_data / format_issue / too_generic / other
	issues: jsonb("issues").notNull().default(sql`'[]'::jsonb`),
	isConsumed: boolean("is_consumed").notNull().default(false),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	index("idx_ai_feedback_session").on(table.sessionId),
	index("idx_ai_feedback_skill").on(table.skillKey),
	index("idx_ai_feedback_rating").on(table.rating),
	index("idx_ai_feedback_consumed").on(table.isConsumed),
	index("idx_ai_feedback_created").on(table.createdAt),
]);

export const aiSkillMetric = pgTable("ai_skill_metric", {
	id: uuid("id").primaryKey().defaultRandom(),
	skillKey: varchar("skill_key", { length: 255 }).notNull().unique(),
	period: varchar("period", { length: 50 }).notNull().default('all-time'),
	totalExecutions: integer("total_executions").notNull().default(0),
	successfulExecutions: integer("successful_executions").notNull().default(0),
	failedExecutions: integer("failed_executions").notNull().default(0),
	schemaValidPasses: integer("schema_valid_passes").notNull().default(0),
	schemaValidFailures: integer("schema_valid_failures").notNull().default(0),
	avgLatencyMs: numeric("avg_latency_ms", { precision: 12, scale: 2 }).notNull().default('0'),
	p95LatencyMs: numeric("p95_latency_ms", { precision: 12, scale: 2 }).notNull().default('0'),
	avgTotalTokens: numeric("avg_total_tokens", { precision: 12, scale: 2 }).notNull().default('0'),
	totalFeedbacks: integer("total_feedbacks").notNull().default(0),
	avgRating: numeric("avg_rating", { precision: 3, scale: 2 }).notNull().default('0'),
	ratingDistribution: jsonb("rating_distribution").notNull().default(sql`'{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb`),
	issueDistribution: jsonb("issue_distribution").notNull().default(sql`'{}'::jsonb`),
	lastExecutionAt: customTimestamptz("last_execution_at", { precision: 3 }),
	lastCalculatedAt: customTimestamptz("last_calculated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	index("idx_ai_skill_metric_key").on(table.skillKey),
	index("idx_ai_skill_metric_period").on(table.period),
]);

export const aiSkillIteration = pgTable("ai_skill_iteration", {
	id: uuid("id").primaryKey().defaultRandom(),
	skillKey: varchar("skill_key", { length: 255 }).notNull(),
	fromVersion: integer("from_version").notNull(),
	toVersion: integer("to_version").notNull(),
	iterationType: varchar("iteration_type", { length: 50 }).notNull().default('manual'),
	reason: text("reason").notNull(),
	changesSummary: jsonb("changes_summary").notNull().default(sql`'{}'::jsonb`),
	consumedFeedbackIds: jsonb("consumed_feedback_ids").notNull().default(sql`'{}'::jsonb`),
	previousPromptTemplate: text("previous_prompt_template"),
	previousOutputSchema: jsonb("previous_output_schema"),
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	index("idx_ai_skill_iteration_skill").on(table.skillKey),
	index("idx_ai_skill_iteration_type").on(table.iterationType),
	index("idx_ai_skill_iteration_created").on(table.createdAt),
]);

// ========== M7: 业务综合能力评估 - 维度配置表 ==========
export const capabilityDimensionConfig = pgTable("capability_dimension_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	dimensionKey: varchar("dimension_key", { length: 100 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default('0.125'),
	enabled: boolean("enabled").notNull().default(true),
	thresholdHigh: integer("threshold_high").notNull().default(75),
	thresholdLow: integer("threshold_low").notNull().default(60),
	sortOrder: integer("sort_order").notNull().default(0),
	// System field: Creation time (auto-filled, do not modify)
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	// System field: Creator (auto-filled, do not modify)
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
	// System field: Update time (auto-filled, do not modify)
	updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	// System field: Updater (auto-filled, do not modify)
	updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	uniqueIndex("capability_dimension_config_dimension_key_key").on(table.dimensionKey),
	index("idx_cap_dim_key").on(table.dimensionKey),
]);

// ========== M7: 业务综合能力评估 - 用户数据范围表（RBAC 预留） ==========
export const capabilityUserScope = pgTable("capability_user_scope", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	region: varchar("region", { length: 255 }).notNull(),
	// System field: Creation time (auto-filled, do not modify)
	createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
	// System field: Creator (auto-filled, do not modify)
	createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
	uniqueIndex("idx_cap_scope_user_region").on(table.userId, table.region),
]);

// table aliases
export const expenseProfileTable = expenseProfile;
export const routeProfileTable = routeProfile;
export const aiModelConfigTable = aiModelConfig;
export const aiSkillTable = aiSkill;
export const aiAnalysisSessionTable = aiAnalysisSession;
export const aiAnalysisConfigTable = aiAnalysisConfig;
export const aiDesignDocTable = aiDesignDoc;
export const aiAnalysisFeedbackTable = aiAnalysisFeedback;
export const aiSkillMetricTable = aiSkillMetric;
export const aiSkillIterationTable = aiSkillIteration;
export const capabilityDimensionConfigTable = capabilityDimensionConfig;
export const capabilityUserScopeTable = capabilityUserScope;
