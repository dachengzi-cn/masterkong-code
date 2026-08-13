-- M7-补: 报表记录表 report_record 的建表与 anon_ 权限授予
-- report_record 此前仅由 ReportsService.onModuleInit 在运行时创建，
-- 未通过迁移脚本授予 anon_ 角色权限。生产环境 datapaas 中间件会以
-- anon_ 角色执行 SQL，导致导出报表时 INSERT 报 42501 权限错误（前端表现为 500）。

CREATE TABLE IF NOT EXISTS report_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(100) NOT NULL,
  title varchar(500) NOT NULL,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'ready',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_report_record_type ON report_record(type);
CREATE INDEX IF NOT EXISTS idx_report_record_created ON report_record(_created_at);

-- 授予 anon_ 角色权限（与其它业务表保持一致）
GRANT SELECT, INSERT, UPDATE, DELETE ON report_record TO anon_;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
