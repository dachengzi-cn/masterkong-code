"use client"

import * as React from "react"
import { usePreferences } from "@/components/theme-provider"
import { AiConfigSection } from "@/components/business-ui/ai-config-section"
import { BuiltinAiConfigSection } from "@/components/business-ui/builtin-ai-config-section"
import { AiAnalysisConfigSection } from "@/components/business-ui/ai-analysis-config-section"
import { AiSkillsSection } from "@/components/business-ui/ai-skills-section"
import { AvatarEditor } from "@/components/business-ui/avatar-editor"
import { CustomColorPanel } from "@/components/business-ui/custom-color-panel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { fontOptions } from "@/themes/fonts"
import { emojiOptions } from "@/themes/emojis"
import { themes } from "@/themes/registry"

export interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsSection =
  | "theme"
  | "font"
  | "avatar"
  | "builtin-ai"
  | "custom-ai"
  | "ai-collaboration"
  | "ai-skills"

const NAV_ITEMS: Array<{
  id: SettingsSection
  label: string
  icon: React.ReactNode
}> = [
  { id: "theme", label: "主题", icon: <span className="text-base leading-none">🎨</span> },
  { id: "font", label: "字体", icon: <span className="text-base leading-none">🔤</span> },
  { id: "avatar", label: "头像", icon: <span className="text-base leading-none">👤</span> },
  { id: "builtin-ai", label: "AI 模型接入", icon: <span className="text-base leading-none">🔌</span> },
  { id: "custom-ai", label: "自定义模型", icon: <span className="text-base leading-none">🧩</span> },
  { id: "ai-collaboration", label: "AI 分析协同模式", icon: <span className="text-base leading-none">🤝</span> },
  { id: "ai-skills", label: "AI 分析技能", icon: <span className="text-base leading-none">🪄</span> },
]

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { theme, setTheme, font, setFont, avatar, setAvatar } = usePreferences()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("theme")

  const handleConfirmAvatar = (imageDataUrl: string) => {
    setAvatar({ type: "image", value: imageDataUrl })
  }

  const handleResetAvatar = () => {
    setAvatar({ type: "emoji", value: "🐼" })
  }

  const renderSection = () => {
    switch (activeSection) {
      case "theme":
        return (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">主题</h3>
              <p className="text-xs text-muted-foreground mt-1">
                选择应用的整体配色方案，切换后即时生效
              </p>
            </div>
            <Select
              value={theme.id}
              onValueChange={(value) => {
                const next = themes.find((t) => t.id === value)
                if (next) {
                  setTheme(next)
                }
              }}
            >
              <SelectTrigger className="h-8 w-full rounded-full">
                <SelectValue placeholder="选择主题" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-4 rounded-full border border-border"
                        style={{ backgroundColor: t.preview }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="border-t border-border pt-4">
              <h3 className="mb-1 text-sm font-medium text-foreground">自定义配色</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                点选或拖动调整主色、辅助色与强调色，实时预览并保存多组方案
              </p>
              <CustomColorPanel />
            </div>
          </section>
        )

      case "font":
        return (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">字体</h3>
              <p className="text-xs text-muted-foreground mt-1">
                设置全局正文字体族，影响所有文本内容的渲染样式
              </p>
            </div>
            <Select
              value={font.id}
              onValueChange={(value) => {
                const next = fontOptions.find((f) => f.id === value)
                if (next) {
                  setFont(next)
                }
              }}
            >
              <SelectTrigger className="h-8 w-full rounded-full">
                <SelectValue placeholder="选择字体" />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-sm border border-border bg-muted/30 p-3">
              <p
                className="text-sm text-foreground"
                style={{ fontFamily: font.family }}
              >
                天地玄黄，宇宙洪荒。The quick brown fox jumps over the lazy
                dog.
              </p>
            </div>
          </section>
        )

      case "avatar":
        return (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">头像</h3>
              <p className="text-xs text-muted-foreground mt-1">
                上传自定义图片或从内置表情中选择个性化头像
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">当前头像</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setEditorOpen(true)}
                >
                  上传图片
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={handleResetAvatar}
                >
                  恢复默认
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Avatar className="size-16 border border-border">
                {avatar.type === "image" && (
                  <AvatarImage
                    src={avatar.value}
                    alt="当前头像"
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="text-2xl bg-muted">
                  {avatar.type === "emoji" ? avatar.value : "🐼"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {avatar.type === "image" ? "自定义图片" : avatar.value}
              </span>
            </div>

            <Separator />

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                内置表情
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {emojiOptions.map((option) => {
                  const isActive =
                    avatar.type === "emoji" && avatar.value === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setAvatar({ type: "emoji", value: option.value })
                      }
                      aria-label={option.label}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-sm border text-2xl transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isActive
                          ? "border-primary bg-accent"
                          : "border-border bg-card hover:border-primary hover:bg-accent"
                      )}
                    >
                      {option.value}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )

      case "builtin-ai":
        return (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">AI 模型接入</h3>
              <p className="text-xs text-muted-foreground mt-1">
                管理内置 AI 模型配置，包括 API Key、Base URL 等连接参数
              </p>
            </div>
            <Separator />
            <BuiltinAiConfigSection />
          </section>
        )

      case "custom-ai":
        return (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">自定义模型</h3>
              <p className="text-xs text-muted-foreground mt-1">
                添加和管理自定义 AI 模型，支持多种提供商和配置参数
              </p>
            </div>
            <Separator />
            <AiConfigSection />
          </section>
        )

      case "ai-collaboration":
        return (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">AI 分析协同模式</h3>
              <p className="text-xs text-muted-foreground mt-1">
                配置多模型协同分析策略，包括独立模式、集成模式及规划-执行-评判三阶段模式
              </p>
            </div>
            <Separator />
            <AiAnalysisConfigSection />
          </section>
        )

      case "ai-skills":
        return (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">AI 分析技能</h3>
              <p className="text-xs text-muted-foreground mt-1">
                查看与优化各页面分析技能的 Prompt 模板、输出 Schema 与版本存档
              </p>
            </div>
            <Separator />
            <AiSkillsSection />
          </section>
        )

      default:
        return null
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          style={{
            width: "min(1200px, calc(100vw - 2rem))",
            height: "min(750px, calc(100vh - 2rem))",
            maxWidth: "none",
            maxHeight: "none",
          }}
          className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border p-0 shadow-lg"
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
            <DialogTitle>系统设置</DialogTitle>
            <DialogDescription className="sr-only">自定义主题、字体、头像与 AI 配置</DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* 左侧导航 */}
            <nav className="w-56 shrink-0 border-r border-border bg-muted/30 overflow-y-auto py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors duration-150 ease-out",
                    activeSection === item.id
                      ? "bg-accent text-accent-foreground font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-l-2 border-transparent",
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            {/* 右侧内容 */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderSection()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AvatarEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onConfirm={handleConfirmAvatar}
      />
    </>
  )
}
