import { useState, useCallback, useEffect, useRef } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getSkills,
  getSkillsByPage,
  getAnalysisConfig,
  updateAnalysisConfig,
  executeAnalysis,
  getSessionHistory,
  getSessionById,
  deleteSession as deleteSessionApi,
  deleteSessionsByPage,
  type AiSkillItem,
  type AnalysisConfig,
  type AnalysisExecutionResult,
  type AnalysisExecutionRequest,
  type SessionHistoryItem,
  type SessionDetail,
  type CollaborationMode,
  type InlineModelConfig,
} from '@client/src/api/ai-analysis';

/**
 * AI 分析引擎 Hook
 * 提供技能查询、配置管理、分析执行与会话历史功能
 */
export function useAiAnalysis() {
  const [skills, setSkills] = useState<AiSkillItem[]>([]);
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<AnalysisExecutionResult | null>(null);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** 加载所有 Skill */
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSkills();
      setSkills(res.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载 Skill 列表失败';
      setError(msg);
      logger.error('[useAiAnalysis] loadSkills error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 按页面加载 Skill */
  const loadSkillsByPage = useCallback(async (pageScope: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSkillsByPage(pageScope);
      setSkills(res.items);
      return res.items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载 Skill 列表失败';
      setError(msg);
      logger.error('[useAiAnalysis] loadSkillsByPage error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /** 加载分析配置 */
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getAnalysisConfig();
      setConfig(cfg);
      return cfg;
    } catch (err) {
      logger.error('[useAiAnalysis] loadConfig error:', err);
      return null;
    }
  }, []);

  /** 更新分析配置 */
  const saveConfig = useCallback(async (updates: Partial<AnalysisConfig>) => {
    try {
      const cfg = await updateAnalysisConfig(updates);
      setConfig(cfg);
      return cfg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新配置失败';
      setError(msg);
      logger.error('[useAiAnalysis] saveConfig error:', err);
      return null;
    }
  }, []);

  /** 执行分析 */
  const runAnalysis = useCallback(async (request: AnalysisExecutionRequest) => {
    setExecuting(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await executeAnalysis(request);
      setLastResult(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分析执行失败';
      setError(msg);
      logger.error('[useAiAnalysis] runAnalysis error:', err);
      return null;
    } finally {
      setExecuting(false);
    }
  }, []);

  /** 加载会话历史 */
  const loadSessions = useCallback(async (pageScope?: string, limit?: number) => {
    try {
      const res = await getSessionHistory(pageScope, limit);
      setSessions(res.items);
      return res.items;
    } catch (err) {
      logger.error('[useAiAnalysis] loadSessions error:', err);
      return [];
    }
  }, []);

  /** 获取会话详情 */
  const loadSessionDetail = useCallback(async (sessionId: string) => {
    try {
      const res = await getSessionById(sessionId);
      return res.item;
    } catch (err) {
      logger.error('[useAiAnalysis] loadSessionDetail error:', err);
      return null;
    }
  }, []);

  /** 删除单个会话 */
  const removeSession = useCallback(async (sessionId: string) => {
    try {
      await deleteSessionApi(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      return true;
    } catch (err) {
      logger.error('[useAiAnalysis] removeSession error:', err);
      return false;
    }
  }, []);

  /** 删除指定页面的所有会话 */
  const clearSessionsByPage = useCallback(async (pageScope: string) => {
    try {
      await deleteSessionsByPage(pageScope);
      setSessions((prev) => prev.filter((s) => s.pageScope !== pageScope));
      return true;
    } catch (err) {
      logger.error('[useAiAnalysis] clearSessionsByPage error:', err);
      return false;
    }
  }, []);

  /** 初始化：加载配置 */
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /** 清除错误（useCallback 保证引用稳定，避免下游 useEffect 无限触发） */
  const clearError = useCallback(() => setError(null), []);
  /** 清除结果（useCallback 保证引用稳定） */
  const clearResult = useCallback(() => setLastResult(null), []);

  return {
    skills,
    config,
    loading,
    executing,
    lastResult,
    sessions,
    error,
    loadSkills,
    loadSkillsByPage,
    loadConfig,
    saveConfig,
    runAnalysis,
    loadSessions,
    loadSessionDetail,
    removeSession,
    clearSessionsByPage,
    clearError,
    clearResult,
  };
}

/**
 * 页面级 AI 分析 Hook
 * 绑定特定分析页面，自动加载对应 Skill
 */
export function usePageAnalysis(pageScope: string) {
  const ai = useAiAnalysis();
  const [pageSkills, setPageSkills] = useState<AiSkillItem[]>([]);
  const loadedRef = useRef(false);

  /** 加载页面关联的 Skill */
  const loadPageSkills = useCallback(async () => {
    const items = await ai.loadSkillsByPage(pageScope);
    setPageSkills(items);
    return items;
  }, [pageScope, ai]);

  /** 对当前页面数据执行 AI 分析 */
  const analyzePageData = useCallback(
    async (
      inputData: Record<string, unknown>,
      options?: {
        skillKey?: string;
        userQuestion?: string;
        collaborationMode?: CollaborationMode;
        configKeys?: string[];
        inlineModelConfigs?: InlineModelConfig[];
      },
    ) => {
      // 如果未指定 skillKey，使用页面第一个可用 skill
      const skillKey = options?.skillKey ?? pageSkills[0]?.skillKey;
      if (!skillKey) {
        logger.warn(`[usePageAnalysis] No skill available for page: ${pageScope}`);
        return null;
      }

      return ai.runAnalysis({
        skillKey,
        pageScope,
        inputData,
        userQuestion: options?.userQuestion,
        collaborationMode: options?.collaborationMode,
        configKeys: options?.configKeys,
        inlineModelConfigs: options?.inlineModelConfigs,
      });
    },
    [pageScope, pageSkills, ai],
  );

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadPageSkills();
    }
  }, [loadPageSkills]);

  return {
    ...ai,
    pageSkills,
    loadPageSkills,
    analyzePageData,
  };
}
