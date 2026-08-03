-- M6: 修复 ai_skill 表中 page_scope 与前端路由不匹配的问题
-- 原内置 Skill 使用简写（cumulative/daily/brand-spec/expiry/atp），
-- 但前端实际路由为完整路径（dashboard/cumulative 等），导致按页面获取 Skill 返回空数组。

UPDATE ai_skill
SET page_scope = 'dashboard/cumulative'
WHERE skill_key = 'cumulative-conversion-analysis';

UPDATE ai_skill
SET page_scope = 'dashboard/daily'
WHERE skill_key = 'daily-conversion-analysis';

UPDATE ai_skill
SET page_scope = 'dashboard/brand-spec'
WHERE skill_key = 'brand-spec-analysis';

UPDATE ai_skill
SET page_scope = 'expense/expiry'
WHERE skill_key = 'expiry-expense-analysis';

UPDATE ai_skill
SET page_scope = 'expense/atp'
WHERE skill_key = 'atp-expense-analysis';

-- 同步更新历史分析会话记录的 page_scope（便于按页面回溯）
UPDATE ai_analysis_session
SET page_scope = 'dashboard/cumulative'
WHERE page_scope = 'cumulative';

UPDATE ai_analysis_session
SET page_scope = 'dashboard/daily'
WHERE page_scope = 'daily';

UPDATE ai_analysis_session
SET page_scope = 'dashboard/brand-spec'
WHERE page_scope = 'brand-spec';

UPDATE ai_analysis_session
SET page_scope = 'expense/expiry'
WHERE page_scope = 'expiry';

UPDATE ai_analysis_session
SET page_scope = 'expense/atp'
WHERE page_scope = 'atp';

-- 同步更新反馈记录的 page_scope
UPDATE ai_analysis_feedback
SET page_scope = 'dashboard/cumulative'
WHERE page_scope = 'cumulative';

UPDATE ai_analysis_feedback
SET page_scope = 'dashboard/daily'
WHERE page_scope = 'daily';

UPDATE ai_analysis_feedback
SET page_scope = 'dashboard/brand-spec'
WHERE page_scope = 'brand-spec';

UPDATE ai_analysis_feedback
SET page_scope = 'expense/expiry'
WHERE page_scope = 'expiry';

UPDATE ai_analysis_feedback
SET page_scope = 'expense/atp'
WHERE page_scope = 'atp';
