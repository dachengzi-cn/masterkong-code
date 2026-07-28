import React from 'react';

import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multi-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  onExport: () => void;
  onConfirm: () => void;
  exportDisabled: boolean;
  canConfirm: boolean;
}

const ExpenseFilterBar: React.FC<ExpenseFilterBarProps> = ({
  filters,
  options,
  onChange,
  onReset,
  onExport,
  onConfirm,
  exportDisabled,
  canConfirm,
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
          <span className="text-xs text-muted-foreground shrink-0">月份起</span>
          <SearchableSelect
            value={filters.monthFrom ?? ''}
            onValueChange={(v) =>
              onChange({ ...filters, monthFrom: v || undefined })
            }
            options={options.months}
            triggerClassName="h-8 w-[120px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">月份止</span>
          <SearchableSelect
            value={filters.monthTo ?? ''}
            onValueChange={(v) =>
              onChange({ ...filters, monthTo: v || undefined })
            }
            options={options.months}
            triggerClassName="h-8 w-[120px]"
          />
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

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">
            业务（临期）
          </span>
          <MultiSelect
            label="业务"
            options={options.businesses}
            value={filters.business ?? []}
            onChange={(v: string[]) => updateArray('business', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">
            业代（ATP）
          </span>
          <MultiSelect
            label="业代"
            options={options.salesReps}
            value={filters.salesRep ?? []}
            onChange={(v: string[]) => updateArray('salesRep', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">
            综合业态（ATP）
          </span>
          <MultiSelect
            label="综合业态"
            options={options.compositeFormats}
            value={filters.compositeFormat ?? []}
            onChange={(v: string[]) => updateArray('compositeFormat', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <Button
          size="sm"
          variant="default"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="h-6 px-3 text-xs"
        >
          确认筛选
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onExport}
          disabled={exportDisabled}
          className="h-6 px-2 text-xs gap-1"
        >
          <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
          导出报告
        </Button>
      </div>
    </FilterBar>
  );
};

export default ExpenseFilterBar;
