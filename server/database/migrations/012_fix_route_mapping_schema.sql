-- M12: 修复 route_mapping 表结构与 schema.ts 不一致的问题
-- 旧版建表结构为 from_route / to_route 列，缺少 route_name 列；
-- schema.ts 期望 customer_code / route_code / route_name。
-- 由于 db-init 的 CREATE TABLE IF NOT EXISTS 不会修改已存在的表，
-- 导致 Drizzle 查询/插入（引用 customer_code / route_code / route_name）
-- 报 42703 undefined_column（前端表现为 500）。
-- 本迁移幂等：已修复的环境执行后为空操作。

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='route_mapping' AND column_name='from_route') THEN
    ALTER TABLE route_mapping RENAME COLUMN from_route TO customer_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='route_mapping' AND column_name='to_route') THEN
    ALTER TABLE route_mapping RENAME COLUMN to_route TO route_code;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='route_mapping' AND column_name='route_name') THEN
    ALTER TABLE route_mapping ADD COLUMN route_name varchar(255);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_route_mapping_customer_code ON route_mapping(customer_code);
CREATE INDEX IF NOT EXISTS idx_route_mapping_route_code ON route_mapping(route_code);
