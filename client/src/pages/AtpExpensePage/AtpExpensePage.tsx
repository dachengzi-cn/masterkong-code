import React, { useState, useEffect, useCallback, useMemo } from 'react';

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { customerApi, datasetApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { FilterOptions, HeatmapFilterParams, AtpPerformanceResponse } from '@shared/api.interface';
import { AiAnalysisPanel } from '@/components/business-ui/ai-analysis-panel';
import {
  ALL_COMPOSITE_FORMATS,
  getCompositeFormatsForDealerTypes,
  getDealerTypesForCompositeFormats,
} from '../DashboardPage/composite-format';
import AtpPerformance from './AtpPerformance';
import FilterBar from '@/components/business-ui/filter-bar';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const formatMonthStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const monthToDateRange = (month: string): { from: string; to: string } => {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const toDate = new Date(y, m, 0);
  const to = `${month}-${String(toDate.getDate()).padStart(2, '0')}`;
  return { from, to };
};

const AtpExpensePage: React.FC = () => {
  const navigate = useNavigate();

  const now = new Date();
  const currentMonth = formatMonthStr(now);

  const [startMonth, setStartMonth] = useState<string>(currentMonth);
  const [endMonth, setEndMonth] = useState<string>(currentMonth);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [filters, setFilters] = useState<HeatmapFilterParams>({ tier: ['一阶'] });
  const [confirmedStartMonth, setConfirmedStartMonth] = useState<string>('');
  const [confirmedEndMonth, setConfirmedEndMonth] = useState<string>('');
  const [confirmedFilters, setConfirmedFilters] = useState<HeatmapFilterParams>({});
  const [filterReady, setFilterReady] = useState(false);
  const [hasConfirmedOnce, setHasConfirmedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasAtpData, setHasAtpData] = useState(false);
  const [atpData, setAtpData] = useState<AtpPerformanceResponse | null>(null);
  const [options, setOptions] = useState<FilterOptions>({
    regions: [],
    tiers: [],
    dealerTypes: [],
    brands: [],
    salesReps: [],
    specifications: [],
  });


  // Route selection dialog state (for future ATP export)
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);

  // Load filter options from customer profile API
  useEffect(() => {
    customerApi
      .getFilterOptions()
      .then((data: FilterOptions) => setOptions(data))
      .catch((err: unknown) => logger.error('Failed to load ATP filter options:', err));
  }, []);

  // Cascading update: region -> salesReps + dealerTypes
  useEffect(() => {
    const region = filters.region;
    customerApi
      .getFilterOptions(region)
      .then((data: FilterOptions) => {
        setOptions((prev: FilterOptions) => ({
          ...prev,
          salesReps: data.salesReps,
          dealerTypes: data.dealerTypes,
        }));
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
          setFilters((prev: HeatmapFilterParams) => ({ ...prev, ...nextUpdates }));
        }
      })
      .catch((err: unknown) => logger.error('Failed to load cascaded ATP filter options:', err));
  }, [filters.region?.join(',')]);

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
      const valid = filters.compositeFormat.filter((cf: string) =>
        compositeFormatOptions.includes(cf),
      );
      if (valid.length !== filters.compositeFormat.length) {
        setFilters((prev: HeatmapFilterParams) => ({
          ...prev,
          compositeFormat: valid.length > 0 ? valid : undefined,
        }));
      }
    }
  }, [compositeFormatOptions]);

  const updateArrayFilter = useCallback(
    (key: keyof HeatmapFilterParams, value: string[]) => {
      setFilters((prev: HeatmapFilterParams) => ({
        ...prev,
        [key]: value.length > 0 ? value : undefined,
      }));
    },
    [],
  );

  const hasActiveFilters = Object.values(filters).some(
    (v: string | string[] | undefined) => (Array.isArray(v) ? v.length > 0 : !!v),
  );

  const handleClearAll = () => {
    setFilters({});
    setStartMonth(currentMonth);
    setEndMonth(currentMonth);
  };

  const canConfirm = useMemo(
    () => !!startMonth && !!endMonth,
    [startMonth, endMonth],
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) {
      toast.warning('请先配置完整的筛选条件（年月区间）后再确认查询');
      return;
    }
    setConfirmedStartMonth(startMonth);
    setConfirmedEndMonth(endMonth);
    setConfirmedFilters({ ...filters });
    setFilterReady(true);
    setHasConfirmedOnce(true);
  }, [canConfirm, startMonth, endMonth, filters]);

  const handleReset = useCallback(() => {
    setFilters({});
    setStartMonth(currentMonth);
    setEndMonth(currentMonth);
    setConfirmedStartMonth(currentMonth);
    setConfirmedEndMonth(currentMonth);
    setConfirmedFilters({});
    setFilterReady(true);
    setHasConfirmedOnce(true);
  }, [currentMonth]);

  const defaultMonthOptions = useMemo(() => {
    const options: string[] = [];
    const current = new Date();
    for (let i = 12; i >= 0; i--) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      options.push(formatMonthStr(d));
    }
    return options;
  }, []);

  useEffect(() => {
    datasetApi
      .getAtpAvailableMonths()
      .then((res) => {
        const months = res.months ?? [];
        setAvailableMonths(months);
        if (months.length > 0) {
          if (months.includes(currentMonth)) {
            setStartMonth(currentMonth);
            setEndMonth(currentMonth);
          } else {
            const fallback = months[months.length - 1];
            setStartMonth(fallback);
            setEndMonth(fallback);
          }
        }
      })
      .catch((err: unknown) => logger.error('Failed to load ATP months:', err));
  }, [currentMonth]);

  const monthOptions = availableMonths.length > 0 ? availableMonths : defaultMonthOptions;

  const dateRange = useMemo(() => {
    const start = monthToDateRange(startMonth).from;
    const end = monthToDateRange(endMonth).to;
    return { from: start, to: end };
  }, [startMonth, endMonth]);

  const confirmedDateRange = useMemo(() => {
    const start = monthToDateRange(confirmedStartMonth || startMonth).from;
    const end = monthToDateRange(confirmedEndMonth || endMonth).to;
    return { from: start, to: end };
  }, [confirmedStartMonth, confirmedEndMonth, startMonth, endMonth]);

  // Route dialog handlers (placeholder for future ATP export functionality)
  const handleOpenRouteDialog = useCallback(() => {
    setRouteDialogOpen(true);
    setSelectedRoutes([]);
  }, []);

  const handleRouteConfirm = useCallback(() => {
    setRouteDialogOpen(false);
    toast.info('ATP费用分析模块开发中，敬请期待');
  }, []);

  // 为 AI 分析准备输入数据
  const aiInputData = useMemo(() => {
    if (!atpData) return { filters } as Record<string, unknown>;
    return {
      filters,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      summary: {
        totalRows: atpData.rows.length,
      },
      rows: atpData.rows.slice(0, 50).map((r) => ({
        region: r.region,
        tier: r.tier,
        salesRep: r.salesRep,
        totalPoints: r.totalPoints,
        paidPoints: r.paidPoints,
        paidAmount: r.paidAmount,
        totalStoreSales: r.totalStoreSales,
        paidStoreSales: r.paidStoreSales,
        paidPointFeeRatio: r.paidPointFeeRatio,
        paidPointSalesRatio: r.paidPointSalesRatio,
        feeRatioLe10: r.feeRatioLe10,
        feeRatio10to15: r.feeRatio10to15,
        feeRatioGt15: r.feeRatioGt15,
        feeRatioNoDeal: r.feeRatioNoDeal,
        salesLt1000Count: r.salesLt1000Count,
        salesLt2000Count: r.salesLt2000Count,
      })),
    };
  }, [atpData, filters, dateRange.from, dateRange.to]);

  const handleRouteCancel = useCallback(() => {
    setRouteDialogOpen(false);
    setSelectedRoutes([]);
  }, []);

  const toggleRoute = useCallback((routeName: string) => {
    setSelectedRoutes((prev: string[]) =>
      prev.includes(routeName) ? prev.filter((r: string) => r !== routeName) : [...prev, routeName],
    );
  }, []);

  const BASIC_ROUTE_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六'];
  const allRoutesSelected =
    BASIC_ROUTE_OPTIONS.length > 0 && selectedRoutes.length === BASIC_ROUTE_OPTIONS.length;
  const indeterminate = selectedRoutes.length > 0 && selectedRoutes.length < BASIC_ROUTE_OPTIONS.length;

  const handleToggleAll = useCallback(() => {
    if (allRoutesSelected) {
      setSelectedRoutes([]);
    } else {
      setSelectedRoutes([...BASIC_ROUTE_OPTIONS]);
    }
  }, [allRoutesSelected]);

  if (!hasConfirmedOnce && !loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-foreground">ATP费用分析</h1>
        </div>

        <FilterBar>
          <div className="flex items-center gap-2 mb-3">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="ml-auto h-6 px-2 text-xs"
              >
                <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
                重置
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">年月区间</span>
              <Select
                value={startMonth}
                onValueChange={(v) => {
                  setStartMonth(v);
                  if (v > endMonth) setEndMonth(v);
                }}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="选择起始月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">~</span>
              <Select
                value={endMonth}
                onValueChange={(v) => {
                  setEndMonth(v);
                  if (v < startMonth) setStartMonth(v);
                }}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="选择结束月份" />
                </SelectTrigger>
                <SelectContent>
                <SelectGroup>
                  {monthOptions.map((month) => (
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
        <div className="flex items-center justify-end mt-3 gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleConfirm}
            disabled={loading}
            className="h-6 px-3 text-xs"
          >
            {loading ? '生成中…' : '确认查询'}
          </Button>
          <AiAnalysisPanel
            pageScope="expense/atp"
            inputData={aiInputData}
            defaultQuestion="请分析当前ATP费用绩效数据，识别费比分布、业代绩效差异与优化机会。"
            disabled={!atpData || atpData.rows.length === 0}
            size="sm"
          />
        </div>
      </FilterBar>

        <div className="flex items-center justify-center min-h-[40vh]">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🔍</EmptyMedia>
              <EmptyTitle>尚未生成分析结果</EmptyTitle>
              <EmptyDescription>请完成筛选条件配置后，点击「确认查询」生成ATP费用分析数据</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      {/* Filter Bar - matches system design pattern from Dashboard */}
      <FilterBar>
        <div className="flex items-center gap-2 mb-3">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="ml-auto h-6 px-2 text-xs"
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >❌</span>
              重置
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">年月区间</span>
            <Select
              value={startMonth}
              onValueChange={(v) => {
                setStartMonth(v);
                if (v > endMonth) setEndMonth(v);
              }}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="选择起始月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {monthOptions.map((month) => (
                    <SelectItem key={month} value={month}>{month}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">~</span>
            <Select
              value={endMonth}
              onValueChange={(v) => {
                setEndMonth(v);
                if (v < startMonth) setStartMonth(v);
              }}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="选择结束月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {monthOptions.map((month) => (
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
        <div className="flex items-center justify-end mt-3 gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleConfirm}
            disabled={loading}
            className="h-6 px-3 text-xs"
          >
            {loading ? '生成中…' : '确认查询'}
          </Button>
          <AiAnalysisPanel
            pageScope="expense/atp"
            inputData={aiInputData}
            defaultQuestion="请分析当前ATP费用绩效数据，识别费比分布、业代绩效差异与优化机会。"
            disabled={!atpData || atpData.rows.length === 0}
            size="sm"
          />
        </div>
      </FilterBar>

      {/* ATP Performance module - Phase 1: basic framework */}
      <AtpPerformance
        filters={confirmedFilters}
        dateFrom={confirmedDateRange.from}
        dateTo={confirmedDateRange.to}
        filterReady={filterReady}
        onHasDataChange={setHasAtpData}
        onDataChange={setAtpData}
        onLoadingChange={setLoading}
      />

      {/* Route Selection Dialog (kept for future use) */}
      <Dialog
        open={routeDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) handleRouteCancel();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">选择线路</DialogTitle>
            <DialogDescription className="text-xs">
              请选择线路以导出所选线路未成交门店明细
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
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
            <Button size="sm" onClick={handleRouteConfirm} disabled={selectedRoutes.length === 0}>
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >✓</span>
              确定导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtpExpensePage;
