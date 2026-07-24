import React, { useCallback } from 'react';

import { cn } from '@/lib/utils';
import type { SheetType } from '@shared/api.interface';

interface DataSourceSelectorProps {
  value: SheetType[];
  onChange: (value: SheetType[]) => void;
}

const TIER1_OPTIONS: SheetType[] = ['一阶订单', '一阶回单'];
const TIER2_OPTIONS: SheetType[] = ['二阶订单', '二阶回单'];

const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({ value, onChange }) => {
  const selectedTier1 = TIER1_OPTIONS.find((o: SheetType) => value.includes(o));
  const selectedTier2 = TIER2_OPTIONS.find((o: SheetType) => value.includes(o));

  const handleSelect = useCallback((option: SheetType) => {
    const pair = TIER1_OPTIONS.includes(option) ? TIER1_OPTIONS : TIER2_OPTIONS;
    const currentSelected = pair.find((o: SheetType) => value.includes(o));
    
    if (currentSelected === option) {
      // 取消选择当前选项 - 同组变为未选择状态
      onChange(value.filter((v: SheetType) => v !== option));
    } else if (currentSelected) {
      // 切换选择：用新选项替换同组旧选项
      onChange(value.map((v: SheetType) => v === currentSelected ? option : v));
    } else {
      // 同组未选择，添加当前选项
      onChange([...value, option]);
    }
  }, [value, onChange]);

  const renderOption = (option: SheetType) => {
    const pair = TIER1_OPTIONS.includes(option) ? TIER1_OPTIONS : TIER2_OPTIONS;
    const selectedInPair = pair.find((o: SheetType) => value.includes(o));
    const isSelected = value.includes(option);
    const isOtherSelected = selectedInPair && selectedInPair !== option;

    return (
      <button
        key={option}
        type="button"
        onClick={() => handleSelect(option)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs select-none transition-colors',
          isSelected
            ? 'border-primary bg-primary/10 text-primary font-medium'
            : isOtherSelected
              ? 'border-border bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
              : 'border-border bg-card text-foreground hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]',
        )}
        disabled={isOtherSelected}
      >
        <span
          className={cn(
            'flex size-3.5 items-center justify-center rounded-sm border transition-colors',
            isSelected
              ? 'border-primary bg-primary'
              : isOtherSelected
                ? 'border-muted-foreground/20 bg-muted/20'
                : 'border-border',
          )}
        >
          {isSelected && (
            <svg viewBox="0 0 12 12" className="size-2.5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
        </span>
        {option}
        {isOtherSelected && (
          <span className="ml-0.5 text-[10px] text-muted-foreground/40">已选其他</span>
        )}
      </button>
    );
  };

  return (
    <div className="bg-card border border-border rounded-sm p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center text-base leading-none text-primary" >🗄️</span>
        <span className="text-xs font-medium text-foreground">数据源</span>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center justify-center text-base leading-none" >⚠️</span>
          <span>一阶/二阶各选其一</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">一阶</span>
          {TIER1_OPTIONS.map(renderOption)}
          {selectedTier1 && (
            <span className="text-[10px] text-muted-foreground/60 ml-0.5">已选：{selectedTier1}</span>
          )}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">二阶</span>
          {TIER2_OPTIONS.map(renderOption)}
          {selectedTier2 && (
            <span className="text-[10px] text-muted-foreground/60 ml-0.5">已选：{selectedTier2}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataSourceSelector;
