"use client"

import * as React from "react"

import { usePreferences } from "@/components/theme-provider"
import { AiConfigSection } from "@/components/business-ui/ai-config-section"
import { AvatarEditor } from "@/components/business-ui/avatar-editor"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { fontOptions } from "@/themes/fonts"
import { emojiOptions } from "@/themes/emojis"
import { themes } from "@/themes/registry"

export interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { theme, setTheme, font, setFont, avatar, setAvatar } = usePreferences()
  const [editorOpen, setEditorOpen] = React.useState(false)

  const handleConfirmAvatar = (imageDataUrl: string) => {
    setAvatar({ type: "image", value: imageDataUrl })
  }

  const handleResetAvatar = () => {
    setAvatar({ type: "emoji", value: "🐼" })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader className="px-0 pt-0">
            <SheetTitle>个性化设置</SheetTitle>
            <SheetDescription>自定义主题、字体与头像</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-2">
            {/* 主题 */}
            <section className="space-y-3">
              <Label className="text-xs text-muted-foreground">主题</Label>
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
            </section>

            <Separator />

            {/* 字体 */}
            <section className="space-y-3">
              <Label className="text-xs text-muted-foreground">字体</Label>
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

            <Separator />

            {/* 头像 */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">头像</Label>
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
            </section>

            <Separator />

            {/* AI 模型接入与测试 */}
            <section className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                AI 模型接入与测试
              </Label>
              <AiConfigSection />
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <AvatarEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onConfirm={handleConfirmAvatar}
      />
    </>
  )
}
