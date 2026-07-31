import * as React from 'react';
import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
const DocGenPage = lazy(() => import('@/pages/DocGenPage/DocGenPage'));

export interface SheetItem {
  id: string;
  path: string;
  label: string;
  icon?: string;
}

interface SheetWorkspaceProps {
  sheets: SheetItem[];
  activeSheetId: string | null;
  onActivateSheet: (id: string) => void;
  onCloseSheet: (id: string) => void;
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
      case '/ai-docs':
        return wrap(<DocGenPage />);
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

export function SheetWorkspace({
  sheets,
  activeSheetId,
  onActivateSheet,
  onCloseSheet,
  onReorderSheets,
}: SheetWorkspaceProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<HTMLButtonElement | null>(null);

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
              const isDuplicate = pathCounts[sheet.path] > 1;

              return (
                <button
                  key={sheet.id}
                  type="button"
                  draggable
                  onClick={() => onActivateSheet(sheet.id)}
                  onDragStart={(event) => handleDragStart(event, sheet.id, index)}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group relative flex h-7 max-w-[160px] shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-xs transition-all duration-150 ease-out',
                    isActive
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isDuplicate && !isActive
                      ? 'bg-[hsl(142,70%,95%)] text-[hsl(152,60%,25%)] hover:bg-[hsl(142,70%,92%)]'
                      : '',
                    draggingId === sheet.id ? 'opacity-50 scale-105' : '',
                    dragOverIndex === index && draggingId !== sheet.id
                      ? 'ring-2 ring-primary ring-offset-1'
                      : '',
                  )}
                >
                  {sheet.icon && (
                    <span className="flex size-3.5 items-center justify-center text-xs leading-none">
                      {sheet.icon}
                    </span>
                  )}
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
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Active sheet content */}
      <div className="flex-1 overflow-hidden">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={cn(
              'h-full w-full',
              sheet.id === activeSheetId ? 'block' : 'hidden',
            )}
          >
            <SheetContent path={sheet.path} />
          </div>
        ))}
      </div>
    </div>
  );
}
