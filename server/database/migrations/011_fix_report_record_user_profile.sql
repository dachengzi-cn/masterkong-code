-- M11: 修复 report_record 表 _created_by / _updated_by 列类型（text → user_profile）
-- 旧版运行时 DDL 以 text 创建该表，008 迁移的 CREATE TABLE IF NOT EXISTS 因表已存在而未生效。
-- 列类型为 text 时，Drizzle 生成的 WHERE _created_by = ROW('dev-user')::user_profile
-- 报「操作符不存在: text = user_profile」（前端表现为 500，报表下载列表加载失败）。
-- 本迁移幂等：列已为 user_profile 时为空操作。

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='report_record' AND column_name='_created_by';

  IF col_type = 'text' THEN
    -- 空串无法转换为复合类型，置为 NULL
    UPDATE report_record SET _created_by = NULL, _updated_by = NULL
    WHERE _created_by = '' OR _updated_by = '';
    -- 归一化为复合字面量形式 (user_id)
    UPDATE report_record SET _created_by = '(' || _created_by || ')'
    WHERE _created_by IS NOT NULL AND left(_created_by, 1) <> '(';
    UPDATE report_record SET _updated_by = '(' || _updated_by || ')'
    WHERE _updated_by IS NOT NULL AND left(_updated_by, 1) <> '(';
    -- 类型转换（USING 使用文本输入的复合类型解析）
    ALTER TABLE report_record ALTER COLUMN _created_by TYPE user_profile USING _created_by::user_profile;
    ALTER TABLE report_record ALTER COLUMN _updated_by TYPE user_profile USING _updated_by::user_profile;
  END IF;
END $$;
