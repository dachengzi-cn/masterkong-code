import type { BaseMode, CustomColorScheme } from './types'

export interface HSL {
  h: number
  s: number
  l: number
}

export function hexToHsl(hex: string): HSL {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let hue = 0
  let sat = 0
  const light = (max + min) / 2

  if (max !== min) {
    const d = max - min
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        hue = (b - r) / d + 2
        break
      default:
        hue = (r - g) / d + 4
    }
    hue /= 6
  }

  return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(light * 100) }
}

export function hslToString({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function adjust(hsl: HSL, dH = 0, dS = 0, dL = 0): string {
  const h = (hsl.h + dH + 360) % 360
  const s = Math.min(100, Math.max(0, hsl.s + dS))
  const l = Math.min(100, Math.max(0, hsl.l + dL))
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

function withAlpha(hsl: HSL, alpha: number): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}% / ${alpha})`
}

// 预设色板，供用户点选组合
export const SWATCHES: { primary: string; accent: string; success: string }[] = [
  { primary: '#3b82f6', accent: '#6366f1', success: '#22c55e' },
  { primary: '#0ea5e9', accent: '#8b5cf6', success: '#10b981' },
  { primary: '#8b5cf6', accent: '#ec4899', success: '#14b8a6' },
  { primary: '#ef4444', accent: '#f97316', success: '#22c55e' },
  { primary: '#f59e0b', accent: '#10b981', success: '#3b82f6' },
  { primary: '#14b8a6', accent: '#0ea5e9', success: '#22c55e' },
  { primary: '#ec4899', accent: '#8b5cf6', success: '#06b6d4' },
  { primary: '#6366f1', accent: '#0ea5e9', success: '#f59e0b' },
  { primary: '#0d9488', accent: '#f43f5e', success: '#84cc16' },
  { primary: '#7c3aed', accent: '#2563eb', success: '#10b981' },
]

interface VarSet {
  [key: string]: string
}

function buildVars(primary: string, accent: string, success: string, mode: BaseMode): VarSet {
  const p = hexToHsl(primary)
  const a = hexToHsl(accent)
  const s = hexToHsl(success)
  const dark = mode === 'dark'

  const bg = dark ? hslToString({ h: p.h, s: 14, l: 12 }) : hslToString({ h: p.h, s: 18, l: 97 })
  const fg = dark ? hslToString({ h: p.h, s: 10, l: 88 }) : hslToString({ h: p.h, s: 25, l: 12 })
  const cardBg = dark ? hslToString({ h: p.h, s: 14, l: 16 }) : 'hsl(0, 0%, 100%)'
  const mutedBg = dark ? hslToString({ h: p.h, s: 14, l: 20 }) : hslToString({ h: p.h, s: 16, l: 96 })
  const mutedFg = dark ? hslToString({ h: p.h, s: 10, l: 60 }) : hslToString({ h: p.h, s: 12, l: 52 })
  const border = dark ? hslToString({ h: p.h, s: 14, l: 26 }) : hslToString({ h: p.h, s: 15, l: 88 })

  const vars: VarSet = {
    '--background': bg,
    '--foreground': fg,
    '--card': cardBg,
    '--card-foreground': fg,
    '--popover': cardBg,
    '--popover-foreground': fg,
    '--primary': hslToString(p),
    '--primary-foreground': dark ? hslToString({ h: p.h, s: 30, l: 12 }) : 'hsl(0, 0%, 100%)',
    '--secondary': mutedBg,
    '--secondary-foreground': fg,
    '--muted': mutedBg,
    '--muted-foreground': mutedFg,
    '--accent': dark ? adjust(a, 0, 0, -8) : hslToString(a),
    '--accent-foreground': dark ? hslToString({ h: a.h, s: 60, l: 82 }) : hslToString({ h: a.h, s: 60, l: 35 }),
    '--info': hslToString(p),
    '--info-foreground': dark ? hslToString({ h: p.h, s: 30, l: 12 }) : hslToString({ h: p.h, s: 85, l: 97 }),
    '--destructive': dark ? adjust({ h: 4, s: 72, l: 52 }, 0, 0, 8) : 'hsl(4, 72%, 52%)',
    '--destructive-foreground': 'hsl(0, 0%, 100%)',
    '--success': hslToString(s),
    '--success-foreground': dark ? hslToString({ h: s.h, s: 30, l: 12 }) : hslToString({ h: s.h, s: 60, l: 97 }),
    '--warning': 'hsl(38, 85%, 48%)',
    '--warning-foreground': dark ? hslToString({ h: 38, s: 30, l: 12 }) : 'hsl(38, 85%, 96%)',
    '--border': border,
    '--input': border,
    '--ring': hslToString(p),
    '--sidebar': dark ? hslToString({ h: p.h, s: 20, l: 9 }) : hslToString({ h: p.h, s: 22, l: 14 }),
    '--sidebar-foreground': dark ? hslToString({ h: p.h, s: 10, l: 72 }) : hslToString({ h: p.h, s: 10, l: 78 }),
    '--sidebar-primary': hslToString(p),
    '--sidebar-primary-foreground': 'hsl(0, 0%, 100%)',
    '--sidebar-accent': dark ? hslToString({ h: p.h, s: 18, l: 16 }) : hslToString({ h: p.h, s: 18, l: 20 }),
    '--sidebar-accent-foreground': dark ? hslToString({ h: p.h, s: 10, l: 82 }) : hslToString({ h: p.h, s: 10, l: 90 }),
    '--sidebar-border': dark ? hslToString({ h: p.h, s: 15, l: 18 }) : hslToString({ h: p.h, s: 15, l: 22 }),
    '--sidebar-ring': adjust(p, 0, 0, 8),
    '--chart-1': hslToString(p),
    '--chart-2': hslToString(a),
    '--chart-3': hslToString(s),
    '--chart-4': adjust(p, 60, 0, 0),
    '--chart-5': adjust(a, -40, 0, 0),
  }

  // 半透明描边变量（按钮等使用）
  vars['--primary-border'] = withAlpha(p, 0.9)
  vars['--secondary-border'] = withAlpha(hexToHsl(cardBg), 0.9)
  vars['--destructive-border'] = withAlpha({ h: 4, s: 72, l: 52 }, 0.9)
  vars['--accent-border'] = withAlpha(a, 0.9)
  vars['--muted-border'] = withAlpha(hexToHsl(mutedBg), 0.9)

  return vars
}

export function applyCustomTheme(scheme: CustomColorScheme): void {
  const vars = buildVars(scheme.primary, scheme.accent, scheme.success, scheme.baseMode)
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.dataset.theme = 'custom'
  root.dataset.customMode = scheme.baseMode
  document.documentElement.classList.toggle('dark', scheme.baseMode === 'dark')
}

export function clearCustomVars(): void {
  const root = document.documentElement
  const sample = buildVars('#3b82f6', '#6366f1', '#22c55e', 'light')
  for (const key of Object.keys(sample)) {
    root.style.removeProperty(key)
  }
  delete root.dataset.customMode
  document.documentElement.classList.remove('dark')
}

export function genId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
