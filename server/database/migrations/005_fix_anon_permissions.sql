-- M5: 修复 anon_ 角色权限缺失（原 002/003 迁移仅授予 INSERT/UPDATE/DELETE，缺少 SELECT）
-- @lark-apaas/nestjs-datapaas 中间件在每次请求时执行 SET LOCAL ROLE 'anon_{schema}'，
-- 因此后端查询实际以 anon_ 角色执行。缺少 SELECT 会导致 42501 权限错误（/api/ai-analysis/* 返回 500）。

-- 002 迁移中的 AI 分析相关表
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_skill TO anon_;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_analysis_session TO anon_;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_analysis_config TO anon_;

-- 003 迁移中的 AI 设计文档表
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_design_doc TO anon_;

-- 确保序列可用（已存在则幂等）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_;
