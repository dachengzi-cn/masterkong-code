import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type KpiVariant = 'primary' | 'success' | 'error' | 'warning' | 'neutral';

export interface KpiCardProps {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  subText?: React.ReactNode;
  variant?: KpiVariant;
  loading?: boolean;
  className?: string;
  /** 传入后卡片可点击（用于数据下钻） */
  onClick?: () => void;
  /** 可点击卡片的无障碍描述 */
  ariaLabel?: string;
  /** 启用 Uiverse 通知卡片风格 hover 动效（仅视觉，不影响尺寸/形状/位置） */
  hoverEffect?: boolean;
  /** 自定义 hover 光晕颜色（覆盖变体默认色，如 'hsl(217,85%,52%)'） */
  glowColor?: string;
  /** 自定义左侧竖线颜色（覆盖变体默认色，如 'bg-[hsl(217,85%,52%)]'） */
  lineColor?: string;
}

const lineColorClass: Record<KpiVariant, string> = {
  primary: 'bg-[hsl(217,85%,52%)]',
  success: 'bg-[hsl(152,60%,42%)]',
  error: 'bg-[hsl(4,72%,52%)]',
  warning: 'bg-[hsl(38,85%,48%)]',
  neutral: 'bg-[hsl(220,15%,88%)]',
};

/** hover 光晕颜色：沿用各变体的强调色（浅色主题下白色光晕不可见） */
const defaultGlowColor: Record<KpiVariant, string> = {
  primary: 'hsl(217,85%,52%)',
  success: 'hsl(152,60%,42%)',
  error: 'hsl(4,72%,52%)',
  warning: 'hsl(38,85%,48%)',
  neutral: 'hsl(220,15%,88%)',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  icon,
  label,
  value,
  subText,
  variant = 'primary',
  loading = false,
  className,
  onClick,
  ariaLabel,
  hoverEffect = false,
  glowColor,
  lineColor,
}) => {
  const clickable = typeof onClick === 'function';

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? (ariaLabel ?? label) : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={
        hoverEffect
          ? ({ '--kpi-glow': glowColor ?? defaultGlowColor[variant] } as React.CSSProperties)
          : undefined
      }
      className={cn(
        'bg-card border border-border rounded-sm p-4 relative overflow-hidden',
        hoverEffect && 'kpi-hover-effect',
        clickable &&
          'cursor-pointer transition-colors duration-150 ease-out hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2',
        className,
      )}
    >
      {/* Uiverse 动效装饰层：绝对定位 + pointer-events-none，不占文档流、不改变几何属性 */}
      {hoverEffect ? (
        <>
          <div className="kpi-hover-border-glow" aria-hidden="true" />
          <div className="kpi-hover-glow" aria-hidden="true" />
        </>
      ) : null}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-0.5',
          hoverEffect && 'kpi-hover-line',
          lineColor ?? lineColorClass[variant],
        )}
      />
      <div
        className={cn(
          'text-xs text-muted-foreground mb-2 flex items-center gap-1',
          hoverEffect && 'kpi-hover-title',
        )}
      >
        {icon ? (
          <span className="inline-flex items-center justify-center text-base leading-none">
            {icon}
          </span>
        ) : null}
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28 mb-1" />
      ) : (
        <div
          className={cn(
            'text-xl font-medium font-[\'Roboto_Mono\',monospace] tabular-nums truncate',
            hoverEffect && 'kpi-hover-value',
          )}
        >
          {value}
        </div>
      )}
      {subText ? (
        <div
          className={cn(
            'text-xs text-muted-foreground mt-1',
            hoverEffect && 'kpi-hover-sub',
          )}
        >
          {subText}
        </div>
      ) : null}
    </div>
  );
};

export default KpiCard;
