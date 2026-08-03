import React, { createContext, useContext, useEffect, useState } from 'react';
import { themes, defaultTheme } from '@/themes/registry';
import { fontOptions } from '@/themes/fonts';
import { emojiOptions } from '@/themes/emojis';
import type { Theme } from '@/themes/types';
import type { FontOption } from '@/themes/fonts';
import {
  applyCustomTheme,
  clearCustomVars,
} from '@/themes/custom-color';
import { loadCustomSchemes, saveCustomSchemes } from '@/themes/custom-storage';
import type { CustomColorScheme } from '@/themes/types';

// 将当前主色同步到浏览器 <meta name="theme-color">，使移动端标签页/地址栏颜色随主题更新。
// 读取已挂载到 documentElement 上的 --primary（内置主题由 CSS 提供，自定义主题由 applyCustomTheme 写入）。
function syncThemeColor() {
  if (typeof document === 'undefined') return
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  const color = raw || '#3b82f6'
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}

export type AvatarPreference =
  | { type: 'emoji'; value: string }
  | { type: 'image'; value: string };

export interface PreferencesContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: FontOption;
  setFont: (font: FontOption) => void;
  avatar: AvatarPreference;
  setAvatar: (avatar: AvatarPreference) => void;
  resolvedTheme: Theme;
  customSchemes: CustomColorScheme[];
  saveCustomScheme: (scheme: CustomColorScheme) => void;
  deleteCustomScheme: (id: string) => void;
  applyCustomScheme: (scheme: CustomColorScheme) => void;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: Theme;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'app-theme';
const FONT_STORAGE_KEY = 'app-font';
const AVATAR_STORAGE_KEY = 'app-avatar';
const THEME_IDS = new Set(themes.map((t) => t.id));
const FONT_IDS = new Set(fontOptions.map((f) => f.id));
const DEFAULT_AVATAR: AvatarPreference = { type: 'emoji', value: '🐼' };

function getCustomThemeById(id: string): Theme | null {
  if (!id.startsWith('custom:')) return null
  const schemeId = id.slice('custom:'.length)
  const scheme = loadCustomSchemes().find((s) => s.id === schemeId)
  if (!scheme) return null
  return { id, name: scheme.name, preview: scheme.primary, custom: true }
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      if (THEME_IDS.has(stored)) {
        return themes.find((t) => t.id === stored) ?? defaultTheme;
      }
      const custom = getCustomThemeById(stored)
      if (custom) return custom
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return defaultTheme;
}

function normalizeFontValue(value: string): string {
  return value.toLowerCase().replace(/["']/g, '').replace(/\s+/g, '').replace(/-/g, '');
}

function getThemeDefaultFont(): FontOption {
  if (typeof document === 'undefined') {
    return fontOptions[0];
  }
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-sans')
    .trim();
  if (!computed) {
    return fontOptions[0];
  }
  const normalizedComputed = normalizeFontValue(computed);
  return (
    fontOptions.find((font) => normalizeFontValue(font.family) === normalizedComputed) ??
    fontOptions[0]
  );
}

function getStoredFont(): FontOption {
  try {
    const stored = localStorage.getItem(FONT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'id' in parsed &&
        typeof parsed.id === 'string' &&
        FONT_IDS.has(parsed.id)
      ) {
        return fontOptions.find((f) => f.id === parsed.id) ?? getThemeDefaultFont();
      }
    }
  } catch {
    // ignore
  }
  return getThemeDefaultFont();
}

function isValidAvatarPreference(value: unknown): value is AvatarPreference {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'emoji' && typeof record.value === 'string') {
    return emojiOptions.some((option) => option.value === record.value);
  }
  if (record.type === 'image' && typeof record.value === 'string') {
    return record.value.trim().length > 0;
  }
  return false;
}

const FONT_CDN_LINK_ID = 'app-font-cdn';

function loadFontCdn(font: FontOption) {
  if (typeof document === 'undefined') {
    return;
  }
  const existing = document.getElementById(FONT_CDN_LINK_ID);
  if (existing) {
    existing.remove();
  }
  if (!font.cdnUrl) {
    return;
  }
  const link = document.createElement('link');
  link.id = FONT_CDN_LINK_ID;
  link.rel = 'stylesheet';
  link.href = font.cdnUrl;
  document.head.appendChild(link);
}

function getStoredAvatar(): AvatarPreference {
  try {
    const stored = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (isValidAvatarPreference(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_AVATAR;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = getStoredTheme();
    if (typeof document !== 'undefined') {
      if (stored.id.startsWith('custom:')) {
        const scheme = loadCustomSchemes().find((s) => s.id === stored.id.slice('custom:'.length))
        if (scheme) applyCustomTheme(scheme)
        else document.documentElement.dataset.theme = stored.id
      } else {
        document.documentElement.dataset.theme = stored.id;
      }
    }
    return stored;
  });
  const [font, setFontState] = useState<FontOption>(() => {
    const stored = getStoredFont();
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--font-sans', stored.family);
      loadFontCdn(stored);
    }
    return stored;
  });
  const [avatar, setAvatarState] = useState<AvatarPreference>(() => getStoredAvatar());
  const [customSchemes, setCustomSchemesState] = useState<CustomColorScheme[]>(() =>
    typeof window !== 'undefined' ? loadCustomSchemes() : []
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme.id.startsWith('custom:')) {
        const scheme = loadCustomSchemes().find((s) => s.id === theme.id.slice('custom:'.length))
        if (scheme) {
          applyCustomTheme(scheme)
        }
      } else {
        clearCustomVars()
        document.documentElement.dataset.theme = theme.id
      }
      // 同步浏览器标签页（地址栏）颜色，确保主题切换后及时更新
      syncThemeColor()
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--font-sans', font.family);
      loadFontCdn(font);
    }
    try {
      localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ id: font.id }));
    } catch {
      // ignore
    }
  }, [font]);

  useEffect(() => {
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(avatar));
    } catch {
      // ignore
    }
  }, [avatar]);

  const setTheme = (next: Theme) => {
    if (THEME_IDS.has(next.id) || next.custom) {
      setThemeState(next);
    }
  };

  const setFont = (next: FontOption) => {
    if (FONT_IDS.has(next.id)) {
      setFontState(next);
    }
  };

  const setAvatar = (next: AvatarPreference) => {
    if (
      (next.type === 'emoji' && emojiOptions.some((option) => option.value === next.value)) ||
      (next.type === 'image' && next.value.trim().length > 0)
    ) {
      setAvatarState(next);
    }
  };

  const saveCustomScheme = (scheme: CustomColorScheme) => {
    setCustomSchemesState((prev) => {
      const exists = prev.some((s) => s.id === scheme.id)
      const next = exists ? prev.map((s) => (s.id === scheme.id ? scheme : s)) : [...prev, scheme]
      saveCustomSchemes(next)
      return next
    })
  };

  const deleteCustomScheme = (id: string) => {
    setCustomSchemesState((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveCustomSchemes(next)
      return next
    })
    if (theme.id === `custom:${id}`) {
      setThemeState(defaultTheme)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, defaultTheme.id);
      } catch {
        // ignore
      }
    }
  };

  const applyCustomScheme = (scheme: CustomColorScheme) => {
    applyCustomTheme(scheme)
    const customTheme: Theme = {
      id: `custom:${scheme.id}`,
      name: scheme.name,
      preview: scheme.primary,
      custom: true,
    }
    setThemeState(customTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, customTheme.id);
    } catch {
      // ignore
    }
  };

  const value: PreferencesContextValue = {
    theme,
    setTheme,
    font,
    setFont,
    avatar,
    setAvatar,
    resolvedTheme: theme,
    customSchemes,
    saveCustomScheme,
    deleteCustomScheme,
    applyCustomScheme,
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

// Backward-compatible alias for existing root wrappers.
export const ThemeProvider = PreferencesProvider;

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('useTheme must be used within a PreferencesProvider');
  }
  return {
    theme: context.theme,
    setTheme: context.setTheme,
    resolvedTheme: context.resolvedTheme,
  };
}
