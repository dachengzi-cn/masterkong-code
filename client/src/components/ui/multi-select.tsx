import React, { useState, useCallback } from 'react';
import { ChevronDown, X, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MultiSelectCombo {
  label: string;
  items: string[];
}

interface MultiSelectProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  triggerClassName?: string;
  /** 置顶显示的自定义组合项；点击后直接应用该组合的 items */
  combos?: MultiSelectCombo[];
  /** 选择组合时是否追加到现有选中值；默认为 false（替换） */
  comboAppend?: boolean;
  /** 是否允许创建自定义选项 */
  allowCreate?: boolean;
  /** 创建自定义选项时的回调 */
  onCreateOption?: (option: string) => void;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  value,
  onChange,
  className,
  triggerClassName,
  combos,
  comboAppend = false,
  allowCreate = false,
  onCreateOption,
}) => {
  const [open, setOpen] = useState(false);
  const [createInput, setCreateInput] = useState('');

  const handleToggle = useCallback((option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v: string) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }, [value, onChange]);

  const handleComboClick = useCallback((combo: MultiSelectCombo) => {
    if (comboAppend) {
      const merged = Array.from(new Set([...value, ...combo.items]));
      onChange(merged);
    } else {
      onChange([...combo.items]);
    }
    setOpen(false);
  }, [value, onChange, comboAppend]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  }, [onChange]);

  const handleCreate = useCallback(() => {
    const trimmed = createInput.trim();
    if (!trimmed) return;
    if (options.includes(trimmed) || value.includes(trimmed)) {
      if (!value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setCreateInput('');
      return;
    }
    onCreateOption?.(trimmed);
    onChange([...value, trimmed]);
    setCreateInput('');
  }, [createInput, options, value, onChange, onCreateOption]);

  const displayText = value.length === 0
    ? '全部'
    : value.length === 1
      ? value[0]
      : `${value.length}项`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-input flex items-center justify-between gap-2 rounded-full border bg-transparent px-3 py-2 whitespace-nowrap transition-[color,box-shadow] outline-none',
            'hover:border-ring focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[3px]',
            'h-7 text-xs',
            open && 'border-ring ring-ring/20 ring-[3px]',
            triggerClassName,
          )}
        >
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
            {displayText}
          </span>
          <div className="flex items-center gap-0.5">
            {value.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent);
                }}
                className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
              >
                <X className="size-3" />
              </span>
            )}
            <ChevronDown className={cn('size-3 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-[200px] rounded-lg p-0', className)}
      >
        <div className="max-h-[280px] overflow-y-auto py-1">
          {combos && combos.length > 0 && (
            <div className="pb-1 mb-1 border-b border-border">
              {combos.map((combo) => (
                <div
                  key={combo.label}
                  role="option"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer',
                    'hover:bg-accent hover:text-accent-foreground',
                  )}
                  onClick={() => handleComboClick(combo)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{combo.label}</span>
                    <span className="text-[10px] text-muted-foreground">组合</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {combo.items.slice(0, 3).map((item) => (
                      <span
                        key={item}
                        className="inline-block rounded-sm bg-muted px-1 py-0 text-[10px] text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                    {combo.items.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{combo.items.length - 3}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">暂无选项</div>
          ) : (
            options.map((option: string) => {
              const checked = value.includes(option);
              return (
                <div
                  key={option}
                  role="option"
                  aria-selected={checked}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer',
                    'hover:bg-accent hover:text-accent-foreground',
                    checked && 'bg-accent/50',
                  )}
                  onClick={() => handleToggle(option)}
                >
                  <Checkbox checked={checked} className="size-3.5" />
                  <span className="truncate">{option}</span>
                </div>
              );
            })
          )}
          {allowCreate && (
            <div className="border-t border-border p-2 space-y-1.5">
              <div className="text-[10px] text-muted-foreground">自定义选项</div>
              <div className="flex items-center gap-1">
                <Input
                  value={createInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateInput(e.target.value)}
                  placeholder={`新增${label}`}
                  className="h-7 text-xs px-2 py-1"
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleCreate();
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelect;
