-- M10: 修复 expense_profile 表结构与 schema.ts 不一致的问题
-- 旧版建表结构为 expense_name 列、缺少 sheet_type 列，且存在遗留唯一约束
-- expense_profile_customer_code_key（customer_code 唯一）——当前 schema 设计允许
-- 同一客户编码出现在不同 sheet_type（客户销额 / ATP费用 / 临期* 等）下，唯一约束
-- 会导致覆盖导入同客户不同 sheet 时插入报 23505 unique violation（前端表现为 500）。
-- 由于 db-init 的 CREATE TABLE IF NOT EXISTS 不会修改已存在的表，本迁移负责修复。
-- 本迁移幂等：已修复的环境执行后为空操作。

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='expense_profile' AND column_name='expense_name') THEN
    ALTER TABLE expense_profile RENAME COLUMN expense_name TO customer_name;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='expense_profile' AND column_name='sheet_type') THEN
    ALTER TABLE expense_profile ADD COLUMN sheet_type varchar(255) NOT NULL DEFAULT '默认';
  END IF;
END $$;

-- 移除旧版遗留的唯一约束（customer_code 不应唯一，需按 sheet_type 区分）
ALTER TABLE expense_profile DROP CONSTRAINT IF EXISTS expense_profile_customer_code_key;
