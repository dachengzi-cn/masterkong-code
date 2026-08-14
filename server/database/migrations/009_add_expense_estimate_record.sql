-- 费用预估模块：费用登记记录表 expense_estimate_record
-- 业务语义：不同促销活动对应不同费用科目；登记费用后，系统按 所别/部别/科目/活动 汇总计算「预估使用状况」。

CREATE TABLE IF NOT EXISTS expense_estimate_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month varchar(7) NOT NULL,
  region varchar(255) NOT NULL,
  department varchar(255) NOT NULL,
  activity_name varchar(255) NOT NULL,
  expense_subject varchar(255) NOT NULL,
  estimated_amount numeric(14, 2) NOT NULL DEFAULT 0,
  actual_amount numeric(14, 2) NOT NULL DEFAULT 0,
  remark text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_expense_estimate_month ON expense_estimate_record(month);
CREATE INDEX IF NOT EXISTS idx_expense_estimate_region ON expense_estimate_record(region);
CREATE INDEX IF NOT EXISTS idx_expense_estimate_subject ON expense_estimate_record(expense_subject);

-- 授予 anon_ 角色权限（与其它业务表保持一致；LocalDatabaseModule 启动时亦会自动补发）
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_estimate_record TO anon_;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
