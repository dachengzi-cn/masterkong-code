import React from 'react';
import { cn } from '@/lib/utils';
import { formatUsageRate, getUsageStatus } from './expense-estimate.utils';

/**
 * 使用率线性仪表 —— 费用预估模块的识别签名。
 * 以极细线性进度条直观呈现「预估使用状况」：
 * - 无预估金额：灰色空槽 + 占位文案
 * - 使用中（<100%）：品牌蓝填充
 * - 超支（≥100%）：错误红满槽 + 「超支」标签
 * 颜色与文字（百分比/标签）双重编码，符合可及性要求。
 */
interface UsageBarProps {
  /** 使用率百分比；-1 表示无预估金额 */
  rate: number;
  /** 是否展示百分比文字（表格列内默认展示） */
  showText?: boolean;
  /** 是否展示「超支」标签 */
  showTag?: boolean;
  className?: string;
}

const UsageBar: React.FC<UsageBarProps> = ({
  rate,
  showText = true,
  showTag = true,
  className,
}) => {
  const status = getUsageStatus(rate);
  const pct = status === 'empty' ? 0 : Math.min(100, rate);

  const fillClass =
    status === 'empty'
      ? 'bg-[hsl(220,15%,88%)]'
      : status === 'over'
        ? 'bg-[hsl(4,72%,52%)]'
        : 'bg-[hsl(217,85%,52%)]';

  const textClass =
    status === 'empty'
      ? 'text-muted-foreground'
      : status === 'over'
        ? 'text-[hsl(4,72%,52%)] font-medium'
        : 'text-foreground';

  return (
    <div className={cn('flex items-center gap-2 min-w-[120px]', className)}>
      <div
        className="relative h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status === 'empty' ? 0 : Math.min(100, Math.round(rate))}
        aria-label="费用预估使用率"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-out', fillClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showText && (
        <span className={cn('text-xs font-mono tabular-nums shrink-0', textClass)}>
          {formatUsageRate(rate)}
        </span>
      )}
      {showTag && status === 'over' && (
        <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] leading-4 font-medium text-[hsl(4,72%,52%)] border border-[hsl(4,72%,52%)]/40 bg-[hsl(4,72%,52%)]/10">
          超支
        </span>
      )}
      {showTag && status === 'empty' && (
        <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] leading-4 text-muted-foreground border border-border bg-muted/40">
          未设预估
        </span>
      )}
    </div>
  );
};

export default UsageBar;
