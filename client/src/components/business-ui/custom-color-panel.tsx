import * as React from 'react'
import { Plus, Trash2, RotateCcw, Check, Palette } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePreferences } from '@/components/theme-provider'
import {
  applyCustomTheme,
  SWATCHES,
  genId,
  hexToHsl,
  hslToString,
} from '@/themes/custom-color'
import { defaultTheme } from '@/themes/registry'
import type { BaseMode, CustomColorScheme } from '@/themes/types'

type ColorKey = 'primary' | 'accent' | 'success'

const COLOR_LABELS: Record<ColorKey, string> = {
  primary: '主色调',
  accent: '辅助色',
  success: '强调色',
}

const LOCAL_PREVIEW_KEY = 'app-custom-draft'

interface DraftState {
  primary: string
  accent: string
  success: string
  baseMode: BaseMode
  name: string
}

function loadDraft(): DraftState {
  try {
    const raw = localStorage.getItem(LOCAL_PREVIEW_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { primary: '#3b82f6', accent: '#8b5cf6', success: '#22c55e', baseMode: 'light', name: '' }
}

function persistDraft(draft: DraftState) {
  try {
    localStorage.setItem(LOCAL_PREVIEW_KEY, JSON.stringify(draft))
  } catch {
    // ignore
  }
}

export function CustomColorPanel() {
  const { theme, customSchemes, saveCustomScheme, deleteCustomScheme, applyCustomScheme, setTheme } =
    usePreferences()
  const [draft, setDraft] = React.useState<DraftState>(loadDraft)
  const [activeKey, setActiveKey] = React.useState<ColorKey>('primary')
  const [hue, setHue] = React.useState(() => hexToHsl(loadDraft().primary).h)
  // 仅当用户正在编辑（已选择自定义主题或面板首次打开且之前用过自定义）时实时预览。
  // 避免挂载时无条件覆盖当前内置主题的 CSS 变量导致颜色异常。
  const isPreviewing = theme.id.startsWith('custom:') || theme.id === 'custom'

  // 实时预览：仅当处于预览模式时，草稿变化才应用到 DOM
  React.useEffect(() => {
    if (!isPreviewing) return
    const scheme: CustomColorScheme = {
      id: 'draft',
      name: draft.name || '预览',
      primary: draft.primary,
      accent: draft.accent,
      success: draft.success,
      baseMode: draft.baseMode,
      createdAt: Date.now(),
    }
    applyCustomTheme(scheme)
    persistDraft(draft)
  }, [draft, isPreviewing])

  const updateColor = (key: ColorKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (key === 'primary') setHue(hexToHsl(value).h)
  }

  // 拖动色相滑块，围绕当前色相旋转“三色”组合，保持和谐
  const onHueDrag = (nextHue: number) => {
    setHue(nextHue)
    setDraft((prev) => {
      const base = hexToHsl(prev.primary).s
      const light = hexToHsl(prev.primary).l
      const primary = hslToString({ h: Math.round(nextHue), s: base, l: light })
      const accent = hslToString({ h: (Math.round(nextHue) + 40) % 360, s: 70, l: 62 })
      const success = hslToString({ h: (Math.round(nextHue) + 140) % 360, s: 60, l: 45 })
      return { ...prev, primary, accent, success }
    })
  }

  const handleSave = () => {
    const scheme: CustomColorScheme = {
      id: genId(),
      name: draft.name.trim() || `我的配色 ${customSchemes.length + 1}`,
      primary: draft.primary,
      accent: draft.accent,
      success: draft.success,
      baseMode: draft.baseMode,
      createdAt: Date.now(),
    }
    saveCustomScheme(scheme)
    applyCustomScheme(scheme)
  }

  const handleReset = () => {
    const fresh: DraftState = {
      primary: '#3b82f6',
      accent: '#8b5cf6',
      success: '#22c55e',
      baseMode: 'light',
      name: '',
    }
    setDraft(fresh)
    setHue(hexToHsl(fresh.primary).h)
    setTheme(defaultTheme)
  }

  const isActiveScheme = (id: string) => theme.id === `custom:${id}`

  return (
    <div className="flex flex-col gap-4">
      {/* 三色块 */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => {
          const selected = activeKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              className={cn(
                'group relative flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors',
                selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-accent/20'
              )}
            >
              <span
                className="h-9 w-full rounded-sm border border-border/40"
                style={{ background: draft[key] }}
              />
              <span className="text-xs text-muted-foreground">{COLOR_LABELS[key]}</span>
              {/* 隐藏的原生取色器，点击色块即触发 */}
              <input
                type="color"
                aria-label={COLOR_LABELS[key]}
                value={draft[key]}
                onChange={(e) => updateColor(key, e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </button>
          )
        })}
      </div>

      {/* 色板快捷点选 */}
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((sw, i) => (
          <button
            key={i}
            type="button"
            title={`${sw.primary} / ${sw.accent} / ${sw.success}`}
            onClick={() => {
              setDraft((prev) => ({
                ...prev,
                primary: sw.primary,
                accent: sw.accent,
                success: sw.success,
              }))
              setHue(hexToHsl(sw.primary).h)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 transition-transform hover:scale-110"
          >
            <span className="h-5 w-5 rounded-full" style={{ background: sw.primary }} />
          </button>
        ))}
      </div>

      {/* 色相拖拽条 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">拖动调整主色色相</span>
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => onHueDrag(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background:
              'linear-gradient(90deg, hsl(0,80%,55%), hsl(60,80%,55%), hsl(120,80%,45%), hsl(180,80%,45%), hsl(240,80%,55%), hsl(300,80%,55%), hsl(360,80%,55%))',
          }}
        />
      </div>

      {/* 基础模式：亮/暗 */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">基础模式</span>
        <Tabs
          value={draft.baseMode}
          onValueChange={(v) => setDraft((prev) => ({ ...prev, baseMode: v as BaseMode }))}
        >
          <TabsList className="w-full">
            <TabsTrigger value="light">亮色</TabsTrigger>
            <TabsTrigger value="dark">暗色</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 命名与保存 */}
      <div className="flex flex-col gap-2">
        <Input
          placeholder="为配色方案命名（可选）"
          value={draft.name}
          maxLength={20}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
        />
        <div className="flex gap-2">
          <Button onClick={handleSave} className="flex-1">
            <Plus /> 保存方案
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw /> 重置
          </Button>
        </div>
      </div>

      {/* 已保存方案 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Palette className="h-3.5 w-3.5" /> 已保存方案（{customSchemes.length}）
        </div>
        {customSchemes.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无保存的方案，调好颜色后点击「保存方案」。</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {customSchemes.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 transition-colors',
                  isActiveScheme(s.id) ? 'border-primary bg-accent/20' : 'border-border'
                )}
              >
                <span className="flex h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border/40">
                  <span className="h-full w-1/3" style={{ background: s.primary }} />
                  <span className="h-full w-1/3" style={{ background: s.accent }} />
                  <span className="h-full w-1/3" style={{ background: s.success }} />
                </span>
                <span className="flex-1 truncate text-sm">{s.name}</span>
                <span className="text-[10px] text-muted-foreground">{s.baseMode === 'dark' ? '暗' : '亮'}</span>
                {isActiveScheme(s.id) ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => applyCustomScheme(s)}
                  >
                    应用
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteCustomScheme(s.id)}
                  aria-label="删除方案"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
