import React from 'react';

import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ExpenseOverviewFilters,
  CombinedFilterOptions,
} from './expense-overview.types';
import { hasActiveFilters } from './expense-overview.utils';
import FilterBar from '@/components/business-ui/filter-bar';

interface ExpenseFilterBarProps {
  filters: ExpenseOverviewFilters;
  options: CombinedFilterOptions;
  onChange: (filters: ExpenseOverviewFilters) => void;
  onReset: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  loading?: boolean;
}

const ExpenseFilterBar: React.FC<ExpenseFilterBarProps> = ({
  filters,
  options,
  onChange,
  onReset,
  onConfirm,
  canConfirm,
  loading = false,
}) => {
  const updateArray = (
    key: keyof ExpenseOverviewFilters,
    value: string[],
  ) => {
    onChange({ ...filters, [key]: value.length > 0 ? value : undefined });
  };

  return (
    <FilterBar>
      {hasActiveFilters(filters) && (
        <div className="flex items-center justify-end mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-6 px-2 text-xs"
          >
            <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
            重置
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">年月区间</span>
          <Select
            value={filters.monthFrom ?? ''}
            onValueChange={(v) => onChange({ ...filters, monthFrom: v || undefined })}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="选择起始月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.months.map((month) => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">~</span>
          <Select
            value={filters.monthTo ?? ''}
            onValueChange={(v) => onChange({ ...filters, monthTo: v || undefined })}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="选择结束月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.months.map((month) => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">所别</span>
          <MultiSelect
            label="所别"
            options={options.regions}
            value={filters.region ?? []}
            onChange={(v: string[]) => updateArray('region', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">阶层</span>
          <MultiSelect
            label="阶层"
            options={options.tiers}
            value={filters.tier ?? []}
            onChange={(v: string[]) => updateArray('tier', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">形态</span>
          <MultiSelect
            label="形态"
            options={options.dealerTypes}
            value={filters.dealerType ?? []}
            onChange={(v: string[]) => updateArray('dealerType', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">规格</span>
          <MultiSelect
            label="规格"
            options={options.specifications}
            value={filters.specification ?? []}
            onChange={(v: string[]) => updateArray('specification', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <Button
          size="sm"
          variant="default"
          onClick={onConfirm}
          disabled={loading}
          className="h-6 px-3 text-xs"
        >
          {loading ? '生成中…' : '确认查询'}
        </Button>
      </div>
    </FilterBar>
  );
};

export default ExpenseFilterBar;
