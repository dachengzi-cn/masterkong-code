/**
 * 初始化核心业务表脚本
 * 在 PostgreSQL 中创建核心业务表，解决表缺失导致服务回退到内存存储的问题
 */
import postgres from 'postgres';

const connectionString = process.env.SUDA_DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres';

async function main() {
  console.log('正在连接数据库:', connectionString);
  const pg = postgres(connectionString, { max: 3 });

  // 测试连接
  try {
    const [test] = await pg`SELECT 1 AS ok`;
    console.log('数据库连接成功:', test);
  } catch (err) {
    console.error('数据库连接失败:', (err as Error).message);
    console.error('请确保 PostgreSQL 正在运行，且 .env 中的 SUDA_DATABASE_URL 配置正确');
    await pg.end();
    process.exit(1);
  }

  const coreTables = [
    'dataset',
    'customer_profile',
    'route_profile',
    'route_mapping',
    'expense_profile',
    'data_record',
    'report_record',
  ];

  // 按外键依赖顺序建表
  const createTableSQLs = [
    // ===== dataset =====
    `CREATE TABLE IF NOT EXISTS dataset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      fields JSONB NOT NULL DEFAULT '[]',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== customer_profile =====
    `CREATE TABLE IF NOT EXISTS customer_profile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_code VARCHAR(255) NOT NULL UNIQUE,
      customer_name VARCHAR(255) NOT NULL,
      region VARCHAR(255) NOT NULL,
      tier VARCHAR(255) NOT NULL,
      extras JSONB NOT NULL DEFAULT '{}',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== route_profile =====
    `CREATE TABLE IF NOT EXISTS route_profile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_code VARCHAR(255) NOT NULL UNIQUE,
      route_name VARCHAR(255) NOT NULL,
      extras JSONB NOT NULL DEFAULT '{}',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== route_mapping =====
    `CREATE TABLE IF NOT EXISTS route_mapping (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_code VARCHAR(255) NOT NULL,
      route_code VARCHAR(255) NOT NULL,
      route_name VARCHAR(255),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== expense_profile =====
    `CREATE TABLE IF NOT EXISTS expense_profile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_code VARCHAR(255) NOT NULL,
      customer_name VARCHAR(255),
      sheet_type VARCHAR(255) NOT NULL,
      extras JSONB NOT NULL DEFAULT '{}',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== data_record (依赖 dataset) =====
    `CREATE TABLE IF NOT EXISTS data_record (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dataset_id UUID NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
      content JSONB NOT NULL DEFAULT '{}',
      content_hash VARCHAR(32),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,

    // ===== report_record =====
    `CREATE TABLE IF NOT EXISTS report_record (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ready',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by TEXT
    )`,
  ];

  console.log('\n开始创建核心业务表...');
  for (const sql of createTableSQLs) {
    const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    const tableName = match ? match[1] : 'unknown';
    try {
      await pg.unsafe(sql);
      console.log(`  ✅ ${tableName} 表创建成功`);
    } catch (err) {
      console.error(`  ❌ ${tableName} 表创建失败:`, (err as Error).message);
    }
  }

  // 创建索引
  console.log('\n开始创建索引...');
  const createIndexSQLs = [
    `CREATE INDEX IF NOT EXISTS idx_customer_profile_code ON customer_profile(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_customer_profile_region ON customer_profile(region)`,
    `CREATE INDEX IF NOT EXISTS idx_customer_profile_tier ON customer_profile(tier)`,
    `CREATE INDEX IF NOT EXISTS idx_route_profile_customer_code ON route_profile(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_route_mapping_customer_code ON route_mapping(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_route_mapping_route_code ON route_mapping(route_code)`,
    `CREATE INDEX IF NOT EXISTS idx_data_record_dataset_id ON data_record(dataset_id)`,
    `CREATE INDEX IF NOT EXISTS idx_data_record_dataset_hash ON data_record(dataset_id, content_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_expense_profile_customer_code ON expense_profile(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_expense_profile_sheet_type ON expense_profile(sheet_type)`,
    `CREATE INDEX IF NOT EXISTS idx_report_record_type ON report_record(type)`,
    `CREATE INDEX IF NOT EXISTS idx_report_record_created ON report_record(_created_at)`,
  ];

  for (const sql of createIndexSQLs) {
    const match = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/);
    const indexName = match ? match[1] : 'unknown';
    try {
      await pg.unsafe(sql);
      console.log(`  ✅ ${indexName} 索引创建成功`);
    } catch (err) {
      console.error(`  ❌ ${indexName} 索引创建失败:`, (err as Error).message);
    }
  }

  // 验证
  console.log('\n验证表创建结果...');
  const result = await pg`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ${pg(coreTables)}
    ORDER BY tablename
  `;
  console.log(`已创建的核心表: ${result.length}`);
  if (result.length > 0) {
    for (const t of result) {
      console.log(`  - ${t.tablename}`);
    }
  }

  await pg.end();
  console.log('\n✅ 核心业务表初始化完成！');
  console.log('请重启后端服务以使用数据库存储模式。');
}

main().catch((err) => {
  console.error('初始化失败:', err);
  process.exit(1);
});