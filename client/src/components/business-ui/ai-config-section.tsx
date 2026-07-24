"use client"

import * as React from "react"
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { testConnection } from "@/lib/ai/client"
import { aiProviders, getAiProvider } from "@/lib/ai/providers"
import {
  addModel,
  createModelFromConfig,
  deleteModel,
  loadModelStore,
  setActiveModel,
  updateModel,
} from "@/lib/ai/store"
import type {
  AiConfig,
  AiConnectionStatus,
  AiModelEntry,
  AiModelStore,
  AiTestError,
  AiTestResult,
} from "@/lib/ai/types"
import { cn } from "@/lib/utils"

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

const defaultConfig: AiConfig = {
  providerId: aiProviders[0]?.id ?? "openai",
  apiKey: "",
  baseUrl: aiProviders[0]?.defaultBaseUrl ?? "",
  model: aiProviders[0]?.defaultModel ?? "",
}

function isAiTestError(
  result: AiTestResult | AiTestError,
): result is AiTestError {
  return result.ok === false
}

export function AiConfigSection() {
  const [store, setStore] = React.useState<AiModelStore>(() => loadModelStore())
  const [selectedModelId, setSelectedModelId] = React.useState<string>("")
  const [saveMessage, setSaveMessage] = React.useState("")

  // Form state for the selected model
  const [name, setName] = React.useState("")
  const [providerId, setProviderId] = React.useState(defaultConfig.providerId)
  const [apiKey, setApiKey] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState(defaultConfig.baseUrl)
  const [model, setModel] = React.useState(defaultConfig.model)
  const [showApiKey, setShowApiKey] = React.useState(false)

  // Test state
  const [testInput, setTestInput] = React.useState(
    "你好，请简单回复一句话确认连接正常。",
  )
  const [status, setStatus] = React.useState<AiConnectionStatus>("idle")
  const [testResult, setTestResult] = React.useState<
    AiTestResult | AiTestError | null
  >(null)

  React.useEffect(() => {
    if (store.models.length > 0 && !selectedModelId) {
      setSelectedModelId(store.activeModelId || store.models[0]?.id || "")
    }
  }, [store, selectedModelId])

  React.useEffect(() => {
    const selected = store.models.find((m) => m.id === selectedModelId)
    if (selected) {
      setName(selected.name)
      setProviderId(selected.providerId)
      setApiKey(selected.apiKey)
      setBaseUrl(selected.baseUrl)
      setModel(selected.model)
      setShowApiKey(false)
      setStatus("idle")
      setTestResult(null)
    }
  }, [selectedModelId, store.models])

  React.useEffect(() => {
    if (!saveMessage) {
      return
    }
    const timer = setTimeout(() => setSaveMessage(""), 3000)
    return () => clearTimeout(timer)
  }, [saveMessage])

  const selectedModel = store.models.find((m) => m.id === selectedModelId)

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id)
    setStore((prev) => setActiveModel(prev, id))
  }

  const handleAddModel = () => {
    const newModel = createModelFromConfig(defaultConfig)
    setStore((prev) => {
      const next = addModel(prev, newModel)
      return next
    })
    setSelectedModelId(newModel.id)
  }

  const handleDeleteModel = (id: string) => {
    setStore((prev) => {
      const next = deleteModel(prev, id)
      return next
    })
  }

  const handleProviderChange = (value: string) => {
    setProviderId(value)
    const provider = getAiProvider(value)
    if (provider) {
      setBaseUrl(provider.defaultBaseUrl)
      setModel(provider.defaultModel)
    }
  }

  const handleSaveModel = () => {
    if (!selectedModel) {
      return
    }
    setStore((prev) =>
      updateModel(prev, selectedModel.id, {
        name: name.trim() || selectedModel.name,
        providerId,
        apiKey,
        baseUrl,
        model,
      }),
    )
    setSaveMessage("保存成功")
  }

  const handleTest = async () => {
    if (!selectedModel) {
      return
    }

    setStatus("testing")
    setTestResult(null)
    setSaveMessage("")

    const config: AiConfig = {
      providerId,
      apiKey,
      baseUrl,
      model,
    }

    const response = await testConnection(config)

    if (response.ok) {
      setStatus("success")
    } else {
      setStatus("error")
    }
    setTestResult(response)
  }

  const statusInfo = statusMap[status]

  return (
    <section className="space-y-4">
      {/* Model list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">已添加模型</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs"
            onClick={handleAddModel}
          >
            <Plus className="mr-1 size-3.5" />
            添加模型
          </Button>
        </div>

        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center gap-2 pb-2">
            {store.models.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                暂无自定义模型，点击右上角添加
              </div>
            ) : (
              store.models.map((item) => {
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
                      {store.activeModelId === item.id && (
                        <Badge
                          variant="outline"
                          className="mt-1 h-4 rounded-full px-1.5 text-[10px] font-normal"
                        >
                          默认
                        </Badge>
                      )}
                    </span>
                    {isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 size-5 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="删除模型"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteModel(item.id)
                        }}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    )}
                  </button>
                )
              })
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {selectedModel ? (
        <>
          <Separator />

          {/* Model detail form */}
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
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="API Key"
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
                <Button
                  type="button"
                  onClick={handleSaveModel}
                  className="rounded-full"
                >
                  保存配置
                </Button>
                {saveMessage && (
                  <span className="text-xs text-success">{saveMessage}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Test panel */}
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
          暂无模型，请先添加一个自定义模型
        </div>
      )}
    </section>
  )
}
