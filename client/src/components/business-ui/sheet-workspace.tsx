import * as React from 'react';
import {
  Suspense,
  lazy,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshCw, X } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const HomePage = lazy(() => import('@/pages/HomePage/HomePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage/DashboardPage'));
const DashboardOverviewPage = lazy(() => import('@/pages/DashboardPage/DashboardOverviewPage'));
const DashboardBrandSpecPage = lazy(() => import('@/pages/DashboardPage/DashboardBrandSpecPage'));
const CustomerPage = lazy(() => import('@/pages/CustomerPage/CustomerPage'));
const CustomerListPage = lazy(() => import('@/pages/CustomerListPage/CustomerListPage'));
const DataManagePage = lazy(() => import('@/pages/DataManagePage/DataManagePage'));
const ExpensePage = lazy(() => import('@/pages/ExpensePage/ExpensePage'));
const ExpiryExpensePage = lazy(() => import('@/pages/ExpiryExpensePage/ExpiryExpensePage'));
const AtpExpensePage = lazy(() => import('@/pages/AtpExpensePage/AtpExpensePage'));
const OverstockPage = lazy(() => import('@/pages/OverstockPage/OverstockPage'));
const ServiceAnalysisPage = lazy(() => import('@/pages/ServiceAnalysisPage/ServiceAnalysisPage'));
const CapabilityPage = lazy(() => import('@/pages/CapabilityPage/CapabilityPage'));
const DbTablePage = lazy(() => import('@/pages/DbTablePage/DbTablePage'));

export interface SheetItem {
  id: string;
  path: string;
  label: string;
  icon?: string;
  openedAt?: number;
}

interface SheetWorkspaceProps {
  sheets: SheetItem[];
  activeSheetId: string | null;
  duplicateSheetIds?: Set<string>;
  onActivateSheet: (id: string) => void;
  onCloseSheet: (id: string) => void;
  onCloseOtherSheets?: (id: string) => void;
  onCloseAllSheets?: () => void;
  onReorderSheets?: (newSheets: SheetItem[]) => void;
}

const PageLoader = () => (
  <Skeleton className="h-[calc(100vh-120px)] w-full" />
);

function SheetContent({ path }: { path: string }) {
  const content = React.useMemo(() => {
    const wrap = (element: React.ReactNode) => (
      <Suspense fallback={<PageLoader />}>{element}</Suspense>
    );

    switch (path) {
      case '/':
        return wrap(<HomePage />);
      case '/customers':
        return wrap(<CustomerPage />);
      case '/customer-list':
        return wrap(<CustomerListPage />);
      case '/data':
        return wrap(<DataManagePage />);
      case '/dashboard/overview':
      case '/dashboard':
        return wrap(<DashboardOverviewPage />);
      case '/dashboard/cumulative':
        return wrap(<DashboardPage mode="cumulative" />);
      case '/dashboard/daily':
        return wrap(<DashboardPage mode="daily" />);
      case '/dashboard/brand-spec':
        return wrap(<DashboardBrandSpecPage />);
      case '/expense':
        return wrap(<ExpensePage />);
      case '/expense/expiry':
        return wrap(<ExpiryExpensePage />);
      case '/expense/atp':
        return wrap(<AtpExpensePage />);
      case '/expense/overstock':
        return wrap(<OverstockPage />);
      case '/service-analysis':
        return wrap(<ServiceAnalysisPage />);
      case '/capability':
        return wrap(<CapabilityPage />);
      case '/db-table':
        return wrap(<DbTablePage />);
      default:
        return (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            未知板块：{path}
          </div>
        );
    }
  }, [path]);

  return <div className="h-full p-4">{content}</div>;
}

interface ScrollSnapshot {
  selector: string;
  top: number;
  left: number;
}

function getElementPath(el: Element): string {
  const path: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body) {
    const parent = node.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === node!.tagName,
    );
    const index = siblings.indexOf(node) + 1;
    path.unshift(
      `${node.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${index})` : ''}`,
    );
    node = parent;
  }
  return path.join(' > ');
}

function captureScroll(container: HTMLElement): ScrollSnapshot[] {
  const snapshot: ScrollSnapshot[] = [];
  container.querySelectorAll('*').forEach((el) => {
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      snapshot.push({
        selector: getElementPath(el),
        top: el.scrollTop,
        left: el.scrollLeft,
      });
    }
  });
  return snapshot;
}

function restoreScroll(container: HTMLElement, snapshot: ScrollSnapshot[]) {
  snapshot.forEach(({ selector, top, left }) => {
    try {
      const el = container.querySelector(selector);
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    } catch {
      // 忽略无效选择器
    }
  });
}

export function SheetWorkspace({
  sheets,
  activeSheetId,
  duplicateSheetIds,
  onActivateSheet,
  onCloseSheet,
  onCloseOtherSheets,
  onCloseAllSheets,
  onReorderSheets,
}: SheetWorkspaceProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<Record<string, number>>({});
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const dragItemRef = useRef<HTMLButtonElement | null>(null);
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollSnapshots = useRef<Record<string, ScrollSnapshot[]>>({});

  const handleRefreshSheet = useCallback((sheetId: string) => {
    if (refreshingIds.has(sheetId)) return;

    const contentEl = contentRefs.current[sheetId];
    if (contentEl) {
      scrollSnapshots.current[sheetId] = captureScroll(contentEl);
    }

    setRefreshingIds((prev) => new Set(prev).add(sheetId));
    setRefreshNonce((prev) => ({
      ...prev,
      [sheetId]: (prev[sheetId] ?? 0) + 1,
    }));

    setTimeout(() => {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(sheetId);
        return next;
      });
    }, 600);
  }, [refreshingIds]);

  useLayoutEffect(() => {
    Object.keys(refreshNonce).forEach((sheetId) => {
      const contentEl = contentRefs.current[sheetId];
      const snapshot = scrollSnapshots.current[sheetId];
      if (contentEl && snapshot) {
        restoreScroll(contentEl, snapshot);
      }
    });
  }, [refreshNonce]);

  const pathCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sheets.forEach((sheet) => {
      counts[sheet.path] = (counts[sheet.path] || 0) + 1;
    });
    return counts;
  }, [sheets]);

  const handleDragStart = useCallback((
    event: React.DragEvent<HTMLButtonElement>,
    id: string,
    index: number,
  ) => {
    setDraggingId(id);
    dragItemRef.current = event.currentTarget;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());

    window.requestAnimationFrame(() => {
      if (dragItemRef.current) {
        dragItemRef.current.classList.add('opacity-50', 'scale-105');
      }
    });
  }, []);

  const handleDragOver = useCallback((
    event: React.DragEvent<HTMLButtonElement>,
    index: number,
  ) => {
    event.preventDefault();
    if (draggingId === null) return;
    setDragOverIndex(index);
  }, [draggingId]);

  const handleDrop = useCallback((
    event: React.DragEvent<HTMLButtonElement>,
    index: number,
  ) => {
    event.preventDefault();
    if (draggingId === null) return;

    const originalIndex = parseInt(event.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(originalIndex) && originalIndex !== index && onReorderSheets) {
      const newSheets = [...sheets];
      const [moved] = newSheets.splice(originalIndex, 1);
      newSheets.splice(index, 0, moved);
      onReorderSheets(newSheets);
    }

    setDragOverIndex(null);
  }, [draggingId, onReorderSheets, sheets]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverIndex(null);
    if (dragItemRef.current) {
      dragItemRef.current.classList.remove('opacity-50', 'scale-105');
      dragItemRef.current = null;
    }
  }, []);

  if (sheets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center gap-1">
            {sheets.map((sheet, index) => {
              const isActive = sheet.id === activeSheetId;
              const isDuplicate = duplicateSheetIds?.has(sheet.id) ?? pathCounts[sheet.path] > 1;
              const isRefreshing = refreshingIds.has(sheet.id);

              return (
                <ContextMenu key={sheet.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      draggable
                      onClick={() => onActivateSheet(sheet.id)}
                      onDragStart={(event) => handleDragStart(event, sheet.id, index)}
                      onDragOver={(event) => handleDragOver(event, index)}
                      onDrop={(event) => handleDrop(event, index)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'group relative flex h-7 max-w-[160px] shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-xs transition-all duration-150 ease-out',
                        isDuplicate
                          ? 'border-[hsl(152,60%,42%)]/40 bg-[hsl(152,60%,42%)]/15 text-[hsl(152,60%,30%)] hover:bg-[hsl(152,60%,42%)]/25'
                          : isActive
                            ? 'border-primary bg-accent text-accent-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        draggingId === sheet.id ? 'opacity-50 scale-105' : '',
                        dragOverIndex === index && draggingId !== sheet.id
                          ? 'ring-2 ring-primary ring-offset-1'
                          : '',
                      )}
                    >
                      {isRefreshing ? (
                        <Spinner className="size-3" />
                      ) : sheet.icon ? (
                        <span className="flex size-3.5 items-center justify-center text-xs leading-none">
                          {sheet.icon}
                        </span>
                      ) : null}
                      <span className="truncate">{sheet.label}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCloseSheet(sheet.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onCloseSheet(sheet.id);
                          }
                        }}
                        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-muted hover:opacity-100"
                        aria-label={`关闭 ${sheet.label}`}
                      >
                        <X className="size-3" />
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-36">
                    <ContextMenuItem
                      onSelect={() => handleRefreshSheet(sheet.id)}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Spinner className="mr-2 size-3.5" />
                      ) : (
                        <RefreshCw className="mr-2 size-3.5" />
                      )}
                      刷新
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onCloseSheet(sheet.id)}>
                      <X className="mr-2 size-3.5" />
                      关闭
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => onCloseOtherSheets?.(sheet.id)}
                      disabled={sheets.length <= 1}
                    >
                      关闭其他
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => onCloseAllSheets?.()}
                      disabled={sheets.length === 0}
                    >
                      关闭所有
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Active sheet content */}
      <div className="flex-1 overflow-hidden">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const isRefreshing = refreshingIds.has(sheet.id);
          return (
            <div
              key={`${sheet.id}-${refreshNonce[sheet.id] ?? 0}`}
              ref={(el) => {
                contentRefs.current[sheet.id] = el;
              }}
              className={cn(
                'relative h-full w-full',
                isActive ? 'block' : 'hidden',
              )}
            >
              <SheetContent path={sheet.path} />
              {isActive && isRefreshing && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                  <Spinner className="size-8 text-primary" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
