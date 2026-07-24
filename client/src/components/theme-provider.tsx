import React, { createContext, useContext, useEffect, useState } from 'react';
import { themes, defaultTheme } from '@/themes/registry';
import { fontOptions } from '@/themes/fonts';
import { emojiOptions } from '@/themes/emojis';
import type { Theme } from '@/themes/types';
import type { FontOption } from '@/themes/fonts';

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

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEME_IDS.has(stored)) {
      return themes.find((t) => t.id === stored) ?? defaultTheme;
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
      document.documentElement.dataset.theme = stored.id;
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

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme.id;
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
    if (THEME_IDS.has(next.id)) {
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

  const value: PreferencesContextValue = {
    theme,
    setTheme,
    font,
    setFont,
    avatar,
    setAvatar,
    resolvedTheme: theme,
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
