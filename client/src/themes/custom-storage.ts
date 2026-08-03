import type { CustomColorScheme } from './types'

export const SCHEMES_STORAGE_KEY = 'app-custom-color-schemes'

export function loadCustomSchemes(): CustomColorScheme[] {
  try {
    const stored = localStorage.getItem(SCHEMES_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is CustomColorScheme =>
        s &&
        typeof s.id === 'string' &&
        typeof s.primary === 'string' &&
        typeof s.accent === 'string' &&
        typeof s.success === 'string' &&
        (s.baseMode === 'light' || s.baseMode === 'dark')
    )
  } catch {
    return []
  }
}

export function saveCustomSchemes(schemes: CustomColorScheme[]): void {
  try {
    localStorage.setItem(SCHEMES_STORAGE_KEY, JSON.stringify(schemes))
  } catch {
    // ignore
  }
}
