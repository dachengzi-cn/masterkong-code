-- 业务综合能力评估：维度配置表（维度权重/阈值/启用状态持久化）
CREATE TABLE IF NOT EXISTS capability_dimension_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_key varchar(100) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  weight numeric(5,2) NOT NULL DEFAULT 0.125,
  enabled boolean NOT NULL DEFAULT true,
  threshold_high integer NOT NULL DEFAULT 75,
  threshold_low integer NOT NULL DEFAULT 60,
  sort_order integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_dimension_config_dimension_key_key ON capability_dimension_config(dimension_key);
CREATE INDEX IF NOT EXISTS idx_cap_dim_key ON capability_dimension_config(dimension_key);

-- 业务综合能力评估：用户数据范围表（RBAC 预留；空表 = 全量可见）
CREATE TABLE IF NOT EXISTS capability_user_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL,
  region varchar(255) NOT NULL,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_scope_user_region ON capability_user_scope(user_id, region);
