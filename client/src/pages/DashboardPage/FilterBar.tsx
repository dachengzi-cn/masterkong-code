import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { Button } from '@/components/ui/button';
import MultiSelect, { MultiSelectCombo } from '@/components/ui/multi-select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { customerApi, datasetApi, routeApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { FilterOptions, HeatmapFilterParams, DatasetSpecOptions, SheetType, RouteProfile } from '@shared/api.interface';
import { SHEET_TYPES } from '@shared/api.interface';
import {
  ALL_COMPOSITE_FORMATS,
  getCompositeFormatsForDealerTypes,
  getDealerTypesForCompositeFormats,
} from './composite-format';
import DataSourceSelector from './DataSourceSelector';
import FilterBarContainer from '@/components/business-ui/filter-bar';

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface FilterBarProps {
  datasetId?: string;
  filters: HeatmapFilterParams;
  onFiltersChange: (filters: HeatmapFilterParams) => void;
  onDownloadUnconverted?: (selectedRoutes: string[]) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (range: DateRangeValue) => void;
  onReset: () => void;
  showBrandFilter?: boolean;
  showSpecFilter?: boolean;
  showDownloadUnconverted?: boolean;
  onConfirm?: () => void;
  confirming?: boolean;
  afterAdvancedFilters?: React.ReactNode;
  rightActions?: React.ReactNode;
}

const DEFAULT_SHEET_TYPES: SheetType[] = [];

const QUICK_CUSTOM_STORAGE_KEY = 'quick_custom_combos';

interface StoredCustomCombo {
  id: string;
  name: string;
  items: string[];
  type: 'brand' | 'spec';
  createdAt: string;
}

function loadCustomCombos(): StoredCustomCombo[] {
  try {
    const raw = localStorage.getItem(QUICK_CUSTOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatRangeDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PAID_OPTIONS = ['付费', '未付费'];
const PAID_VALUE_MAP: Record<string, string> = { '付费': 'true', '未付费': 'false' };
const PAID_REVERSE_MAP: Record<string, string> = { 'true': '付费', 'false': '未付费' };

const FilterBar: React.FC<FilterBarProps> = ({
  datasetId,
  filters: rawFilters,
  onFiltersChange,
  onDownloadUnconverted,
  dateRange,
  onDateRangeChange,
  onReset,
  showBrandFilter = true,
  showSpecFilter = true,
  showDownloadUnconverted = true,
  onConfirm,
  confirming = false,
  afterAdvancedFilters,
  rightActions,
}) => {
  const filters = rawFilters || {};
  const [options, setOptions] = useState<FilterOptions>({ regions: [], tiers: [], dealerTypes: [], brands: [], salesReps: [], specifications: [] });
  const [specOptions, setSpecOptions] = useState<DatasetSpecOptions>({ brands: [], specifications: [], pairs: [] });

  // Route selection dialog state
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [customCombos, setCustomCombos] = useState<StoredCustomCombo[]>([]);

  // 高级筛选展开/收起状态
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);

  // Fixed basic route options (周一~周六)
  const BASIC_ROUTE_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六'];

  useEffect(() => {
    setCustomCombos(loadCustomCombos());
  }, []);

  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setOptions(data))
      .catch((err: unknown) => logger.error('Failed to load filter options:', err));
  }, []);

  useEffect(() => {
    if (!datasetId) return;
    const sheetTypes = filters.sheetType ?? DEFAULT_SHEET_TYPES;
    const brands = filters.brand;
    datasetApi
      .getSpecOptions(datasetId, sheetTypes, brands)
      .then((data: DatasetSpecOptions) => setSpecOptions(data))
      .catch((err: unknown) => logger.error('Failed to load spec options:', err));
  }, [datasetId, filters.sheetType?.join(','), filters.brand?.join(',')]);

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

  // 基于品牌-规格映射对，实现双向联动过滤
  // 使用 useMemo 确保 brandSpecPairs 引用稳定
  const brandSpecPairs = useMemo(() => specOptions.pairs ?? [], [specOptions.pairs]);

  // 从快捷自定义中读取品牌组合与规格组合
  const brandCombos = useMemo<MultiSelectCombo[]>(() => {
    return customCombos
      .filter((c) => c.type === 'brand')
      .map((c) => ({ label: c.name, items: c.items }));
  }, [customCombos]);

  const specCombos = useMemo<MultiSelectCombo[]>(() => {
    return customCombos
      .filter((c) => c.type === 'spec')
      .map((c) => ({ label: c.name, items: c.items }));
  }, [customCombos]);

  const filteredBrandOptions = useMemo(() => {
    const brands = specOptions.brands ?? [];
    if (!filters.specification || filters.specification.length === 0 || brandSpecPairs.length === 0) {
      return brands;
    }
    const allowedBrands = new Set(
      brandSpecPairs
        .filter((p) => filters.specification!.includes(p.specification))
        .map((p) => p.brand),
    );
    return brands.filter((b: string) => allowedBrands.has(b));
  }, [specOptions.brands, brandSpecPairs, filters.specification]);

  const filteredSpecOptions = useMemo(() => {
    const specs = specOptions.specifications ?? [];
    if (!filters.brand || filters.brand.length === 0 || brandSpecPairs.length === 0) {
      return specs;
    }
    const allowedSpecs = new Set(
      brandSpecPairs
        .filter((p) => filters.brand!.includes(p.brand))
        .map((p) => p.specification),
    );
    return specs.filter((s: string) => allowedSpecs.has(s));
  }, [specOptions.specifications, brandSpecPairs, filters.brand]);

  useEffect(() => {
    if (filters.compositeFormat && filters.compositeFormat.length > 0) {
      const valid = filters.compositeFormat.filter((cf: string) => compositeFormatOptions.includes(cf));
      if (valid.length !== filters.compositeFormat.length) {
        onFiltersChange({ ...filters, compositeFormat: valid.length > 0 ? valid : undefined });
      }
    }
  }, [compositeFormatOptions, filters.compositeFormat, onFiltersChange]);

  // 当区域变化时，级联更新人员和形态选项
  // 使用 ref 避免将 filters 完整对象加入依赖数组导致无限渲染
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    const region = filters.region;
    const regionKey = region?.join(',') ?? '';
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setOptions((prev: FilterOptions) => {
          // 只有当选项真正变化时才更新
          if (
            JSON.stringify(prev.salesReps) === JSON.stringify(data.salesReps) &&
            JSON.stringify(prev.dealerTypes) === JSON.stringify(data.dealerTypes)
          ) {
            return prev;
          }
          return { ...prev, salesReps: data.salesReps, dealerTypes: data.dealerTypes };
        });
        const currentFilters = filtersRef.current;
        const nextUpdates: Partial<HeatmapFilterParams> = {};
        if (currentFilters.salesRep && currentFilters.salesRep.length > 0) {
          const valid = currentFilters.salesRep.filter((s: string) => data.salesReps.includes(s));
          if (valid.length !== currentFilters.salesRep.length) {
            nextUpdates.salesRep = valid.length > 0 ? valid : undefined;
          }
        }
        if (currentFilters.dealerType && currentFilters.dealerType.length > 0) {
          const valid = currentFilters.dealerType.filter((d: string) => data.dealerTypes.includes(d));
          if (valid.length !== currentFilters.dealerType.length) {
            nextUpdates.dealerType = valid.length > 0 ? valid : undefined;
          }
        }
        if (Object.keys(nextUpdates).length > 0) {
          onFiltersChange({ ...currentFilters, ...nextUpdates });
        }
      })
      .catch((err: unknown) => logger.error('Failed to load cascaded filter options:', err));
  }, [filters.region, onFiltersChange]);

  // 当联动过滤后的选项变化时，清理逻辑已在 updateArrayFilter 中处理
  // 避免使用 useEffect 自动清理导致无限循环

  const updateArrayFilter = useCallback((key: keyof HeatmapFilterParams, value: string[]) => {
    const newFilters = { ...filters, [key]: value.length > 0 ? value : undefined };
    
    // 当选择品牌时，清理无效的规格
    if (key === 'brand' && filters.specification && filters.specification.length > 0) {
      const validSpecs = value.length > 0 
        ? filters.specification.filter((s: string) => {
            const allowedSpecs = new Set(
              brandSpecPairs
                .filter((p) => value.includes(p.brand))
                .map((p) => p.specification),
            );
            return allowedSpecs.has(s);
          })
        : filters.specification;
      if (validSpecs.length !== filters.specification.length) {
        newFilters.specification = validSpecs.length > 0 ? validSpecs : undefined;
      }
    }
    
    // 当选择规格时，清理无效的品牌
    if (key === 'specification' && filters.brand && filters.brand.length > 0) {
      const validBrands = value.length > 0
        ? filters.brand.filter((b: string) => {
            const allowedBrands = new Set(
              brandSpecPairs
                .filter((p) => value.includes(p.specification))
                .map((p) => p.brand),
            );
            return allowedBrands.has(b);
          })
        : filters.brand;
      if (validBrands.length !== filters.brand.length) {
        newFilters.brand = validBrands.length > 0 ? validBrands : undefined;
      }
    }
    
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange, brandSpecPairs]);

  const updatePaidFilter = useCallback((labels: string[]) => {
    const values = labels.map((l: string) => PAID_VALUE_MAP[l]).filter(Boolean);
    onFiltersChange({ ...filters, isPaid: values.length > 0 ? values : undefined });
  }, [filters, onFiltersChange]);

  const handleSheetTypeChange = useCallback((sheetTypes: SheetType[]) => {
    onFiltersChange({ ...filters, sheetType: sheetTypes.length > 0 ? sheetTypes : undefined });
  }, [filters, onFiltersChange]);

  const paidLabels = (filters.isPaid ?? []).map((v: string) => PAID_REVERSE_MAP[v]).filter(Boolean);

  const hasActiveFilters = Object.entries(filters).some(([k, v]: [string, string | string[] | undefined]) => {
    if (k === 'sheetType') return false;
    return Array.isArray(v) ? v.length > 0 : !!v;
  });

  const handleClearAll = () => {
    const sheetType = filters.sheetType;
    onFiltersChange(sheetType ? { sheetType } : {});
    onReset();
  };

  const effectiveSheetTypes = filters.sheetType ?? DEFAULT_SHEET_TYPES;

  const handleOpenRouteDialog = useCallback(() => {
    setRouteDialogOpen(true);
    setSelectedRoutes([]);
  }, []);

  const handleRouteConfirm = useCallback(() => {
    setRouteDialogOpen(false);
    onDownloadUnconverted(selectedRoutes);
  }, [selectedRoutes, onDownloadUnconverted]);

  const handleRouteCancel = useCallback(() => {
    setRouteDialogOpen(false);
    setSelectedRoutes([]);
  }, []);

  const toggleRoute = useCallback((routeName: string) => {
    setSelectedRoutes((prev: string[]) =>
      prev.includes(routeName) ? prev.filter((r: string) => r !== routeName) : [...prev, routeName],
    );
  }, []);

  const allRoutesSelected = BASIC_ROUTE_OPTIONS.length > 0 && selectedRoutes.length === BASIC_ROUTE_OPTIONS.length;
  const indeterminate = selectedRoutes.length > 0 && selectedRoutes.length < BASIC_ROUTE_OPTIONS.length;

  const handleToggleAll = useCallback(() => {
    if (allRoutesSelected) {
      setSelectedRoutes([]);
    } else {
      setSelectedRoutes([...BASIC_ROUTE_OPTIONS]);
    }
  }, [allRoutesSelected]);

  return (
    <div className="space-y-2">
      <DataSourceSelector
        value={effectiveSheetTypes}
        onChange={handleSheetTypeChange}
      />

      <FilterBarContainer>
        <div className="flex items-center gap-2 mb-3">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearAll} className="ml-auto h-6 px-2 text-xs">
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
              重置
            </Button>
          )}
        </div>

        <Collapsible open={advancedFilterOpen} onOpenChange={setAdvancedFilterOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">时间区间</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 rounded-full gap-1.5 min-w-[220px] justify-start text-left font-normal text-xs hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]">
                    <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >📅</span>
                    <span>{formatRangeDate(dateRange.from)} ~ {formatRangeDate(dateRange.to)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range: { from: Date | undefined; to: Date | undefined } | undefined) => {
                      if (range?.from) {
                        onDateRangeChange({
                          from: range.from,
                          to: range.to ?? range.from,
                        });
                      }
                    }}
                    numberOfMonths={2}
                    defaultMonth={dateRange.from}
                  />
                  <div className="flex items-center gap-1 border-t border-border px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-normal"
                      onClick={() => {
                        const now = new Date();
                        const from = new Date(now.getFullYear(), now.getMonth(), 1);
                        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        onDateRangeChange({ from, to });
                      }}
                    >
                      当月
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-normal"
                      onClick={() => {
                        const now = new Date();
                        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        const to = new Date(now.getFullYear(), now.getMonth(), 0);
                        onDateRangeChange({ from, to });
                      }}
                    >
                      上月
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-normal"
                      onClick={() => {
                        const now = new Date();
                        const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                        const to = new Date(now.getFullYear(), now.getMonth(), 0);
                        onDateRangeChange({ from, to });
                      }}
                    >
                      连续二个月
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-normal"
                      onClick={() => {
                        const now = new Date();
                        const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                        const to = new Date(now.getFullYear(), now.getMonth(), 0);
                        onDateRangeChange({ from, to });
                      }}
                    >
                      连续三个月
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-px h-5 bg-border mx-1" />

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
              <span className="text-xs text-muted-foreground shrink-0">是否付费</span>
              <MultiSelect
                label="是否付费"
                options={PAID_OPTIONS}
                value={paidLabels}
                onChange={updatePaidFilter}
                triggerClassName="h-8 w-[120px] rounded-full"
              />
            </div>

            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-8"
              >
                <span className="inline-flex items-center justify-center text-xs leading-none">
                  {advancedFilterOpen ? '▼' : '▶'}
                </span>
                高级筛选
              </Button>
            </CollapsibleTrigger>

            {onConfirm && (
              <Button
                size="sm"
                onClick={onConfirm}
                disabled={effectiveSheetTypes.length === 0 || confirming}
                className="gap-1 ml-auto"
              >
                {confirming ? (
                  <span className="inline-flex items-center justify-center text-base leading-none animate-spin">⏳</span>
                ) : (
                  <span className="inline-flex items-center justify-center text-base leading-none">✓</span>
                )}
                确认查询
              </Button>
            )}

            {showDownloadUnconverted && onDownloadUnconverted && (
              <Button
                size="sm"
                onClick={handleOpenRouteDialog}
                className="gap-1"
              >
                <span className="inline-flex items-center justify-center text-base leading-none" >⬇️</span>
                下载未成交门店
              </Button>
            )}

            {rightActions && <div className="flex items-center gap-2 ml-auto">{rightActions}</div>}
          </div>

          <CollapsibleContent>
            <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border">
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

              {showBrandFilter && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">品牌</span>
                  <MultiSelect
                    label="品牌"
                    options={filteredBrandOptions}
                    value={filters.brand ?? []}
                    onChange={(v: string[]) => updateArrayFilter('brand', v)}
                    triggerClassName="h-8 w-[120px] rounded-full"
                    combos={brandCombos}
                  />
                </div>
              )}

              {showSpecFilter && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">规格</span>
                  <MultiSelect
                    label="规格"
                    options={filteredSpecOptions}
                    value={filters.specification ?? []}
                    onChange={(v: string[]) => updateArrayFilter('specification', v)}
                    triggerClassName="h-8 w-[120px] rounded-full"
                    combos={specCombos}
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground shrink-0">形态</span>
                <MultiSelect
                  label="形态"
                  options={dealerTypeOptions}
                  value={filters.dealerType ?? []}
                  onChange={(v: string[]) => updateArrayFilter('dealerType', v)}
                  triggerClassName="h-8 w-[120px] rounded-full"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        {afterAdvancedFilters}
      </FilterBarContainer>

      {/* Route Selection Dialog */}
      <Dialog open={routeDialogOpen} onOpenChange={(open: boolean) => { if (!open) handleRouteCancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">选择线路</DialogTitle>
            <DialogDescription className="text-xs">
              请选择线路以导出所选线路未成交门店明细
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            {/* Select All */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-accent cursor-pointer transition-colors"
              onClick={handleToggleAll}
            >
              <Checkbox
                checked={allRoutesSelected ? true : indeterminate ? 'indeterminate' : false}
              />
              <span className="text-sm font-medium text-foreground">全选</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {selectedRoutes.length}/{BASIC_ROUTE_OPTIONS.length}
              </span>
            </div>
            <div className="border-t border-border my-1" />
            {/* Basic Route Options: 周一~周六 */}
            <div className="grid grid-cols-3 gap-1 px-1 py-1">
              {BASIC_ROUTE_OPTIONS.map((routeName: string) => (
                <div
                  key={routeName}
                  className={`flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer transition-colors ${
                    selectedRoutes.includes(routeName)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-accent border border-transparent'
                  }`}
                  onClick={() => toggleRoute(routeName)}
                >
                  <Checkbox checked={selectedRoutes.includes(routeName)} />
                  <span className="text-sm text-foreground">{routeName}</span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleRouteCancel}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleRouteConfirm}
              disabled={selectedRoutes.length === 0}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >✓</span>
              确定导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FilterBar;
export { SHEET_TYPES, DEFAULT_SHEET_TYPES };
