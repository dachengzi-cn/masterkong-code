import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multi-select';
import { customerApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { FilterOptions, HeatmapFilterParams } from '@shared/api.interface';
import {
  ALL_COMPOSITE_FORMATS,
  getCompositeFormatsForDealerTypes,
  getDealerTypesForCompositeFormats,
} from './composite-format';
import FilterBar from '@/components/business-ui/filter-bar';

interface DashboardFilterBarProps {
  datasetName: string;
  filters: HeatmapFilterParams;
  onFiltersChange: (filters: HeatmapFilterParams) => void;
}

const PAID_OPTIONS = ['付费', '未付费'];
const PAID_VALUE_MAP: Record<string, string> = { '付费': 'true', '未付费': 'false' };
const PAID_REVERSE_MAP: Record<string, string> = { 'true': '付费', 'false': '未付费' };

const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({ datasetName, filters: rawFilters, onFiltersChange }) => {
  const filters = rawFilters || {};
  const navigate = useNavigate();
  const [options, setOptions] = useState<FilterOptions>({ regions: [], tiers: [], dealerTypes: [], brands: [], salesReps: [], specifications: [] });
  const [keyword, setKeyword] = useState((rawFilters || {}).customerKeyword || '');

  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setOptions(data))
      .catch((err: unknown) => logger.error('Failed to load filter options:', err));
  }, []);

  const compositeFormatOptions = useMemo(() => {
    if (filters.dealerType && filters.dealerType.length > 0) {
      return getCompositeFormatsForDealerTypes(filters.dealerType);
    }
    return ALL_COMPOSITE_FORMATS;
  }, [filters.dealerType]);

  const dealerTypeOptions = useMemo(() => {
    if (filters.compositeFormat && filters.compositeFormat.length > 0) {
      const mapped = getDealerTypesForCompositeFormats(filters.compositeFormat);
      return options.dealerTypes.filter((d: string) => mapped.includes(d));
    }
    return options.dealerTypes;
  }, [options.dealerTypes, filters.compositeFormat]);

  useEffect(() => {
    if (filters.compositeFormat && filters.compositeFormat.length > 0) {
      const valid = filters.compositeFormat.filter((cf: string) => compositeFormatOptions.includes(cf));
      if (valid.length !== filters.compositeFormat.length) {
        onFiltersChange({ ...filters, compositeFormat: valid.length > 0 ? valid : undefined });
      }
    }
  }, [compositeFormatOptions]);

  useEffect(() => {
    const region = filters.region;
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setOptions((prev: FilterOptions) => ({ ...prev, salesReps: data.salesReps, dealerTypes: data.dealerTypes }));
        const nextUpdates: Partial<HeatmapFilterParams> = {};
        if (filters.salesRep && filters.salesRep.length > 0) {
          const valid = filters.salesRep.filter((s: string) => data.salesReps.includes(s));
          if (valid.length !== filters.salesRep.length) {
            nextUpdates.salesRep = valid.length > 0 ? valid : undefined;
          }
        }
        if (filters.dealerType && filters.dealerType.length > 0) {
          const valid = filters.dealerType.filter((d: string) => data.dealerTypes.includes(d));
          if (valid.length !== filters.dealerType.length) {
            nextUpdates.dealerType = valid.length > 0 ? valid : undefined;
          }
        }
        if (Object.keys(nextUpdates).length > 0) {
          onFiltersChange({ ...filters, ...nextUpdates });
        }
      })
      .catch((err: unknown) => logger.error('Failed to load cascaded filter options:', err));
  }, [filters.region?.join(',')]);

  const updateArrayFilter = useCallback((key: keyof HeatmapFilterParams, value: string[]) => {
    onFiltersChange({ ...filters, [key]: value.length > 0 ? value : undefined });
  }, [filters, onFiltersChange]);

  const updatePaidFilter = useCallback((labels: string[]) => {
    const values = labels.map((l: string) => PAID_VALUE_MAP[l]).filter(Boolean);
    onFiltersChange({ ...filters, isPaid: values.length > 0 ? values : undefined });
  }, [filters, onFiltersChange]);

  const paidLabels = (filters.isPaid ?? []).map((v: string) => PAID_REVERSE_MAP[v]).filter(Boolean);

  const handleKeywordSubmit = () => {
    onFiltersChange({ ...filters, customerKeyword: keyword.trim() || undefined });
  };

  const handleKeywordClear = () => {
    setKeyword('');
    onFiltersChange({ ...filters, customerKeyword: undefined });
  };

  const hasActiveFilters = Object.values(filters).some((v: string | string[] | undefined) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  );

  const handleClearAll = () => {
    setKeyword('');
    onFiltersChange({});
  };

  return (
    <FilterBar>
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          数据集
        </button>
        <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground shrink-0" >▶</span>
        <span className="text-xs font-medium truncate text-foreground">{datasetName}</span>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearAll} className="ml-auto h-6 px-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
            清除筛选
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">所别</span>
          <MultiSelect
            label="所别"
            options={options.regions}
            value={filters.region ?? []}
            onChange={(v: string[]) => updateArrayFilter('region', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">阶层</span>
          <MultiSelect
            label="阶层"
            options={options.tiers}
            value={filters.tier ?? []}
            onChange={(v: string[]) => updateArrayFilter('tier', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">复合形态</span>
          <MultiSelect
            label="复合形态"
            options={compositeFormatOptions}
            value={filters.compositeFormat ?? []}
            onChange={(v: string[]) => updateArrayFilter('compositeFormat', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">简类型</span>
          <MultiSelect
            label="简类型"
            options={dealerTypeOptions}
            value={filters.dealerType ?? []}
            onChange={(v: string[]) => updateArrayFilter('dealerType', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">是否付费</span>
          <MultiSelect
            label="是否付费"
            options={PAID_OPTIONS}
            value={paidLabels}
            onChange={updatePaidFilter}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">客户</span>
          <div className="relative">
            <span className="inline-flex items-center justify-center text-base leading-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" >🔍</span>
            <input
              type="text"
              value={keyword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') handleKeywordSubmit();
              }}
              placeholder="搜索客户名称/编码"
              className="h-7 w-[160px] rounded-md border border-input bg-transparent pl-7 pr-6 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {keyword && (
              <button
                type="button"
                onClick={handleKeywordClear}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <span className="inline-flex items-center justify-center text-base leading-none" >❌</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">人员</span>
          <MultiSelect
            label="人员"
            options={options.salesReps}
            value={filters.salesRep ?? []}
            onChange={(v: string[]) => updateArrayFilter('salesRep', v)}
            triggerClassName="h-8 w-[120px] rounded-full"
          />
        </div>
      </div>
    </FilterBar>
  );
};

export default DashboardFilterBar;
