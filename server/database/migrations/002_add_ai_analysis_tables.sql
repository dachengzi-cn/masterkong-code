-- AI Skill 定义表：存储可复用的分析技能模板
CREATE TABLE IF NOT EXISTS ai_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key varchar(255) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  description text,
  -- 关联的分析页面：cumulative | daily | brand-spec | expiry | atp
  page_scope varchar(255) NOT NULL,
  -- 提示词模板，使用 {{placeholder}} 占位
  prompt_template text NOT NULL,
  -- 期望输出的 JSON Schema 描述
  output_schema jsonb NOT NULL DEFAULT '{}',
  -- 默认模型 configKey，为空时使用全局激活的模型
  default_config_key varchar(255),
  -- 默认最大 token 数
  max_tokens integer DEFAULT 4096,
  is_builtin boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  -- 版本号，用于迭代追踪
  version integer NOT NULL DEFAULT 1,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_skill_skill_key_key ON ai_skill(skill_key);
CREATE INDEX IF NOT EXISTS idx_ai_skill_page_scope ON ai_skill(page_scope);
CREATE INDEX IF NOT EXISTS idx_ai_skill_builtin ON ai_skill(is_builtin);

-- AI 分析会话表：记录每次分析执行的输入、输出与元数据
CREATE TABLE IF NOT EXISTS ai_analysis_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 关联的 skill
  skill_key varchar(255) NOT NULL,
  -- 分析页面来源
  page_scope varchar(255) NOT NULL,
  -- 协同模式：independent | ensemble | planner-executor-critic
  collaboration_mode varchar(100) NOT NULL DEFAULT 'independent',
  -- 使用的模型 configKey 列表（JSON 数组）
  config_keys jsonb NOT NULL DEFAULT '[]',
  -- 用户输入的数据快照（JSON）
  input_data jsonb NOT NULL DEFAULT '{}',
  -- 用户自然语言问题
  user_question text,
  -- 模型返回的原始结果（JSON）
  output_data jsonb NOT NULL DEFAULT '{}',
  -- 分析状态：pending | running | completed | failed
  status varchar(50) NOT NULL DEFAULT 'pending',
  -- 错误信息
  error_message text,
  -- 执行耗时（毫秒）
  latency_ms integer,
  -- token 使用量统计
  usage jsonb,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_session_skill ON ai_analysis_session(skill_key);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_session_page ON ai_analysis_session(page_scope);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_session_status ON ai_analysis_session(status);

-- AI 分析全局配置表：存储用户的协同模式偏好与默认模型选择
CREATE TABLE IF NOT EXISTS ai_analysis_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 协同模式：independent | ensemble | planner-executor-critic
  collaboration_mode varchar(100) NOT NULL DEFAULT 'independent',
  -- 独立模式下的默认模型
  default_config_key varchar(255),
  -- 集成模式下使用的模型列表（JSON 数组）
  ensemble_config_keys jsonb NOT NULL DEFAULT '[]',
  -- 规划-执行-评判模式下的三阶段模型配置
  planner_config_key varchar(255),
  executor_config_key varchar(255),
  critic_config_key varchar(255),
  is_enabled boolean NOT NULL DEFAULT true,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

-- 插入默认配置行（如果不存在）
INSERT INTO ai_analysis_config (id, collaboration_mode, is_enabled)
SELECT gen_random_uuid(), 'independent', true
WHERE NOT EXISTS (SELECT 1 FROM ai_analysis_config LIMIT 1);

-- 授予 anon_ 角色对新表的权限
GRANT INSERT, UPDATE, DELETE ON ai_skill, ai_analysis_session, ai_analysis_config TO anon_;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
