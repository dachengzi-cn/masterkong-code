-- AI 设计文档表：存储自动生成与手动编辑的设计文档，支持版本管理
CREATE TABLE IF NOT EXISTS ai_design_doc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 文档唯一标识（用于版本聚合）
  doc_key varchar(255) NOT NULL,
  -- 文档标题
  title varchar(255) NOT NULL,
  -- 文档分类：architecture | modules | api | data-flow | ui-design | model-strategy | overview
  category varchar(100) NOT NULL,
  -- 文档内容（Markdown 格式）
  content text NOT NULL DEFAULT '',
  -- 版本号，每次保存递增
  version integer NOT NULL DEFAULT 1,
  -- 是否为当前最新版本
  is_latest boolean NOT NULL DEFAULT true,
  -- 来源：auto-generated | manual | ai-assisted
  source varchar(50) NOT NULL DEFAULT 'manual',
  -- 状态：draft | published | archived
  status varchar(50) NOT NULL DEFAULT 'draft',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_ai_design_doc_key ON ai_design_doc(doc_key);
CREATE INDEX IF NOT EXISTS idx_ai_design_doc_category ON ai_design_doc(category);
CREATE INDEX IF NOT EXISTS idx_ai_design_doc_latest ON ai_design_doc(doc_key, is_latest);
CREATE INDEX IF NOT EXISTS idx_ai_design_doc_status ON ai_design_doc(status);

-- 授予 anon_ 角色对新表的权限
GRANT INSERT, UPDATE, DELETE ON ai_design_doc TO anon_;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
