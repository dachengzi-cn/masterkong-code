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
}

const lineColorClass: Record<KpiVariant, string> = {
  primary: 'bg-[hsl(217,85%,52%)]',
  success: 'bg-[hsl(152,60%,42%)]',
  error: 'bg-[hsl(4,72%,52%)]',
  warning: 'bg-[hsl(38,85%,48%)]',
  neutral: 'bg-[hsl(220,15%,88%)]',
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
      className={cn(
        'bg-card border border-border rounded-sm p-4 relative overflow-hidden',
        clickable &&
          'cursor-pointer transition-colors duration-150 ease-out hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2',
        className,
      )}
    >
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-0.5',
          lineColorClass[variant],
        )}
      />
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
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
        <div className="text-xl font-medium font-['Roboto_Mono',monospace] tabular-nums truncate">
          {value}
        </div>
      )}
      {subText ? (
        <div className="text-xs text-muted-foreground mt-1">{subText}</div>
      ) : null}
    </div>
  );
};

export default KpiCard;
