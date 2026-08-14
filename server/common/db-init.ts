/**
 * 数据库自动初始化（应用启动入口调用）。
 *
 * 解决「新环境部署后批量上传 500 / 应用启动失败」的根本问题：
 * - schema.ts 是 Drizzle 结构定义，不会自动创建表；历史迁移脚本缺失 route_profile / expense_profile 等表
 * - 各业务模块在 onModuleInit 阶段执行 verifyDatabase()（SELECT count(*)），
 *   若表尚未创建即报 42P01 relation does not exist（MEMORY_FALLBACK=false 时直接抛错）
 * - datapaas 中间件以 anon_ 角色执行请求 SQL（SET LOCAL ROLE 'anon_'），
 *   若 anon_ 角色不存在或无权限，请求即报 500
 *
 * 本函数必须在 NestFactory.create 之前调用，确保建表/角色/权限先于任何模块初始化完成。
 * 所有步骤幂等：已存在则跳过，不影响存量数据。
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

/** 业务表 DDL（与 server/database/schema.ts 保持一致） */
const BUSINESS_TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS dataset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    row_count integer NOT NULL DEFAULT 0,
    status varchar(50) NOT NULL DEFAULT 'pending',
    fields jsonb NOT NULL DEFAULT '[]',
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE TABLE IF NOT EXISTS customer_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code varchar(255) NOT NULL UNIQUE,
    customer_name varchar(255) NOT NULL,
    region varchar(255) NOT NULL,
    tier varchar(255) NOT NULL,
    extras jsonb NOT NULL DEFAULT '{}',
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_profile_customer_code_key ON customer_profile(customer_code)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_profile_code ON customer_profile(customer_code)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_profile_region ON customer_profile(region)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_profile_tier ON customer_profile(tier)`,
  `CREATE TABLE IF NOT EXISTS data_record (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
    content jsonb NOT NULL DEFAULT '{}',
    content_hash varchar(32),
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE INDEX IF NOT EXISTS idx_data_record_dataset_id ON data_record(dataset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_data_record_dataset_hash ON data_record(dataset_id, content_hash)`,
  `CREATE TABLE IF NOT EXISTS route_mapping (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code varchar(255) NOT NULL,
    route_code varchar(255) NOT NULL,
    route_name varchar(255),
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE INDEX IF NOT EXISTS idx_route_mapping_customer_code ON route_mapping(customer_code)`,
  `CREATE INDEX IF NOT EXISTS idx_route_mapping_route_code ON route_mapping(route_code)`,
  `CREATE TABLE IF NOT EXISTS route_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code varchar(255) NOT NULL UNIQUE,
    route_name varchar(255) NOT NULL,
    extras jsonb NOT NULL DEFAULT '{}',
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS route_profile_customer_code_key ON route_profile(customer_code)`,
  `CREATE INDEX IF NOT EXISTS idx_route_profile_customer_code ON route_profile(customer_code)`,
  `CREATE TABLE IF NOT EXISTS expense_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code varchar(255) NOT NULL,
    customer_name varchar(255),
    sheet_type varchar(255) NOT NULL,
    extras jsonb NOT NULL DEFAULT '{}',
    _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _created_by user_profile,
    _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_by user_profile
  )`,
  `CREATE INDEX IF NOT EXISTS idx_expense_profile_customer_code ON expense_profile(customer_code)`,
  `CREATE INDEX IF NOT EXISTS idx_expense_profile_sheet_type ON expense_profile(sheet_type)`,
];

const isAlreadyExists = (msg: string): boolean =>
  /already exists|duplicate (object|type)/i.test(msg);

/**
 * 幂等初始化数据库：自定义类型 → 业务表 → anon_ 角色 → 权限。
 * 各步骤独立容错：建表/权限失败仅输出警告，不中断应用启动
 * （若表缺失将导致后续 verifyDatabase / 上传请求报明确错误，便于定位）。
 */
export async function ensureDatabaseSchema(connectionString: string): Promise<void> {
  // eslint-disable-next-line no-console
  const log = (msg: string): void => console.warn(`[db-init] ${msg}`);
  const sql = postgres(connectionString, { max: 1, onnotice: () => undefined });
  try {
    // 1. 自定义类型（供 _created_by / _updated_by 列使用）
    try {
      await sql.unsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_profile') THEN
            CREATE TYPE user_profile AS (user_id text);
          END IF;
        END $$;
      `);
    } catch (err) {
      log(`创建 user_profile 类型失败: ${(err as Error).message}`);
    }

    // 2. 业务表
    for (const ddl of BUSINESS_TABLE_DDL) {
      try {
        await sql.unsafe(ddl);
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        if (isAlreadyExists(message)) continue;
        log(`创建业务表失败: ${message}`);
      }
    }

    // 2.1 增量迁移表（AI 分析 / 能力评估 / 报表 / 费用预估等，均幂等）
    // dist 构建不复制 .sql，因此仅在源码目录存在时读取；核心业务表已由上文保证
    try {
      const migrationsDir = join(process.cwd(), 'server', 'database', 'migrations');
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) {
        try {
          await sql.unsafe(readFileSync(join(migrationsDir, file), 'utf-8'));
        } catch (err) {
          const message = (err as Error)?.message ?? String(err);
          if (isAlreadyExists(message)) continue;
          log(`执行迁移 ${file} 失败: ${message}`);
        }
      }
    } catch (err) {
      log(`读取迁移目录失败（migrations 目录不存在时忽略）: ${(err as Error).message}`);
    }

    // 3. anon_ 角色（datapaas 中间件执行 SET LOCAL ROLE 'anon_'）
    try {
      await sql.unsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_') THEN
            CREATE ROLE anon_ NOLOGIN;
          END IF;
        END $$;
      `);
    } catch (err) {
      log(`创建 anon_ 角色失败（可能无创建角色权限）: ${(err as Error).message}`);
    }

    // 4. 权限（当前表 + 默认权限覆盖未来新表）
    try {
      await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon_`);
      await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_`);
      await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon_`);
      await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon_`);
    } catch (err) {
      log(`授予 anon_ 角色权限失败（anon_ 角色可能不存在，或无授权权限）: ${(err as Error).message}`);
    }
  } finally {
    await sql.end();
  }
}
