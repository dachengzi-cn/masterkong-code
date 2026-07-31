"use client"

import * as React from "react"
import { Eye, EyeOff, Loader2, RefreshCw, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import * as aiConfigApi from "@/api/ai-config"
import { aiProviders, getAiProvider } from "@/lib/ai/providers"
import { cn } from "@/lib/utils"
import type { AiModelEntry } from "@/lib/ai/types"
import { ModelStatusIndicator } from "@/components/business-ui/model-status-indicator"
import {
  formatBytes,
  getBatchTestSummary,
  getLatencyLevel,
  getLatencyLabel,
  getStabilityLabel,
} from "@/lib/ai/model-status"
import {
  useTestStore,
  runBuiltinTest,
  runBuiltinBatchTest,
} from "@/lib/ai/test-store"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function mapApiItemToModelEntry(item: {
  id: string
  configKey: string
  name: string
  providerId: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  isBuiltin: boolean
  isActive: boolean
  isEnabled: boolean
}): AiModelEntry {
  return {
    id: item.configKey,
    name: item.name,
    providerId: item.providerId,
    apiKey: item.apiKeyMasked,
    baseUrl: item.baseUrl,
    model: item.model,
  }
}

export function BuiltinAiConfigSection() {
  const [items, setItems] = React.useState<AiModelEntry[]>([])
  const [activeModelId, setActiveModelId] = React.useState<string>("")
  const [selectedModelId, setSelectedModelId] = React.useState<string>("")
  const [loading, setLoading] = React.useState(false)
  const [saveMessage, setSaveMessage] = React.useState("")
  const [errorMessage, setErrorMessage] = React.useState("")

  const [name, setName] = React.useState("")
  const [providerId, setProviderId] = React.useState("custom")
  const [apiKey, setApiKey] = React.useState("")
  const [apiKeyTouched, setApiKeyTouched] = React.useState(false)
  const [apiKeyMasked, setApiKeyMasked] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [model, setModel] = React.useState("")
  const [showApiKey, setShowApiKey] = React.useState(false)

  // Subscribe to module-level test store (survives unmount)
  const testStore = useTestStore()
  const batchBuiltin = testStore.batch.builtin

  const loadConfigs = React.useCallback(async () => {
    setLoading(true)
    setErrorMessage("")
    try {
      const response = await aiConfigApi.getAiModelConfigs()
      const entries = response.items.map(mapApiItemToModelEntry)
      setItems(entries)
      const active = response.activeConfigKey
      setActiveModelId(active ?? "")
      if (active && !selectedModelId) {
        setSelectedModelId(active)
      } else if (entries.length > 0 && !selectedModelId) {
        setSelectedModelId(entries[0].id)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载配置失败")
    } finally {
      setLoading(false)
    }
  }, [selectedModelId])

  React.useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const selectedModel = items.find((m) => m.id === selectedModelId)
  const selectedTestResult = selectedModelId
    ? testStore.results.get(selectedModelId)
    : undefined

  React.useEffect(() => {
    if (selectedModel) {
      setName(selectedModel.name)
      setProviderId(selectedModel.providerId)
      setApiKey("")
      setApiKeyTouched(false)
      setApiKeyMasked(selectedModel.apiKey)
      setBaseUrl(selectedModel.baseUrl)
      setModel(selectedModel.model)
      setShowApiKey(false)
    }
  }, [selectedModel])

  React.useEffect(() => {
    if (!saveMessage) return
    const timer = setTimeout(() => setSaveMessage(""), 3000)
    return () => clearTimeout(timer)
  }, [saveMessage])

  React.useEffect(() => {
    if (!errorMessage) return
    const timer = setTimeout(() => setErrorMessage(""), 5000)
    return () => clearTimeout(timer)
  }, [errorMessage])

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id)
  }

  const handleSetActive = async () => {
    if (!selectedModel) return
    try {
      await aiConfigApi.setActiveAiModelConfig(selectedModel.id)
      setActiveModelId(selectedModel.id)
      setSaveMessage("已设为默认模型")
      await loadConfigs()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "设置默认模型失败")
    }
  }

  const handleProviderChange = (value: string) => {
    setProviderId(value)
    const provider = getAiProvider(value)
    if (provider) {
      setBaseUrl(provider.defaultBaseUrl)
      setModel(provider.defaultModel)
    }
  }

  const handleSaveModel = async () => {
    if (!selectedModel) return
    try {
      await aiConfigApi.updateAiModelConfig(selectedModel.id, {
        name: name.trim() || selectedModel.name,
        providerId,
        baseUrl,
        model,
        apiKey: apiKeyTouched && apiKey ? apiKey : undefined,
      })
      setSaveMessage("保存成功")
      setApiKeyTouched(false)
      await loadConfigs()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存失败")
    }
  }

  const handleTest = () => {
    if (!selectedModel) return
    // Fire and forget — module store handles the rest
    runBuiltinTest(selectedModel.id)
  }

  const handleBatchTest = () => {
    if (items.length === 0 || batchBuiltin.testing) return
    const keys = items.map((m) => m.id)
    // Fire and forget — module store tracks progress and results
    runBuiltinBatchTest(keys)
  }

  const batchSummary = React.useMemo(() => {
    // Only count results for builtin model IDs
    const builtinIds = new Set(items.map((m) => m.id))
    const results = Array.from(testStore.results.values()).filter((r) =>
      builtinIds.has(r.configKey),
    )
    if (results.length === 0) return null
    return getBatchTestSummary(results)
  }, [testStore.results, items])

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">已配置模型</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2 text-xs"
              onClick={handleBatchTest}
              disabled={batchBuiltin.testing || items.length === 0}
            >
              {batchBuiltin.testing ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1 size-3.5" />
              )}
              {batchBuiltin.testing
                ? `全部测试 (${batchBuiltin.current}/${batchBuiltin.total})`
                : '全部链接测试'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2 text-xs"
              onClick={loadConfigs}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-3.5" />
              )}
              刷新
            </Button>
          </div>
        </div>

        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center gap-2 pb-2">
            {items.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                暂无模型配置
              </div>
            ) : (
              items.map((item) => {
                const provider = getAiProvider(item.providerId)
                const isActive = item.id === selectedModelId
                const itemTestResult = testStore.results.get(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectModel(item.id)}
                    className={cn(
                      "group relative flex min-w-[140px] max-w-[200px] flex-col items-start rounded-sm border px-3 py-2 text-left transition-colors",
                      isActive
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:border-primary hover:bg-accent",
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <ModelStatusIndicator result={itemTestResult} />
                      <span className="truncate text-sm font-medium">
                        {item.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="mt-1 h-4 rounded-full px-1.5 text-[10px] font-normal"
                      >
                        {provider?.name ?? item.providerId}
                      </Badge>
                      {activeModelId === item.id && (
                        <Badge
                          variant="outline"
                          className="mt-1 h-4 rounded-full px-1.5 text-[10px] font-normal"
                        >
                          默认
                        </Badge>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Batch test summary */}
      {batchSummary && batchSummary.total > 0 && (
        <div className="grid grid-cols-4 gap-2 rounded-sm border border-border bg-muted/30 p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">测试数</p>
            <p className="text-sm font-medium font-mono tabular-nums">{batchSummary.total}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">成功</p>
            <p className="text-sm font-medium font-mono tabular-nums text-[hsl(152,60%,42%)]">{batchSummary.success}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">失败</p>
            <p className="text-sm font-medium font-mono tabular-nums text-[hsl(4,72%,52%)]">{batchSummary.failed}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">平均延迟</p>
            <p className="text-sm font-medium font-mono tabular-nums">{batchSummary.avgLatency}ms</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-sm border border-destructive bg-destructive/10 p-3 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      {selectedModel ? (
        <>
          <Separator />

          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium">模型配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型名称</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="给模型起个名字"
                  className="h-8 rounded-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型提供商</Label>
                <Select value={providerId} onValueChange={handleProviderChange}>
                  <SelectTrigger className="h-8 w-full rounded-full">
                    <SelectValue placeholder="选择模型提供商" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <InputGroup className="h-8 rounded-full">
                  <InputGroupInput
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value)
                      setApiKeyTouched(true)
                    }}
                    placeholder={apiKeyMasked || "输入 API Key"}
                    className="h-full"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      onClick={() => setShowApiKey((prev) => !prev)}
                    >
                      {showApiKey ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <p className="text-[10px] text-muted-foreground">
                  留空则保留已保存的密钥；输入新密钥后将加密存储于数据库
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://..."
                  className="h-8 rounded-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型名称</Label>
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="例如 gpt-4o-mini"
                  className="h-8 rounded-full"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveModel}
                    className="rounded-full"
                    disabled={loading}
                  >
                    保存配置
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSetActive}
                    className="rounded-full"
                    disabled={loading || activeModelId === selectedModel.id}
                  >
                    设为默认
                  </Button>
                </div>
                {saveMessage && (
                  <span className="text-xs text-success">{saveMessage}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium">连接测试</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              <Button
                type="button"
                onClick={handleTest}
                disabled={selectedTestResult?.status === 'testing'}
                className="rounded-full"
              >
                {selectedTestResult?.status === 'testing' && <Spinner className="mr-1 size-4" />}
                测试连接
              </Button>

              {selectedTestResult && selectedTestResult.status !== 'testing' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-sm border border-border bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">网络延迟</p>
                      <p className="text-sm font-medium font-mono tabular-nums">
                        {selectedTestResult.latencyMs !== undefined
                          ? `${selectedTestResult.latencyMs}ms`
                          : '-'}
                      </p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">HTTP 状态码</p>
                      <p className="text-sm font-medium font-mono tabular-nums">
                        {selectedTestResult.statusCode ?? '-'}
                      </p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">数据包大小</p>
                      <p className="text-sm font-medium font-mono tabular-nums">
                        {selectedTestResult.contentLength !== undefined
                          ? formatBytes(selectedTestResult.contentLength)
                          : '-'}
                      </p>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">连接稳定性</p>
                      <p className="text-sm font-medium">
                        {selectedTestResult.status === 'error'
                          ? '不可用'
                          : getStabilityLabel(selectedTestResult.latencyMs)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-sm border border-border p-2">
                    <span className="text-[10px] text-muted-foreground">延迟评级</span>
                    {selectedTestResult.status === 'error' ? (
                      <span className="text-xs font-medium text-muted-foreground">连接失败</span>
                    ) : (
                      <span className="text-xs font-medium">
                        {getLatencyLabel(getLatencyLevel(selectedTestResult.latencyMs))}
                      </span>
                    )}
                    <ModelStatusIndicator result={selectedTestResult} size="md" className="ml-auto" />
                  </div>

                  {selectedTestResult.status === 'error' && selectedTestResult.errorMessage && (
                    <div className="rounded-sm border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
                      {selectedTestResult.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="rounded-sm border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          暂无模型，请刷新配置列表
        </div>
      )}
    </section>
  )
}
