export type BaseMode = 'light' | 'dark'

export interface ColorPick {
  primary: string
  accent: string
  success: string
}

export interface CustomColorScheme {
  id: string
  name: string
  primary: string
  accent: string
  success: string
  baseMode: BaseMode
  createdAt: number
}

export interface Theme {
  id: string
  name: string
  preview: string
  custom?: boolean
}
