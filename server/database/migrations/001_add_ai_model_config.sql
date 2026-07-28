-- AI 模型配置表：支持加密存储 API Key、持久化配置与默认模型选择
CREATE TABLE IF NOT EXISTS ai_model_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key varchar(255) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  provider_id varchar(255) NOT NULL,
  api_key_encrypted text NOT NULL,
  base_url varchar(512) NOT NULL,
  model varchar(255) NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_model_config_config_key_key ON ai_model_config(config_key);
CREATE INDEX IF NOT EXISTS idx_ai_model_config_active ON ai_model_config(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_model_config_builtin ON ai_model_config(is_builtin);
