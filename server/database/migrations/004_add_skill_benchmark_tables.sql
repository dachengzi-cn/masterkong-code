-- M3-2: Skill 基准体系 - 评估反馈表
-- 用户反馈采集 + Skill 性能指标 + 迭代记录

-- 用户反馈表：用户对单次分析会话的评价
CREATE TABLE IF NOT EXISTS ai_analysis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  skill_key varchar(255) NOT NULL,
  page_scope varchar(255) NOT NULL,
  -- 评分 1-5（1=很差，5=很好）
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  -- 反馈维度：accuracy(准确性) / completeness(完整性) / usefulness(实用性) / clarity(清晰度)
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 文本反馈
  comment text,
  -- 用户标记的问题类型：missing_analysis / wrong_data / format_issue / too_generic / other
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 是否已用于 Skill 迭代
  is_consumed boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_session ON ai_analysis_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_skill ON ai_analysis_feedback(skill_key);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_rating ON ai_analysis_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_consumed ON ai_analysis_feedback(is_consumed);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_analysis_feedback(_created_at);

-- Skill 性能指标表：聚合统计每个 skill 的表现
CREATE TABLE IF NOT EXISTS ai_skill_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key varchar(255) NOT NULL UNIQUE,
  -- 统计周期：daily / weekly / monthly / all-time
  period varchar(50) NOT NULL DEFAULT 'all-time',
  -- 总执行次数
  total_executions integer NOT NULL DEFAULT 0,
  -- 成功次数（status = completed）
  successful_executions integer NOT NULL DEFAULT 0,
  -- 失败次数
  failed_executions integer NOT NULL DEFAULT 0,
  -- Schema 校验通过次数
  schema_valid_passes integer NOT NULL DEFAULT 0,
  -- Schema 校验失败次数
  schema_valid_failures integer NOT NULL DEFAULT 0,
  -- 平均延迟（毫秒）
  avg_latency_ms numeric(12, 2) NOT NULL DEFAULT 0,
  -- P95 延迟
  p95_latency_ms numeric(12, 2) NOT NULL DEFAULT 0,
  -- 平均 token 使用量
  avg_total_tokens numeric(12, 2) NOT NULL DEFAULT 0,
  -- 用户评分汇总
  total_feedbacks integer NOT NULL DEFAULT 0,
  avg_rating numeric(3, 2) NOT NULL DEFAULT 0,
  -- 评分分布
  rating_distribution jsonb NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  -- 常见问题统计
  issue_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 最后一次执行时间
  last_execution_at timestamptz(3),
  -- 最后一次更新时间
  last_calculated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_ai_skill_metric_key ON ai_skill_metric(skill_key);
CREATE INDEX IF NOT EXISTS idx_ai_skill_metric_period ON ai_skill_metric(period);

-- Skill 迭代记录表：记录每次基于反馈的 Skill 优化
CREATE TABLE IF NOT EXISTS ai_skill_iteration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key varchar(255) NOT NULL,
  -- 迭代前版本号
  from_version integer NOT NULL,
  -- 迭代后版本号
  to_version integer NOT NULL,
  -- 迭代类型：manual / auto-feedback / auto-ab-test
  iteration_type varchar(50) NOT NULL DEFAULT 'manual',
  -- 迭代原因（基于多少条反馈、平均评分等）
  reason text NOT NULL,
  -- 变更摘要：修改了哪些字段
  changes_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 消费的反馈 ID 列表
  consumed_feedback_ids uuid[] NOT NULL DEFAULT '{}',
  -- 迭代前的 promptTemplate（用于回滚）
  previous_prompt_template text,
  -- 迭代前的 outputSchema
  previous_output_schema jsonb,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE INDEX IF NOT EXISTS idx_ai_skill_iteration_skill ON ai_skill_iteration(skill_key);
CREATE INDEX IF NOT EXISTS idx_ai_skill_iteration_type ON ai_skill_iteration(iteration_type);
CREATE INDEX IF NOT EXISTS idx_ai_skill_iteration_created ON ai_skill_iteration(_created_at);

-- 授予 anon_ 角色权限（与现有表保持一致）
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_analysis_feedback TO anon_;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_skill_metric TO anon_;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_skill_iteration TO anon_;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
