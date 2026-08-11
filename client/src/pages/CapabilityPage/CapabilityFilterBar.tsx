import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FilterBar from '@/components/business-ui/filter-bar';
import type {
  CapabilityCompareType,
  CapabilityLevel,
  CapabilityOptions,
} from '@shared/api.interface';

export interface CapabilityFilters {
  level: CapabilityLevel;
  region: string;
  salesRep: string;
  monthFrom: string;
  monthTo: string;
  compareType: CapabilityCompareType;
}

interface CapabilityFilterBarProps {
  filters: CapabilityFilters;
  options: CapabilityOptions;
  onChange: (filters: CapabilityFilters) => void;
  onReset: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  loading?: boolean;
}

const CapabilityFilterBar: React.FC<CapabilityFilterBarProps> = ({
  filters,
  options,
  onChange,
  onReset,
  onConfirm,
  canConfirm,
  loading = false,
}) => {
  const update = (patch: Partial<CapabilityFilters>) =>
    onChange({ ...filters, ...patch });

  const repOptions = filters.region ? options.salesReps[filters.region] ?? [] : [];

  return (
    <FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">评估层级</span>
          <Select
            value={filters.level}
            onValueChange={(v) =>
              update({ level: v as CapabilityLevel, salesRep: '' })
            }
          >
            <SelectTrigger className="h-8 w-[120px] rounded-full">
              <SelectValue placeholder="选择层级" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="region">所别</SelectItem>
                <SelectItem value="rep">业代</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">评估对象</span>
          <Select
            value={filters.region}
            onValueChange={(v) => update({ region: v, salesRep: '' })}
          >
            <SelectTrigger className="h-8 w-[120px] rounded-full">
              <SelectValue placeholder="全部所别" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__all__">全部所别</SelectItem>
                {options.regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {filters.level === 'rep' && (
            <Select
              value={filters.salesRep}
              onValueChange={(v) => update({ salesRep: v })}
            >
              <SelectTrigger className="h-8 w-[120px] rounded-full">
                <SelectValue placeholder="全部业代" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部业代</SelectItem>
                  {repOptions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">评估月份</span>
          <Select
            value={filters.monthFrom}
            onValueChange={(v) => update({ monthFrom: v })}
          >
            <SelectTrigger className="h-8 w-[120px] rounded-full">
              <SelectValue placeholder="起始月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">~</span>
          <Select
            value={filters.monthTo}
            onValueChange={(v) => update({ monthTo: v })}
          >
            <SelectTrigger className="h-8 w-[120px] rounded-full">
              <SelectValue placeholder="结束月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">对比</span>
          <Select
            value={filters.compareType}
            onValueChange={(v) => update({ compareType: v as CapabilityCompareType })}
          >
            <SelectTrigger className="h-8 w-[120px] rounded-full">
              <SelectValue placeholder="无对比" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">无对比</SelectItem>
                <SelectItem value="mom">环比（上月）</SelectItem>
                <SelectItem value="yoy">同比（去年）</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end mt-3 gap-2">
        <Button variant="ghost" size="sm" onClick={onReset} className="h-6 px-2 text-xs">
          重置
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={onConfirm}
          disabled={loading}
          className="h-6 px-3 text-xs"
        >
          {loading ? '评估中…' : '确认评估'}
        </Button>
      </div>
    </FilterBar>
  );
};

export default CapabilityFilterBar;
