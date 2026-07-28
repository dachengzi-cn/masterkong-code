"use client"

import * as React from "react"
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import * as aiConfigApi from "@/api/ai-config"
import { aiProviders, getAiProvider } from "@/lib/ai/providers"
import { cn } from "@/lib/utils"
import type {
  AiConnectionStatus,
  AiModelEntry,
  AiTestError,
  AiTestResult,
} from "@/lib/ai/types"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const statusMap: Record<
  AiConnectionStatus,
  { label: string; classes: string }
> = {
  idle: {
    label: "待测试",
    classes: "border-border bg-muted text-muted-foreground",
  },
  testing: {
    label: "测试中...",
    classes: "border-warning bg-warning/10 text-warning",
  },
  success: {
    label: "连接成功",
    classes: "border-success bg-success/10 text-success",
  },
  error: {
    label: "连接失败",
    classes: "border-destructive bg-destructive/10 text-destructive",
  },
}

function isAiTestError(
  result: AiTestResult | AiTestError,
): result is AiTestError {
  return result.ok === false
}

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

  const [testInput, setTestInput] = React.useState(
    "你好，请简单回复一句话确认连接正常。",
  )
  const [status, setStatus] = React.useState<AiConnectionStatus>("idle")
  const [testResult, setTestResult] = React.useState<
    AiTestResult | AiTestError | null
  >(null)

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
      setStatus("idle")
      setTestResult(null)
    }
  }, [selectedModel])

  React.useEffect(() => {
    if (!saveMessage) {
      return
    }
    const timer = setTimeout(() => setSaveMessage(""), 3000)
    return () => clearTimeout(timer)
  }, [saveMessage])

  React.useEffect(() => {
    if (!errorMessage) {
      return
    }
    const timer = setTimeout(() => setErrorMessage(""), 5000)
    return () => clearTimeout(timer)
  }, [errorMessage])

  const handleSelectModel = async (id: string) => {
    setSelectedModelId(id)
    setStatus("idle")
    setTestResult(null)
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

  const handleTest = async () => {
    if (!selectedModel) return

    setStatus("testing")
    setTestResult(null)
    setSaveMessage("")

    try {
      const response = await aiConfigApi.testAiModelConfig(selectedModel.id, {
        messages: [{ role: "user", content: testInput }],
        maxTokens: 100,
      })

      if (response.ok) {
        setStatus("success")
        setTestResult({
          ok: true,
          content: response.content ?? "",
          metrics: {
            latencyMs: response.metrics?.latencyMs ?? 0,
            statusCode: response.metrics?.statusCode ?? 0,
            usage: response.metrics?.usage
              ? {
                  promptTokens: response.metrics.usage.promptTokens,
                  completionTokens: response.metrics.usage.completionTokens,
                  totalTokens: response.metrics.usage.totalTokens,
                }
              : undefined,
          },
          raw: response,
        })
      } else {
        setStatus("error")
        setTestResult({
          ok: false,
          error: response.error ?? "连接失败",
          metrics: response.metrics
            ? {
                latencyMs: response.metrics.latencyMs,
                statusCode: response.metrics.statusCode,
              }
            : undefined,
          raw: response,
        })
      }
    } catch (error) {
      setStatus("error")
      setTestResult({
        ok: false,
        error: error instanceof Error ? error.message : "连接测试失败",
      })
    }
  }

  const statusInfo = statusMap[status]

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">已配置模型</Label>
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
                    <span className="truncate text-sm font-medium">
                      {item.name}
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">状态</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    statusInfo.classes,
                  )}
                >
                  {status === "testing" && <Spinner className="mr-1 size-3" />}
                  {statusInfo.label}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">测试内容</Label>
                <Textarea
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                  placeholder="输入测试内容"
                  className="min-h-[80px] rounded-sm"
                />
              </div>

              <Button
                type="button"
                onClick={handleTest}
                disabled={status === "testing"}
                className="rounded-full"
              >
                {status === "testing" && <Spinner className="mr-1 size-4" />}
                测试连接
              </Button>

              {testResult && (
                <div
                  className={cn(
                    "space-y-2 rounded-sm border p-3 text-sm",
                    testResult.ok
                      ? "border-success bg-success/10 text-success"
                      : "border-destructive bg-destructive/10 text-destructive",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {testResult.metrics && (
                      <>
                        <span>
                          响应延迟：
                          <strong>{testResult.metrics.latencyMs}ms</strong>
                        </span>
                        <span>
                          HTTP 状态：
                          <strong>{testResult.metrics.statusCode}</strong>
                        </span>
                        {testResult.ok && testResult.metrics.usage && (
                          <span>
                            Token：
                            <strong>
                              {testResult.metrics.usage.totalTokens ?? "-"}
                            </strong>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <Separator
                    className={cn(
                      "my-2",
                      testResult.ok
                        ? "bg-success/30"
                        : "bg-destructive/30",
                    )}
                  />
                  {testResult.ok ? (
                    <p className="whitespace-pre-wrap break-words">
                      {testResult.content}
                    </p>
                  ) : isAiTestError(testResult) ? (
                    <p className="whitespace-pre-wrap break-words">
                      {testResult.error}
                    </p>
                  ) : null}
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
