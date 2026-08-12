import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Download,
  FileSpreadsheet,
  Columns3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Database,
  Loader2,
  Table2,
  BarChart3,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { dbTableApi } from '@client/src/api/index';
import type {
  DbTableInfo,
  DbTableListResponse,
  DbColumnInfo,
  DbTableDataParams,
  DbTableFilter,
  DbTableStatsResponse,
  DbTableStructureResponse,
  DbTableDataResponse,
} from '@shared/api.interface';
import { DbTableDataGrid } from './DbTableDataGrid';
import DbTableChartPanel from './DbTableChartPanel';
import {
  columnKindLabel,
  downloadBlob,
  formatNumber,
  loadVisibleColumns,
  saveVisibleColumns,
  TABLE_CACHE_PREFIX,
} from './db-table.utils';

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

function kindToFilterType(kind: DbColumnInfo['kind']): DbTableFilter['type'] {
  if (kind === 'number') return 'number';
  if (kind === 'date') return 'date';
  if (kind === 'boolean') return 'boolean';
  return 'text';
}

/** 生成导出/展示用的单元格原始值 */
function exportCellValue(value: unknown, col: DbColumnInfo): string | number | boolean {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  if (col.kind === 'boolean') return value === true || value === 'true';
  if (typeof value === 'object') return JSON.stringify(value);
  if (col.kind === 'number') return Number(value);
  return String(value);
}

const DbTablePage = () => {
  // ===== 表列表 =====
  const [listInfo, setListInfo] = useState<DbTableListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listKeyword, setListKeyword] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // ===== 选中表结构/数据 =====
  const [structure, setStructure] = useState<DbTableStructureResponse | null>(null);
  const [columns, setColumns] = useState<DbColumnInfo[]>([]);
  const [data, setData] = useState<DbTableDataResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [stats, setStats] = useState<DbTableStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ===== 查询状态 =====
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | undefined>();
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, DbTableFilter>>({});

  // ===== 视图状态 =====
  const [activeTab, setActiveTab] = useState<'data' | 'stats'>('data');
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState('');
  const [filterDraft, setFilterDraft] = useState<DbTableFilter>({ type: 'text' });
  const abortRef = useRef<AbortController | null>(null);

  const tableKey = selected ?? '';

  // ===== 表列表加载 =====
  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    dbTableApi
      .getDbTables()
      .then((res) => {
        if (cancelled) return;
        setListInfo(res);
        if (res.tables.length > 0 && !selected) {
          setSelected(`${res.tables[0].schema}.${res.tables[0].name}`);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('加载数据库表列表失败');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 选中表：加载结构 + 重置查询状态 =====
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStructure(null);
    setColumns([]);
    setData(null);
    setStats(null);
    setPage(1);
    setSortBy(undefined);
    setSortDir(undefined);
    setQInput('');
    setQ('');
    setFilters({});
    setActiveTab('data');

    dbTableApi
      .getDbTableStructure(selected)
      .then((res) => {
        if (cancelled) return;
        setStructure(res);
        setColumns(res.columns);
      })
      .catch(() => {
        if (!cancelled) toast.error('加载表结构失败');
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // ===== 列显隐初始化/持久化 =====
  useEffect(() => {
    if (columns.length === 0 || !tableKey) return;
    const key = `${TABLE_CACHE_PREFIX}:visible:${tableKey}`;
    const saved = loadVisibleColumns(key);
    setVisibleColumns(saved ?? columns.map((c) => c.name));
  }, [columns, tableKey]);

  const orderedVisible = useMemo(() => {
    const set = new Set(visibleColumns);
    return columns.filter((c) => set.has(c.name)).map((c) => c.name);
  }, [columns, visibleColumns]);

  // ===== 搜索关键字防抖 =====
  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (q !== undefined) setPage(1);
  }, [q]);

  // ===== 数据拉取 =====
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const params: DbTableDataParams = { page, pageSize };
    if (sortBy) {
      params.sortBy = sortBy;
      params.sortDir = sortDir ?? 'asc';
    }
    if (q) params.q = q;
    if (Object.keys(filters).length > 0) params.filters = filters;

    setDataLoading(true);
    dbTableApi
      .getDbTableData(selected, params)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (!structure) setColumns(res.columns);
      })
      .catch(() => {
        if (!cancelled) toast.error('加载数据失败');
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, page, pageSize, sortBy, sortDir, q, filters]);

  // ===== 统计图表面板数据（懒加载） =====
  useEffect(() => {
    if (activeTab !== 'stats' || !selected || stats) return;
    let cancelled = false;
    setStatsLoading(true);
    dbTableApi
      .getDbTableStats(selected)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        if (!cancelled) toast.error('加载统计数据失败');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, selected, stats]);

  // ===== 事件处理 =====
  const handleSort = useCallback(
    (name: string, dir: 'asc' | 'desc' | 'none') => {
      if (dir === 'none') {
        setSortBy(undefined);
        setSortDir(undefined);
      } else {
        setSortBy(name);
        setSortDir(dir);
      }
      setPage(1);
    },
    [],
  );

  const handleSelectTable = useCallback((name: string) => {
    if (abortRef.current) abortRef.current.abort();
    setSelected(name);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!selected) return;
    setStructure(null);
    setStats(null);
    setData(null);
    setPage(1);
    dbTableApi
      .getDbTableStructure(selected)
      .then((res) => {
        setStructure(res);
        setColumns(res.columns);
      })
      .catch(() => toast.error('刷新表结构失败'));
  }, [selected]);

  const handleToggleColumn = useCallback(
    (name: string) => {
      if (!tableKey) return;
      setVisibleColumns((prev) => {
        const next = prev.includes(name)
          ? prev.filter((n) => n !== name)
          : [...prev, name];
        saveVisibleColumns(`${TABLE_CACHE_PREFIX}:visible:${tableKey}`, next);
        return next;
      });
    },
    [tableKey],
  );

  const handleResetColumns = useCallback(() => {
    if (!tableKey) return;
    const all = columns.map((c) => c.name);
    saveVisibleColumns(`${TABLE_CACHE_PREFIX}:visible:${tableKey}`, all);
    setVisibleColumns(all);
  }, [columns, tableKey]);

  const handleApplyFilter = useCallback(() => {
    if (!filterColumn) return;
    const hasValue =
      filterDraft.value !== undefined && filterDraft.value !== '' && filterDraft.value !== null;
    const hasMin = filterDraft.min !== undefined && filterDraft.min !== '';
    const hasMax = filterDraft.max !== undefined && filterDraft.max !== '';
    if (!hasValue && !hasMin && !hasMax) {
      toast.error('请至少填写一个筛选条件');
      return;
    }
    setFilters((prev) => ({ ...prev, [filterColumn]: filterDraft }));
    setPage(1);
    setFilterOpen(false);
  }, [filterColumn, filterDraft]);

  const handleRemoveFilter = useCallback((name: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  // ===== 导出 =====
  const handleExportCsv = useCallback(async () => {
    if (!selected) return;
    setExporting('csv');
    try {
      const blob = await dbTableApi.exportDbTableCsv(selected, {
        q: q || undefined,
        filters,
        sortBy,
        sortDir,
      });
      const name = selected.split('.').pop() ?? 'data';
      downloadBlob(blob, `${name}.csv`);
      toast.success('CSV 导出成功');
    } catch {
      toast.error('CSV 导出失败');
    } finally {
      setExporting(null);
    }
  }, [selected, q, filters, sortBy, sortDir]);

  const handleExportExcel = useCallback(async () => {
    if (!selected) return;
    setExporting('xlsx');
    try {
      const json = await dbTableApi.exportDbTableJson(selected, { q: q || undefined, filters });
      if (json.count === 0) {
        toast.error('没有可导出的数据');
        return;
      }
      const XLSX = await import('xlsx-js-style');
      const header = json.columns.map((c) => c.name);
      const body = json.rows.map((row) =>
        json.columns.map((c) => exportCellValue(row[c.name], c)),
      );
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数据');
      const name = selected.split('.').pop() ?? 'data';
      XLSX.writeFile(wb, `${name}.xlsx`);
      toast.success(`Excel 导出成功（${formatNumber(json.count)} 行）`);
    } catch {
      toast.error('Excel 导出失败');
    } finally {
      setExporting(null);
    }
  }, [selected, q, filters]);

  // ===== 派生数据 =====
  const filteredTables = useMemo(() => {
    if (!listInfo) return [];
    const kw = listKeyword.trim().toLowerCase();
    if (!kw) return listInfo.tables;
    return listInfo.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(kw) ||
        (t.comment ?? '').toLowerCase().includes(kw) ||
        t.schema.toLowerCase().includes(kw),
    );
  }, [listInfo, listKeyword]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filterableColumns = useMemo(
    () => columns.filter((c) => !filters[c.name]),
    [columns, filters],
  );

  const filterColumnKind = useMemo(
    () => columns.find((c) => c.name === filterColumn)?.kind ?? 'text',
    [columns, filterColumn],
  );

  const openFilterPopover = useCallback(() => {
    const first = filterableColumns[0];
    if (!first) {
      toast.error('所有列均已设置筛选条件');
      return;
    }
    setFilterColumn(first.name);
    setFilterDraft({ type: kindToFilterType(first.kind) });
    setFilterOpen(true);
  }, [filterableColumns]);

  const changeFilterColumn = useCallback(
    (name: string) => {
      const kind = columns.find((c) => c.name === name)?.kind ?? 'text';
      setFilterColumn(name);
      setFilterDraft({ type: kindToFilterType(kind) });
    },
    [columns],
  );

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* ===== 左侧：表列表 ===== */}
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border border-border rounded-sm bg-card">
        <div className="shrink-0 border-b border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="size-3.5 text-primary" />
            <span className="truncate font-medium text-foreground">
              {listInfo?.database || '数据库'}
            </span>
            {listInfo?.host ? <span className="truncate">· {listInfo.host}</span> : null}
          </div>
          {listInfo?.version ? (
            <div className="mb-2 truncate text-[11px] text-muted-foreground" title={listInfo.version}>
              {listInfo.version.split(',').slice(0, 2).join(',')}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={listKeyword}
              onChange={(e) => setListKeyword(e.target.value)}
              placeholder="搜索表名 / 注释"
              className="h-8 w-full rounded-sm border border-border bg-card pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {listLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="size-5 text-primary" />
            </div>
          ) : (
            filteredTables.map((t) => {
              const key = `${t.schema}.${t.name}`;
              const active = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectTable(key)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset',
                    active ? 'bg-accent' : 'hover:bg-accent/40',
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-sm leading-none">
                    {t.type === 'VIEW' ? '👁️' : '🗄️'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-xs',
                        active ? 'font-medium text-accent-foreground' : 'text-foreground',
                      )}
                      title={t.comment ?? undefined}
                    >
                      {t.name}
                    </span>
                    {t.comment ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {t.comment}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatNumber(t.rowEstimate)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {listInfo ? `共 ${listInfo.tables.length} 张表` : ''}
          {filteredTables.length !== (listInfo?.tables.length ?? 0)
            ? ` · 筛选出 ${filteredTables.length} 张`
            : ''}
        </div>
      </aside>

      {/* ===== 右侧：内容区 ===== */}
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="emoji">🗄️</EmptyMedia>
                <EmptyTitle>数据表浏览</EmptyTitle>
                <EmptyDescription>从左侧选择一个数据库表查看结构与数据</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <>
            {/* 表信息 + 操作 */}
            <div className="flex flex-wrap items-center gap-2 border border-border rounded-sm bg-card px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-mono text-sm font-semibold text-foreground">
                    {selected}
                  </h2>
                  {structure?.table.type === 'VIEW' && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      视图
                    </span>
                  )}
                </div>
                {structure?.table.comment ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {structure.table.comment}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {columns.length} 列 · {formatNumber(total)} 行
                    {structure?.table.rowEstimate ? `（估算 ${formatNumber(structure.table.rowEstimate)}）` : ''}
                  </p>
                )}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-sm">
                      <Columns3 className="size-3.5" />
                      列设置
                      <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                        {orderedVisible.length}/{columns.length}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-2">
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-foreground">显示列</span>
                      <button
                        type="button"
                        onClick={handleResetColumns}
                        className="text-[11px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
                      >
                        全部显示
                      </button>
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {columns.map((c) => {
                        const checked = visibleColumns.includes(c.name);
                        return (
                          <label
                            key={c.name}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 transition-colors duration-150 ease-out hover:bg-accent/50',
                              !checked && 'opacity-60',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => handleToggleColumn(c.name)}
                              aria-label={`切换列 ${c.name}`}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                              {c.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {columnKindLabel(c.kind)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-sm"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="size-3.5" />
                  刷新
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-sm"
                  onClick={handleExportCsv}
                  disabled={exporting !== null}
                >
                  {exporting === 'csv' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  导出 CSV
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 rounded-sm"
                  onClick={handleExportExcel}
                  disabled={exporting !== null}
                >
                  {exporting === 'xlsx' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="size-3.5" />
                  )}
                  导出 Excel
                </Button>
              </div>
            </div>

            {/* 页签 */}
            <div className="flex items-center gap-0.5 self-start rounded-full border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('data')}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  activeTab === 'data'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Table2 className="size-3.5" />
                数据
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('stats')}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  activeTab === 'stats'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <BarChart3 className="size-3.5" />
                统计图表
              </button>
            </div>

            {activeTab === 'data' ? (
              <div className="flex min-h-0 flex-1 flex-col border border-border rounded-sm bg-card">
                {/* 筛选工具栏 */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                      placeholder="全文搜索…"
                      className="h-8 w-52 rounded-full border border-border bg-card pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    />
                  </div>
                  <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        onClick={openFilterPopover}
                      >
                        <Filter className="size-3.5" />
                        添加筛选
                        {Object.keys(filters).length > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular-nums">
                            {Object.keys(filters).length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-3">
                      <div className="space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] text-muted-foreground">列</span>
                          <select
                            value={filterColumn}
                            onChange={(e) => changeFilterColumn(e.target.value)}
                            className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                          >
                            {filterableColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}（{columnKindLabel(c.kind)}）
                              </option>
                            ))}
                          </select>
                        </label>

                        {filterColumnKind === 'text' && (
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-muted-foreground">包含</span>
                            <input
                              value={(filterDraft.value as string) ?? ''}
                              onChange={(e) =>
                                setFilterDraft((prev) => ({ ...prev, value: e.target.value }))
                              }
                              placeholder="输入关键字"
                              className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            />
                          </label>
                        )}

                        {filterColumnKind === 'boolean' && (
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-muted-foreground">值</span>
                            <select
                              value={String(filterDraft.value ?? 'true')}
                              onChange={(e) =>
                                setFilterDraft((prev) => ({
                                  ...prev,
                                  value: e.target.value === 'true',
                                }))
                              }
                              className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            >
                              <option value="true">是</option>
                              <option value="false">否</option>
                            </select>
                          </label>
                        )}

                        {(filterColumnKind === 'number' || filterColumnKind === 'date') && (
                          <div className="space-y-2">
                            <label className="block">
                              <span className="mb-1 block text-[11px] text-muted-foreground">
                                {filterColumnKind === 'number' ? '等于（可选）' : '起始日期'}
                              </span>
                              <input
                                type={filterColumnKind === 'number' ? 'number' : 'date'}
                                value={String(filterDraft.value ?? '')}
                                onChange={(e) =>
                                  setFilterDraft((prev) => ({ ...prev, value: e.target.value }))
                                }
                                className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px] text-muted-foreground">
                                {filterColumnKind === 'number' ? '最小值（可选）' : '≥ 日期'}
                              </span>
                              <input
                                type={filterColumnKind === 'number' ? 'number' : 'date'}
                                value={String(filterDraft.min ?? '')}
                                onChange={(e) =>
                                  setFilterDraft((prev) => ({ ...prev, min: e.target.value }))
                                }
                                className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px] text-muted-foreground">
                                {filterColumnKind === 'number' ? '最大值（可选）' : '≤ 日期'}
                              </span>
                              <input
                                type={filterColumnKind === 'number' ? 'number' : 'date'}
                                value={String(filterDraft.max ?? '')}
                                onChange={(e) =>
                                  setFilterDraft((prev) => ({ ...prev, max: e.target.value }))
                                }
                                className="h-8 w-full rounded-sm border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                              />
                            </label>
                          </div>
                        )}

                        <Button
                          size="sm"
                          className="h-8 w-full gap-1.5 rounded-sm"
                          onClick={handleApplyFilter}
                        >
                          <Check className="size-3.5" />
                          应用筛选
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* 已生效的筛选 chips */}
                  {Object.entries(filters).map(([name, f]) => (
                    <span
                      key={name}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 text-xs text-accent-foreground"
                    >
                      <span className="font-mono tabular-nums">{name}</span>
                      <span className="text-muted-foreground">{filterDescription(f)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFilter(name)}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-label={`移除 ${name} 筛选`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}

                  {Object.keys(filters).length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilters({});
                        setPage(1);
                      }}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
                    >
                      清除全部
                    </button>
                  )}
                </div>

                {/* 数据网格 */}
                <DbTableDataGrid
                  tableKey={tableKey}
                  columns={columns}
                  rows={data?.rows ?? []}
                  loading={dataLoading}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  visibleColumns={orderedVisible}
                />

                {/* 分页 */}
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    共 <span className="font-mono tabular-nums text-foreground">{formatNumber(total)}</span>{' '}
                    行 · 第{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {dataLoading ? '—' : `${page} / ${totalPages}`}
                    </span>{' '}
                    页
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      className="h-7 rounded-full border border-border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      aria-label="每页行数"
                    >
                      {PAGE_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s} 行/页
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={page <= 1 || dataLoading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="flex size-7 items-center justify-center rounded-sm border border-border text-foreground transition-colors duration-150 ease-out hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-label="上一页"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages || dataLoading}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="flex size-7 items-center justify-center rounded-sm border border-border text-foreground transition-colors duration-150 ease-out hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-label="下一页"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <DbTableChartPanel stats={stats} loading={statsLoading} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

/** 筛选条件中文描述 */
function filterDescription(f: DbTableFilter): string {
  const parts: string[] = [];
  if (f.type === 'text' && typeof f.value === 'string' && f.value) {
    parts.push(`包含"${f.value}"`);
  }
  if (f.type === 'boolean') {
    parts.push(f.value === true || f.value === 'true' ? '= 是' : '= 否');
  }
  if (f.type === 'number') {
    if (f.value !== undefined && f.value !== '' && f.value !== null) parts.push(`= ${f.value}`);
  }
  if (f.min !== undefined && f.min !== '') parts.push(`≥ ${f.min}`);
  if (f.max !== undefined && f.max !== '') parts.push(`≤ ${f.max}`);
  return parts.join(' ');
}

export default DbTablePage;
