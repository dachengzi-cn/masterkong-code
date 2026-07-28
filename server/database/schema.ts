/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

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

// table aliases
export const expenseProfileTable = expenseProfile;
export const routeProfileTable = routeProfile;
export const aiModelConfigTable = aiModelConfig;
