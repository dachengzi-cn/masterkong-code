"use client"

import * as React from "react"
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, X, MessageSquare, Cpu, Bot, Lightbulb, Star, ThumbsUp, ChevronDown, ChevronUp, Minimize2, Maximize2, History, Trash2, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAiAnalysis } from "@/hooks/use-ai-analysis"
import { submitFeedback, getFeedback, type FeedbackDimension, type FeedbackIssueType, type InlineModelConfig } from "@client/src/api/ai-analysis"
import type { CollaborationMode, AnalysisExecutionResult } from "@client/src/api/ai-analysis"
import { loadModelStore } from "@/lib/ai/store"

const COLLABORATION_MODE_LABELS: Record<CollaborationMode, string> = {
  independent: "独立模式",
  ensemble: "集成模式",
  "planner-executor-critic": "规划-执行-评判",
}

const ISSUE_LABELS: Record<FeedbackIssueType, string> = {
  missing_analysis: "分析缺失",
  wrong_data: "数据错误",
  format_issue: "格式问题",
  too_generic: "过于泛泛",
  too_verbose: "过于冗长",
  other: "其他",
}

const DIMENSION_LABELS: Record<FeedbackDimension, string> = {
  accuracy: "准确性",
  completeness: "完整性",
  usefulness: "实用性",
  clarity: "清晰度",
}

const QUALITY_LABELS: Record<string, { label: string; class: string }> = {
  excellent: { label: "优秀", class: "border-success text-success bg-success/10" },
  good: { label: "良好", class: "border-primary text-primary bg-primary/10" },
  fair: { label: "一般", class: "border-warning text-warning bg-warning/10" },
  poor: { label: "较差", class: "border-error text-error bg-error/10" },
  empty: { label: "空数据", class: "border-muted-foreground text-muted-foreground bg-muted/30" },
}

const VALIDATION_LABELS: Record<string, { label: string; class: string }> = {
  pass: { label: "校验通过", class: "border-success text-success bg-success/10" },
  warning: { label: "存在警告", class: "border-warning text-warning bg-warning/10" },
  error: { label: "校验失败", class: "border-error text-error bg-error/10" },
}

interface AiAnalysisPanelProps {
  buttonText?: string
  pageScope: string
  skillKey?: string
  inputData: Record<string, unknown>
  defaultQuestion?: string
  disabled?: boolean
  className?: string
  size?: "sm" | "default" | "lg"
}

/** 从 localStorage 中解析内联模型配置，用于 custom: 前缀的模型 */
function resolveInlineModelConfigs(): InlineModelConfig[] {
  try {
    const store = loadModelStore()
    return store.models.map((m) => ({
      configKey: `custom:${m.id}`,
      name: m.name,
      providerId: m.providerId,
      apiKey: m.apiKey,
      baseUrl: m.baseUrl,
      model: m.model,
    }))
  } catch {
    return []
  }
}

export function AiAnalysisPanel({
  buttonText = "AI 分析",
  pageScope,
  skillKey,
  inputData,
  defaultQuestion = "请分析当前数据，给出关键洞察与行动建议。",
  disabled = false,
  className,
  size = "sm",
}: AiAnalysisPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [minimized, setMinimized] = React.useState(false)
  const [question, setQuestion] = React.useState(defaultQuestion)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = React.useState<"analysis" | "history">("analysis")

  // M3-2c: 反馈状态
  const [feedbackRating, setFeedbackRating] = React.useState(0)
  const [feedbackHover, setFeedbackHover] = React.useState(0)
  const [feedbackDimensions, setFeedbackDimensions] = React.useState<Partial<Record<FeedbackDimension, number>>>({})
  const [feedbackComment, setFeedbackComment] = React.useState("")
  const [feedbackIssues, setFeedbackIssues] = React.useState<FeedbackIssueType[]>([])
  const [showFeedbackDetail, setShowFeedbackDetail] = React.useState(false)
  const [submittingFeedback, setSubmittingFeedback] = React.useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = React.useState(false)
  const [existingFeedbackRating, setExistingFeedbackRating] = React.useState<number | null>(null)

  // 历史记录详情查看
  const [historyDetail, setHistoryDetail] = React.useState<AnalysisExecutionResult | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState(false)

  const { config, executing, lastResult, error, loadConfig, runAnalysis, clearResult, clearError, loadSkillsByPage, sessions, loadSessions, loadSessionDetail, removeSession, clearSessionsByPage } = useAiAnalysis()
  const [currentSkillKey, setCurrentSkillKey] = React.useState<string | null>(skillKey ?? null)

  React.useEffect(() => {
    if (open && !skillKey) {
      loadSkillsByPage(pageScope).then((skills) => {
        if (skills.length > 0) {
          setCurrentSkillKey(skills[0].skillKey)
        }
      })
    }
  }, [open, pageScope, skillKey, loadSkillsByPage])

  React.useEffect(() => {
    setCurrentSkillKey(skillKey ?? null)
  }, [skillKey])

  React.useEffect(() => {
    if (open) {
      loadConfig()
      clearError()
      clearResult()
      resetFeedback()
      setHistoryDetail(null)
      setActiveTab("analysis")
    }
  }, [open, loadConfig, clearError, clearResult])

  // 打开时加载历史记录
  React.useEffect(() => {
    if (open) {
      loadSessions(pageScope, 20)
    }
  }, [open, pageScope, loadSessions])

  // 分析完成后重置反馈状态并检查已有反馈
  React.useEffect(() => {
    if (lastResult?.sessionId && lastResult.sessionId !== 'preprocess-failed') {
      resetFeedback()
      getFeedback(lastResult.sessionId)
        .then((res) => {
          if (res.item) {
            setExistingFeedbackRating(res.item.rating)
            setFeedbackSubmitted(true)
          }
        })
        .catch(() => {})
    }
  }, [lastResult?.sessionId])

  const resetFeedback = () => {
    setFeedbackRating(0)
    setFeedbackHover(0)
    setFeedbackDimensions({})
    setFeedbackComment("")
    setFeedbackIssues([])
    setShowFeedbackDetail(false)
    setFeedbackSubmitted(false)
    setExistingFeedbackRating(null)
  }

  const handleSubmitFeedback = async () => {
    if (!lastResult?.sessionId || feedbackRating === 0) return
    setSubmittingFeedback(true)
    try {
      await submitFeedback(lastResult.sessionId, {
        rating: feedbackRating,
        dimensions: feedbackRating <= 3 ? feedbackDimensions : undefined,
        comment: feedbackComment || undefined,
        issues: feedbackIssues.length > 0 ? feedbackIssues : undefined,
      })
      setFeedbackSubmitted(true)
      setExistingFeedbackRating(feedbackRating)
    } catch (err) {
      console.error('提交反馈失败:', err)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const toggleIssue = (issue: FeedbackIssueType) => {
    setFeedbackIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    )
  }

  const setDimensionScore = (dim: FeedbackDimension, score: number) => {
    setFeedbackDimensions((prev) => ({ ...prev, [dim]: score }))
  }

  const handleAnalyze = async () => {
    if (!currentSkillKey) return
    clearError()
    clearResult()
    setHistoryDetail(null)
    setActiveTab("analysis")

    // 解析内联模型配置（用于 custom: 前缀的自定义模型）
    const inlineModelConfigs = resolveInlineModelConfigs()

    await runAnalysis({
      skillKey: currentSkillKey,
      pageScope,
      inputData,
      userQuestion: question,
      inlineModelConfigs,
    })
  }

  // 查看历史记录详情
  const handleViewHistory = async (sessionId: string) => {
    setLoadingDetail(true)
    setHistoryDetail(null)
    setActiveTab("analysis")
    try {
      const detail = await loadSessionDetail(sessionId)
      if (detail) {
        setHistoryDetail({
          sessionId: detail.id,
          skillKey: detail.skillKey,
          pageScope: detail.pageScope,
          collaborationMode: detail.collaborationMode as CollaborationMode,
          status: detail.status as 'completed' | 'failed',
          results: [],
          finalOutput: detail.outputData,
          errorMessage: detail.errorMessage ?? undefined,
          latencyMs: detail.latencyMs ?? 0,
        })
      }
    } finally {
      setLoadingDetail(false)
    }
  }

  // 删除历史记录
  const handleDeleteHistory = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await removeSession(sessionId)
  }

  // 清空当前页面所有历史
  const handleClearAllHistory = async () => {
    await clearSessionsByPage(pageScope)
  }

  React.useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [lastResult, executing])

  // 显示的结果：优先使用 lastResult，其次使用 historyDetail
  const displayResult = lastResult ?? historyDetail
  const finalOutput = displayResult?.finalOutput ?? {}

  const rawContent = typeof finalOutput.rawContent === "string" ? finalOutput.rawContent : ""
  const hasStructuredOutput =
    (typeof finalOutput.summary === "string" && finalOutput.summary.length > 0) ||
    (Array.isArray(finalOutput.recommendations) && finalOutput.recommendations.length > 0) ||
    (Array.isArray(finalOutput.riskAlerts) && finalOutput.riskAlerts.length > 0)
  const extractedSummary = React.useMemo(() => {
    if (!rawContent) return ""
    const match = rawContent.match(/["']?summary["']?\s*[:：]\s*["']([^"']*)["']/i)
    return match ? match[1] : ""
  }, [rawContent])

  const getRiskBadgeClass = (level?: string) => {
    switch (level) {
      case "high": return "border-error text-error bg-error/10"
      case "medium": return "border-warning text-warning bg-warning/10"
      case "low": return "border-success text-success bg-success/10"
      default: return "border-border text-muted-foreground bg-muted/30"
    }
  }

  const getRiskLevelText = (level?: string) => {
    switch (level) {
      case "high": return "高风险"
      case "medium": return "中风险"
      case "low": return "低风险"
      default: return "提示"
    }
  }

  // 按钮状态：执行中(走马灯光效) / 成功(绿色) / 默认
  const isExecuting = executing
  const isCompleted = displayResult?.status === "completed" && !executing
  const isFailed = displayResult?.status === "failed" && !executing

  return (
    <>
      <Button
        variant="default"
        size={size}
        className={cn(
          "rounded-md transition-all duration-150 ease-out relative overflow-hidden",
          isExecuting && "ai-rainbow-btn",
          isCompleted && "border-success/40 bg-success/10 text-success shadow-[0_0_10px_hsl(152,60%,42%,0.45),0_0_20px_hsl(152,60%,42%,0.2)] hover:bg-success hover:text-white",
          isFailed && "bg-error text-white",
          !isExecuting && !isCompleted && !isFailed && "bg-primary text-primary-foreground hover:bg-primary/90",
          className,
        )}
        onClick={() => {
          if (isCompleted || displayResult) {
            // 有结果时点击重新展示结果
            setOpen(true)
            setMinimized(false)
          } else {
            setOpen(true)
            setMinimized(false)
          }
        }}
        disabled={disabled}
      >
        {isExecuting ? (
          <>
            {/* Uiverse 彩虹霓虹光效（保持按钮尺寸不变） */}
            <span className="glow" aria-hidden="true" />
            <span className="glow" aria-hidden="true" />
            <span className="display" aria-hidden="true" />
            <span className="content">
              <Loader2 className="size-4 animate-spin" />
              <span className="msg">AI分析中</span>
            </span>
          </>
        ) : isCompleted ? (
          <>
            <CheckCircle2 className="size-4" />
            {buttonText}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            {buttonText}
          </>
        )}
      </Button>

      {open && !minimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="bg-card border border-border rounded-sm shadow-none w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" />
                <h3 className="text-xl font-semibold tracking-tight">AI 数据分析</h3>
                {config && (
                  <Badge variant="outline" className="rounded-full text-xs">
                    {COLLABORATION_MODE_LABELS[config.collaborationMode]}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* 最小化按钮 */}
                <button
                  onClick={() => setMinimized(true)}
                  className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="最小化"
                >
                  <Minimize2 className="size-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="关闭"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Tab 导航 */}
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-border">
              <button
                onClick={() => setActiveTab("analysis")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === "analysis" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                分析
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <History className="size-3.5" />
                历史记录
                {sessions.length > 0 && (
                  <Badge variant="secondary" className="rounded-full text-[10px] px-1.5 h-4">
                    {sessions.length}
                  </Badge>
                )}
              </button>
            </div>

            {/* Content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-6">
              {activeTab === "analysis" ? (
                <>
                  {/* 问题输入区 */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">分析需求</label>
                    <Textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="输入你的分析问题，例如：当前数据反映了哪些异常趋势？"
                      className="min-h-[80px] rounded-sm resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        当前协同模式：{config ? COLLABORATION_MODE_LABELS[config.collaborationMode] : "加载中..."}
                      </p>
                      <Button
                        size="sm"
                        onClick={handleAnalyze}
                        disabled={executing || !question.trim() || !currentSkillKey}
                        className="rounded-sm"
                      >
                        {executing ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            分析中...
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" />
                            开始分析
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* 执行状态 */}
                  {executing && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span>正在调用模型分析数据...</span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                          <div className="h-full bg-primary animate-pulse w-2/3 rounded-full" />
                        </div>
                        <p className="text-xs text-muted-foreground">已选择 {config?.collaborationMode === "independent" ? "单模型" : "多模型"} 协同分析</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-sm border border-error/30 bg-error/10 p-4 flex items-start gap-3">
                      <AlertTriangle className="size-5 text-error shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-error">分析失败</p>
                        <p className="text-xs text-muted-foreground mt-1">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* 历史记录详情模式提示 */}
                  {historyDetail && !lastResult && !executing && (
                    <div className="rounded-sm border border-primary/30 bg-primary/5 p-3 flex items-center gap-2 text-xs">
                      <Clock className="size-3.5 text-primary" />
                      <span>查看历史记录 · {new Date(historyDetail.sessionId ? '' : '').toLocaleString('zh-CN')}</span>
                      <button onClick={() => setHistoryDetail(null)} className="ml-auto text-primary hover:underline">
                        返回新分析
                      </button>
                    </div>
                  )}

                  {/* 后端返回 failed 状态 */}
                  {displayResult && displayResult.status === "failed" && (
                    <div className="rounded-sm border border-error/30 bg-error/10 p-4 flex items-start gap-3">
                      <AlertTriangle className="size-5 text-error shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-error">分析失败</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {displayResult.errorMessage || "模型分析执行失败，请稍后重试"}
                        </p>
                      </div>
                    </div>
                  )}

                  {displayResult && displayResult.status === "completed" && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-4 text-success" />
                        <span>分析完成</span>
                        <span>·</span>
                        <span>{displayResult.latencyMs}ms</span>
                        {displayResult.totalUsage?.totalTokens && (
                          <>
                            <span>·</span>
                            <span>{displayResult.totalUsage.totalTokens} tokens</span>
                          </>
                        )}
                        {(() => {
                          const dq = finalOutput._dataQuality as { quality?: string } | undefined;
                          return dq?.quality ? (
                            <>
                              <span>·</span>
                              <Badge variant="outline" className={cn("rounded-full text-xs font-normal", QUALITY_LABELS[dq.quality]?.class ?? "")}>
                                数据质量: {QUALITY_LABELS[dq.quality]?.label ?? dq.quality}
                              </Badge>
                            </>
                          ) : null;
                        })()}
                        {(() => {
                          const vr = finalOutput._validationReport as { level?: string } | undefined;
                          return vr?.level ? (
                            <Badge variant="outline" className={cn("rounded-full text-xs font-normal", VALIDATION_LABELS[vr.level]?.class ?? "")}>
                              {VALIDATION_LABELS[vr.level]?.label ?? vr.level}
                            </Badge>
                          ) : null;
                        })()}
                      </div>

                      {Object.keys(finalOutput).filter(k => !k.startsWith("_")).length === 0 && !rawContent && (
                        <div className="rounded-sm border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
                          <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-warning">分析结果为空</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              模型执行完成但未返回有效内容，请尝试更换问题或检查数据质量后重试。
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 最终分析结果 */}
                      <div className="space-y-4">
                        {(() => {
                          const summaryText = typeof finalOutput.summary === "string" && finalOutput.summary.length > 0 ? finalOutput.summary : extractedSummary
                          if (!summaryText) return null
                          return (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <MessageSquare className="size-4 text-muted-foreground" />
                                分析摘要
                              </h4>
                              <div className="rounded-sm border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
                                {summaryText}
                              </div>
                            </div>
                          )
                        })()}

                        {!hasStructuredOutput && rawContent && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <AlertTriangle className="size-4 text-warning" />
                              模型原始输出（结构化解析失败，展示原文）
                            </h4>
                            <div className="rounded-sm border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                              {rawContent.replace(/```(?:json)?\s*/g, "").replace(/```$/g, "").trim()}
                            </div>
                          </div>
                        )}

                        {Array.isArray(finalOutput.riskAlerts) && finalOutput.riskAlerts.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <AlertTriangle className="size-4 text-muted-foreground" />
                              风险预警
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                              {(finalOutput.riskAlerts as Array<{ level?: string; description?: string; action?: string }>).map((alert, idx) => (
                                <div key={idx} className="rounded-sm border border-border p-3 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={cn("rounded-full text-xs", getRiskBadgeClass(alert.level))}>
                                      {getRiskLevelText(alert.level)}
                                    </Badge>
                                  </div>
                                  <p className="text-sm">{alert.description}</p>
                                  {alert.action && <p className="text-xs text-muted-foreground">建议行动：{alert.action}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(finalOutput.recommendations) && finalOutput.recommendations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Lightbulb className="size-4 text-muted-foreground" />
                              行动建议
                            </h4>
                            <ul className="space-y-2">
                              {(finalOutput.recommendations as string[]).map((rec, idx) => (
                                <li key={idx} className="flex items-start gap-2 rounded-sm border border-border p-3 text-sm">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                                    {idx + 1}
                                  </span>
                                  <span className="leading-relaxed">{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {hasStructuredOutput && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">完整分析结果</h4>
                            <pre className="rounded-sm border border-border bg-muted/30 p-3 text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                              {JSON.stringify(Object.fromEntries(Object.entries(finalOutput).filter(([k]) => !k.startsWith("_") && k !== "rawContent")), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* 反馈区（仅对新分析结果展示） */}
                      {lastResult && lastResult.sessionId !== 'preprocess-failed' && (
                        <div className="space-y-3 rounded-sm border border-border p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <ThumbsUp className="size-4 text-muted-foreground" />
                              评价分析结果
                            </h4>
                            {feedbackSubmitted && existingFeedbackRating !== null && (
                              <Badge variant="outline" className="rounded-full text-xs font-normal border-success text-success bg-success/10">
                                已评价 {existingFeedbackRating} 星
                              </Badge>
                            )}
                          </div>

                          {feedbackSubmitted ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CheckCircle2 className="size-3.5 text-success" />
                              <span>感谢反馈！你的评价将帮助优化分析质量</span>
                              {!showFeedbackDetail && (
                                <button onClick={() => setShowFeedbackDetail(true)} className="ml-auto text-primary hover:underline">
                                  修改评价
                                </button>
                              )}
                            </div>
                          ) : null}

                          {(showFeedbackDetail || !feedbackSubmitted) && (
                            <>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button key={star} onClick={() => setFeedbackRating(star)} onMouseEnter={() => setFeedbackHover(star)} onMouseLeave={() => setFeedbackHover(0)} className="p-0.5 transition-colors" aria-label={`评分 ${star} 星`}>
                                    <Star className={cn("size-6 transition-colors", (feedbackHover >= star || feedbackRating >= star) ? "fill-warning text-warning" : "fill-none text-muted-foreground/40")} />
                                  </button>
                                ))}
                                {feedbackRating > 0 && <span className="ml-2 text-xs text-muted-foreground">{feedbackRating} 星</span>}
                              </div>

                              {feedbackRating > 0 && feedbackRating <= 3 && (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">维度评分（可选）</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {(Object.keys(DIMENSION_LABELS) as FeedbackDimension[]).map((dim) => (
                                        <div key={dim} className="flex items-center gap-1.5">
                                          <span className="text-xs w-16 text-muted-foreground">{DIMENSION_LABELS[dim]}</span>
                                          <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                              <button key={s} onClick={() => setDimensionScore(dim, s)} className="p-0.5" aria-label={`${DIMENSION_LABELS[dim]} 评分 ${s}`}>
                                                <Star className={cn("size-3.5 transition-colors", (feedbackDimensions[dim] ?? 0) >= s ? "fill-warning text-warning" : "fill-none text-muted-foreground/40")} />
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">问题类型（可多选）</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(Object.keys(ISSUE_LABELS) as FeedbackIssueType[]).map((issue) => (
                                        <button key={issue} onClick={() => toggleIssue(issue)} className={cn("rounded-full px-2.5 py-0.5 text-xs transition-colors border", feedbackIssues.includes(issue) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-accent/20")}>
                                          {ISSUE_LABELS[issue]}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <Textarea value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="补充说明（可选）" className="min-h-[60px] rounded-sm resize-none text-sm" />

                              <div className="flex items-center justify-end gap-2">
                                {feedbackSubmitted && (
                                  <Button variant="ghost" size="sm" className="rounded-sm" onClick={() => setShowFeedbackDetail(false)} disabled={submittingFeedback}>
                                    取消
                                  </Button>
                                )}
                                <Button size="sm" className="rounded-sm" onClick={handleSubmitFeedback} disabled={feedbackRating === 0 || submittingFeedback}>
                                  {submittingFeedback ? (<><Loader2 className="size-3.5 animate-spin" />提交中...</>) : (<><ThumbsUp className="size-3.5" />提交评价</>)}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!executing && !displayResult && !error && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="size-8 mx-auto mb-3 text-primary/50" />
                      <p className="text-sm">输入分析需求并点击开始分析</p>
                      <p className="text-xs mt-1">AI 将基于当前页面数据生成洞察与建议</p>
                    </div>
                  )}
                </>
              ) : (
                /* 历史记录 Tab */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      共 {sessions.length} 条历史记录
                    </p>
                    {sessions.length > 0 && (
                      <Button variant="ghost" size="sm" className="rounded-sm text-error hover:text-error" onClick={handleClearAllHistory}>
                        <Trash2 className="size-3.5" />
                        清空全部
                      </Button>
                    )}
                  </div>

                  {loadingDetail && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="size-4 animate-spin" />
                      加载中...
                    </div>
                  )}

                  {sessions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="size-8 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm">暂无历史记录</p>
                      <p className="text-xs mt-1">执行 AI 分析后，结果将自动缓存于此</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => handleViewHistory(session.id)}
                          className="flex items-center gap-3 rounded-sm border border-border p-3 cursor-pointer hover:bg-accent/20 transition-colors duration-150"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {session.status === "completed" ? (
                                <CheckCircle2 className="size-4 text-success shrink-0" />
                              ) : (
                                <AlertTriangle className="size-4 text-error shrink-0" />
                              )}
                              <span className="text-sm font-medium truncate">
                                {session.userQuestion || "无问题分析"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{new Date(session.createdAt).toLocaleString("zh-CN")}</span>
                              {session.latencyMs && <span>· {session.latencyMs}ms</span>}
                              <Badge variant="outline" className="rounded-full text-[10px] font-normal">
                                {COLLABORATION_MODE_LABELS[session.collaborationMode as CollaborationMode] ?? session.collaborationMode}
                              </Badge>
                            </div>
                            {session.errorMessage && (
                              <p className="text-xs text-error mt-1 truncate">{session.errorMessage}</p>
                            )}
                          </div>
                          <button
                            onClick={(e) => handleDeleteHistory(session.id, e)}
                            className="shrink-0 rounded-sm p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">分析结果由大模型生成，仅供参考</p>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="rounded-sm">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 最小化浮动条 */}
      {open && minimized && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="flex items-center gap-2 bg-card border border-border rounded-full shadow-lg px-4 py-2">
            {executing ? (
              <>
                <span className="absolute inset-0 rounded-full overflow-hidden">
                  <span className="absolute inset-[-100%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0%,hsl(217,85%,52%)_25%,transparent_50%,hsl(217,85%,52%)_75%,transparent_100%)] opacity-20" />
                </span>
                <Loader2 className="size-4 animate-spin text-primary relative z-10" />
                <span className="text-sm relative z-10">AI 分析中...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm">AI 分析</span>
              </>
            )}
            <button
              onClick={() => setMinimized(false)}
              className="ml-2 rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="展开"
            >
              <Maximize2 className="size-3.5" />
            </button>
            <button
              onClick={() => { setOpen(false); setMinimized(false) }}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
