export type ThemeToken =
  | '--background'
  | '--foreground'
  | '--card'
  | '--card-foreground'
  | '--popover'
  | '--popover-foreground'
  | '--primary'
  | '--primary-foreground'
  | '--secondary'
  | '--secondary-foreground'
  | '--muted'
  | '--muted-foreground'
  | '--accent'
  | '--accent-foreground'
  | '--info'
  | '--info-foreground'
  | '--destructive'
  | '--destructive-foreground'
  | '--success'
  | '--success-foreground'
  | '--warning'
  | '--warning-foreground'
  | '--border'
  | '--input'
  | '--ring'
  | '--sidebar'
  | '--sidebar-foreground'
  | '--sidebar-primary'
  | '--sidebar-primary-foreground'
  | '--sidebar-accent'
  | '--sidebar-accent-foreground'
  | '--sidebar-border'
  | '--sidebar-ring'
  | '--font-sans'
  | '--font-mono'
  | '--radius';

export type ThemeTokens = Partial<Record<ThemeToken, string>>;

export interface Theme {
  id: string;
  name: string;
  preview: string;
}
