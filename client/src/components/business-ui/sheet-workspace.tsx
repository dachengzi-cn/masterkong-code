import * as React from 'react';
import { Suspense, lazy } from 'react';
import { X } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const HomePage = lazy(() => import('@/pages/HomePage/HomePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage/DashboardPage'));
const DashboardOverviewPage = lazy(() => import('@/pages/DashboardPage/DashboardOverviewPage'));
const DashboardBrandSpecPage = lazy(() => import('@/pages/DashboardPage/DashboardBrandSpecPage'));
const CustomerPage = lazy(() => import('@/pages/CustomerPage/CustomerPage'));
const ExpensePage = lazy(() => import('@/pages/ExpensePage/ExpensePage'));
const ExpiryExpensePage = lazy(() => import('@/pages/ExpiryExpensePage/ExpiryExpensePage'));
const AtpExpensePage = lazy(() => import('@/pages/AtpExpensePage/AtpExpensePage'));
const OverstockPage = lazy(() => import('@/pages/OverstockPage/OverstockPage'));
const ServiceAnalysisPage = lazy(() => import('@/pages/ServiceAnalysisPage/ServiceAnalysisPage'));

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
}: SheetWorkspaceProps) {
  if (sheets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center gap-1">
            {sheets.map((sheet) => {
              const isActive = sheet.id === activeSheetId;
              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => onActivateSheet(sheet.id)}
                  className={cn(
                    'group relative flex h-7 max-w-[160px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs transition-colors',
                    isActive
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
