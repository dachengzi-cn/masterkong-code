"use client"

import * as React from "react"
import { Loader2, Settings2 } from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAiAnalysis } from "@/hooks/use-ai-analysis"
import { getAiModelConfigs } from "@/api/ai-config"
import type { AiModelConfigItem } from "@shared/api.interface"
import type { CollaborationMode } from "@client/src/api/ai-analysis"
import { cn } from "@/lib/utils"
import { logger } from "@lark-apaas/client-toolkit/logger"
import { loadModelStore } from "@/lib/ai/store"
import type { AiModelEntry } from "@/lib/ai/types"

const COLLABORATION_MODE_OPTIONS: Array<{
  value: CollaborationMode
  label: string
  description: string
}> = [
  {
    value: "independent",
    label: "独立模式",
    description: "使用单个模型独立完成分析任务",
  },
  {
    value: "ensemble",
    label: "集成模式",
    description: "多模型并行分析，聚合各模型优势",
  },
  {
    value: "planner-executor-critic",
    label: "规划-执行-评判",
    description: "三阶段协同：规划→执行→评审",
  },
]

interface UnifiedModel {
  configKey: string
  name: string
  providerId: string
  isBuiltin: boolean
}

function builtinToUnified(item: AiModelConfigItem): UnifiedModel {
  return {
    configKey: item.configKey,
    name: item.name,
    providerId: item.providerId,
    isBuiltin: true,
  }
}

function customToUnified(item: AiModelEntry): UnifiedModel {
  return {
    configKey: `custom:${item.id}`,
    name: item.name,
    providerId: item.providerId,
    isBuiltin: false,
  }
}

export function AiAnalysisConfigSection() {
  const { config, loadConfig, saveConfig } = useAiAnalysis()
  const [builtinModels, setBuiltinModels] = React.useState<AiModelConfigItem[]>([])
  const [customModels, setCustomModels] = React.useState<AiModelEntry[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    loadConfig()
    getAiModelConfigs()
      .then((res) => setBuiltinModels(res.items))
      .catch((err) => logger.error("Failed to load AI model configs:", err))
    setCustomModels(loadModelStore().models)
  }, [loadConfig])

  const enabledBuiltinModels = builtinModels.filter((m) => m.isEnabled)
  const allModels: UnifiedModel[] = React.useMemo(() => [
    ...enabledBuiltinModels.map(builtinToUnified),
    ...customModels.map(customToUnified),
  ], [enabledBuiltinModels, customModels])

  const handleModeChange = async (mode: CollaborationMode) => {
    setSaving(true)
    try {
      const updates: Partial<{ collaborationMode: CollaborationMode; defaultConfigKey: string; ensembleConfigKeys: string[]; plannerConfigKey: string; executorConfigKey: string; criticConfigKey: string }> = {
        collaborationMode: mode,
      }

      if (mode === "independent" && allModels.length > 0) {
        if (!config?.defaultConfigKey) {
          updates.defaultConfigKey = allModels[0].configKey
        }
      } else if (mode === "ensemble") {
        if (!config?.ensembleConfigKeys || config.ensembleConfigKeys.length === 0) {
          updates.ensembleConfigKeys = allModels.map((m) => m.configKey)
        }
      } else if (mode === "planner-executor-critic") {
        if (allModels.length >= 3) {
          if (!config?.plannerConfigKey) updates.plannerConfigKey = allModels[0].configKey
          if (!config?.executorConfigKey) updates.executorConfigKey = allModels[1].configKey
          if (!config?.criticConfigKey) updates.criticConfigKey = allModels[2].configKey
        } else if (allModels.length > 0) {
          if (!config?.plannerConfigKey) updates.plannerConfigKey = allModels[0].configKey
          if (!config?.executorConfigKey) updates.executorConfigKey = allModels[0].configKey
          if (!config?.criticConfigKey) updates.criticConfigKey = allModels[allModels.length - 1].configKey
        }
      }

      await saveConfig(updates)
    } finally {
      setSaving(false)
    }
  }

  const handleModelAssignment = async (
    field: "defaultConfigKey" | "plannerConfigKey" | "executorConfigKey" | "criticConfigKey" | "ensembleConfigKeys",
    value: string,
  ) => {
    setSaving(true)
    try {
      if (field === "ensembleConfigKeys") {
        const current = config?.ensembleConfigKeys ?? []
        const next = current.includes(value)
          ? current.filter((k) => k !== value)
          : [...current, value]
        await saveConfig({ ensembleConfigKeys: next })
      } else {
        await saveConfig({ [field]: value } as Partial<typeof config>)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const renderModelOption = (m: UnifiedModel) => (
    <SelectItem key={m.configKey} value={m.configKey}>
      <span className="flex items-center gap-1.5">
        {m.name}
        {m.isBuiltin ? (
          <Badge variant="secondary" className="h-3.5 rounded-full px-1 text-[9px] font-normal">内置</Badge>
        ) : (
          <Badge variant="outline" className="h-3.5 rounded-full px-1 text-[9px] font-normal">自定义</Badge>
        )}
      </span>
    </SelectItem>
  )

  return (
    <div className="space-y-4">
      {/* 协同模式选择 */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">协同模式</Label>
        <Select
          value={config.collaborationMode}
          onValueChange={(v) => handleModeChange(v as CollaborationMode)}
          disabled={saving}
        >
          <SelectTrigger className="h-8 w-full rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLLABORATION_MODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex flex-col">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 模式对应的模型配置 */}
      {config.collaborationMode === "independent" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">分析模型</Label>
          <Select
            value={config.defaultConfigKey ?? ""}
            onValueChange={(v) => handleModelAssignment("defaultConfigKey", v)}
            disabled={saving}
          >
            <SelectTrigger className="h-8 w-full rounded-full">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {allModels.map(renderModelOption)}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.collaborationMode === "ensemble" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            集成模型（多选）
          </Label>
          <div className="space-y-2 rounded-sm border border-border p-3">
            {allModels.map((m) => {
              const selected = config.ensembleConfigKeys?.includes(m.configKey) ?? false
              return (
                <button
                  key={m.configKey}
                  type="button"
                  onClick={() => handleModelAssignment("ensembleConfigKeys", m.configKey)}
                  disabled={saving}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors duration-150 ease-out",
                    selected
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card hover:border-primary hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {m.name}
                    {m.isBuiltin ? (
                      <Badge variant="secondary" className="h-3.5 rounded-full px-1 text-[9px] font-normal">内置</Badge>
                    ) : (
                      <Badge variant="outline" className="h-3.5 rounded-full px-1 text-[9px] font-normal">自定义</Badge>
                    )}
                  </span>
                  {selected && <Badge variant="default" className="rounded-full">已选</Badge>}
                </button>
              )
            })}
            {allModels.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                暂无可用模型，请先在上方启用模型
              </p>
            )}
          </div>
        </div>
      )}

      {config.collaborationMode === "planner-executor-critic" && (
        <div className="space-y-3">
          {customModels.length > 0 && (
            <div className="rounded-sm border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              已加载 {customModels.length} 个自定义模型，可与内置模型混合分配
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              规划模型（Planner）
            </Label>
            <Select
              value={config.plannerConfigKey ?? ""}
              onValueChange={(v) => handleModelAssignment("plannerConfigKey", v)}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-full rounded-full">
                <SelectValue placeholder="选择规划模型" />
              </SelectTrigger>
              <SelectContent>
                {allModels.map(renderModelOption)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              执行模型（Executor）
            </Label>
            <Select
              value={config.executorConfigKey ?? ""}
              onValueChange={(v) => handleModelAssignment("executorConfigKey", v)}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-full rounded-full">
                <SelectValue placeholder="选择执行模型" />
              </SelectTrigger>
              <SelectContent>
                {allModels.map(renderModelOption)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              评判模型（Critic）
            </Label>
            <Select
              value={config.criticConfigKey ?? ""}
              onValueChange={(v) => handleModelAssignment("criticConfigKey", v)}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-full rounded-full">
                <SelectValue placeholder="选择评判模型" />
              </SelectTrigger>
              <SelectContent>
                {allModels.map(renderModelOption)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {allModels.length === 0 && (
        <div className="rounded-sm border border-border bg-muted/30 p-3 text-center">
          <Settings2 className="mx-auto size-4 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">
            请先在上方「AI 模型接入」中启用至少一个模型
          </p>
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          保存中...
        </div>
      )}
    </div>
  )
}
