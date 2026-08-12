import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Grid, useGridRef } from 'react-window';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import type { DbColumnInfo } from '@shared/api.interface';
import {
  cellAlignment,
  cellMonoClass,
  defaultColumnWidth,
  formatCell,
  loadWidths,
  saveWidths,
} from './db-table.utils';

const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 36;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 600;

interface GridCellProps {
  rows: Record<string, unknown>[];
  cols: DbColumnInfo[];
  widths: number[];
}

interface DbTableDataGridProps {
  /** 本地存储 key（schema.table） */
  tableKey: string;
  columns: DbColumnInfo[];
  rows: Record<string, unknown>[];
  loading: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort: (name: string, dir: 'asc' | 'desc' | 'none') => void;
  visibleColumns: string[];
}

const GridCell = ({
  rows,
  cols,
  widths,
  columnIndex,
  rowIndex,
  style,
}: GridCellProps & {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
}) => {
  const col = cols[columnIndex];
  const value = rows[rowIndex]?.[col.name];
  const align = cellAlignment(col);
  const isNull = value === null || value === undefined || value === '';
  const text = formatCell(value, col);
  return (
    <div
      style={{ ...style, width: widths[columnIndex] }}
      className={cn(
        'flex items-center overflow-hidden border-b border-r border-border/50 px-2 text-xs transition-colors duration-150 ease-out',
        rowIndex % 2 === 1 ? 'bg-[hsl(220,18%,98%)]' : 'bg-card',
        align === 'right' ? 'justify-end' : 'justify-start',
        cellMonoClass(col),
      )}
      title={text}
    >
      <span className={cn('truncate', isNull && 'text-muted-foreground')}>{text}</span>
    </div>
  );
};

interface HeaderCellProps {
  col: DbColumnInfo;
  width: number;
  sortState: 'asc' | 'desc' | 'none';
  onSort: (name: string, dir: 'asc' | 'desc' | 'none') => void;
  onResize: (width: number) => void;
}

const HeaderCell = ({ col, width, sortState, onSort, onResize }: HeaderCellProps) => {
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: MouseEvent) => {
        onResize(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, startWidth + ev.clientX - startX)));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width, onResize],
  );

  const handleClick = useCallback(() => {
    const next: 'asc' | 'desc' | 'none' =
      sortState === 'asc' ? 'desc' : sortState === 'desc' ? 'none' : 'asc';
    onSort(col.name, next);
  }, [col.name, sortState, onSort]);

  return (
    <div
      className="group relative flex h-full cursor-pointer select-none items-center gap-1 overflow-hidden border-r border-border bg-card px-2 transition-colors duration-150 ease-out hover:bg-accent/40"
      style={{ width }}
      onClick={handleClick}
      title={col.comment ? `${col.name} — ${col.comment}` : `${col.name} (${col.dataType})`}
    >
      <span className="truncate text-xs text-muted-foreground">{col.name}</span>
      {col.isPrimaryKey && (
        <span className="shrink-0 rounded-sm bg-warning/15 px-1 text-[10px] font-medium text-warning">
          主键
        </span>
      )}
      <span className="ml-auto shrink-0 text-[10px] leading-none text-primary">
        {sortState === 'asc' ? '↑' : sortState === 'desc' ? '↓' : ''}
      </span>
      <div
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/60"
        onMouseDown={startResize}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onResize(defaultColumnWidth(col));
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label={`调整列宽：${col.name}`}
      />
    </div>
  );
};

export const DbTableDataGrid: React.FC<DbTableDataGridProps> = ({
  tableKey,
  columns,
  rows,
  loading,
  sortBy,
  sortDir,
  onSort,
  visibleColumns,
}) => {
  const storageKey = `db-table-viewer:widths:${tableKey}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(storageKey));
  const [scrollLeft, setScrollLeft] = useState(0);
  const gridRef = useGridRef(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cols = useMemo(
    () =>
      visibleColumns
        .map((name) => columns.find((c) => c.name === name))
        .filter((c): c is DbColumnInfo => Boolean(c)),
    [columns, visibleColumns],
  );

  const widthList = useMemo(
    () => cols.map((c) => widths[c.name] ?? defaultColumnWidth(c)),
    [cols, widths],
  );
  const totalWidth = widthList.reduce((a, b) => a + b, 0);

  const setWidth = useCallback(
    (name: string, w: number) => {
      setWidths((prev) => ({ ...prev, [name]: Math.round(w) }));
    },
    [],
  );

  // 列宽持久化（防抖）
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWidths(storageKey, widths);
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [widths, storageKey]);

  // 切换数据/分页后回到顶部
  useEffect(() => {
    gridRef.current?.scrollToRow({ index: 0, align: 'start', behavior: 'instant' });
    gridRef.current?.scrollToColumn({ index: 0, align: 'start', behavior: 'instant' });
    setScrollLeft(0);
  }, [rows, cols, gridRef]);

  const cellProps = useMemo<GridCellProps>(
    () => ({ rows, cols, widths: widthList }),
    [rows, cols, widthList],
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
      {/* 表头（与网格横向滚动同步） */}
      <div className="shrink-0 overflow-hidden border-b border-border" style={{ height: HEADER_HEIGHT }}>
        <div
          className="flex h-full"
          style={{ width: totalWidth, transform: `translateX(-${scrollLeft}px)` }}
        >
          {cols.map((col, i) => (
            <HeaderCell
              key={col.name}
              col={col}
              width={widthList[i]}
              sortState={sortBy === col.name ? (sortDir ?? 'asc') : 'none'}
              onSort={onSort}
              onResize={(w) => setWidth(col.name, w)}
            />
          ))}
        </div>
      </div>

      {/* 数据区 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {cols.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="emoji">🗄️</EmptyMedia>
                <EmptyTitle className="text-sm font-normal">没有可显示的列</EmptyTitle>
                <EmptyDescription className="text-xs">请在“列设置”中选择要显示的列</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="emoji">🔍</EmptyMedia>
                <EmptyTitle className="text-sm font-normal">暂无匹配数据</EmptyTitle>
                <EmptyDescription className="text-xs">
                  调整筛选条件或清除搜索关键字后重试
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <Grid<GridCellProps>
            className="h-full w-full"
            gridRef={gridRef}
            cellComponent={GridCell}
            cellProps={cellProps}
            columnCount={cols.length}
            columnWidth={(i) => widthList[i]}
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            overscanCount={8}
            defaultWidth={800}
            defaultHeight={400}
            onScroll={handleScroll}
          />
        )}

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <Skeleton className="h-[calc(100%-8px)] w-[calc(100%-8px)]" />
          </div>
        )}
      </div>
    </div>
  );
};
