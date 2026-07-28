import React from 'react';

import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multi-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { ExpiryAnalysisFilters } from '@shared/api.interface';
import FilterBar from '@/components/business-ui/filter-bar';

interface ExpiryFilterBarProps {
  filters: ExpiryAnalysisFilters;
  options: {
    regions: string[];
    tiers: string[];
    dealerTypes: string[];
    businesses: string[];
    specifications: string[];
    months: string[];
  };
  onChange: (filters: ExpiryAnalysisFilters) => void;
  onReset: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

const ExpiryFilterBar: React.FC<ExpiryFilterBarProps> = ({
  filters,
  options,
  onChange,
  onReset,
  onExport,
  exportDisabled,
}) => {
  const hasFilters =
    (filters.monthFrom?.length ?? 0) > 0 ||
    (filters.monthTo?.length ?? 0) > 0 ||
    (filters.region?.length ?? 0) > 0 ||
    (filters.tier?.length ?? 0) > 0 ||
    (filters.dealerType?.length ?? 0) > 0 ||
    (filters.business?.length ?? 0) > 0 ||
    (filters.specification?.length ?? 0) > 0;

  const updateArray = (key: keyof ExpiryAnalysisFilters, value: string[]) => {
    onChange({ ...filters, [key]: value.length > 0 ? value : undefined });
  };

  return (
    <FilterBar>
      {hasFilters && (
        <div className="flex items-center justify-end mb-3">
          <Button variant="ghost" size="sm" onClick={onReset} className="h-6 px-2 text-xs">
            <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
            重置
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">年月区间</span>
          <SearchableSelect
            value={filters.monthFrom ?? ''}
            onValueChange={(v) =>
              onChange({ ...filters, monthFrom: v || undefined })
            }
            options={options.months}
            triggerClassName="h-8 w-[120px]"
          />
          <span className="text-xs text-muted-foreground">~</span>
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
          <span className="text-xs text-muted-foreground shrink-0">业务</span>
          <MultiSelect
            label="业务"
            options={options.businesses}
            value={filters.business ?? []}
            onChange={(v: string[]) => updateArray('business', v)}
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
      <div className="flex items-center justify-end mt-3">
        <Button
          variant="outline"
          onClick={onExport}
          disabled={exportDisabled}
          className="h-8 w-[120px] rounded-full px-3 text-xs font-normal gap-1.5 hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]"
        >
          <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
          导出报告
        </Button>
      </div>
    </FilterBar>
  );
};

export default ExpiryFilterBar;
