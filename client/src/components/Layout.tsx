import { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
} from '@/components/ui/breadcrumb';
import { SettingsButton } from '@/components/business-ui/settings-button';
import {
  SheetWorkspace,
  type SheetItem,
} from '@/components/business-ui/sheet-workspace';
import { usePreferences } from '@/components/theme-provider';

const NAV_ITEMS = [
  { path: '/', label: '主页', icon: '🏠' },
  { path: '/customers', label: '客户总览', icon: '👥' },
  { path: '/expense', label: '费用总览', icon: '💰' },
  { path: '/service-analysis', label: '服务点数分析', icon: '📍' },
];

const DASHBOARD_SUB_ITEMS = [
  { path: '/dashboard/cumulative', label: '累计成交分析', icon: '📈' },
  { path: '/dashboard/daily', label: '当日成交分析', icon: '📅' },
  { path: '/dashboard/brand-spec', label: '品牌 & 规格分析', icon: '🏷️' },
];

const EXPENSE_SUB_ITEMS = [
  { path: '/expense/expiry', label: '临期费用分析', icon: '⏰' },
  { path: '/expense/atp', label: 'ATP费用分析', icon: '⚡' },
  { path: '/expense/overstock', label: '压货分析', icon: '📦' },
];

const FOOTER_NAV_ITEMS = [
  { path: '/data', label: '数据管理', icon: '🗄️', labelClass: 'font-extrabold text-[#c8dd5f]' },
  { path: '/customer-list', label: '客户列表', icon: '📋', labelClass: 'font-extrabold text-[#95e599]' },
  { path: '/ai-docs', label: 'AI 设计文档', icon: '📘', labelClass: 'font-extrabold text-[#7dd3fc]' },
];



const LayoutContent = () => {
  const { pathname } = useLocation();
  const { toggleSidebar } = useSidebar();
  const userInfo = useCurrentUserProfile();
  const { avatar } = usePreferences();
  const [loggingOut, setLoggingOut] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(() => pathname.startsWith('/dashboard'));
  const [expenseExpanded, setExpenseExpanded] = useState(() => pathname.startsWith('/expense'));
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  const openSheet = useCallback((path: string, label: string, icon?: string) => {
    const id = `${path}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newSheet: SheetItem = { id, path, label, icon };
    setSheets((prev) => [...prev, newSheet]);
    setActiveSheetId(id);
  }, []);

  const closeSheet = useCallback((id: string) => {
    setSheets((prev) => {
      const index = prev.findIndex((sheet) => sheet.id === id);
      const next = prev.filter((sheet) => sheet.id !== id);
      if (activeSheetId === id && next.length > 0) {
        const fallback = prev[index - 1] ?? prev[index + 1] ?? next[0];
        setActiveSheetId(fallback?.id ?? null);
      } else if (next.length === 0) {
        setActiveSheetId(null);
      }
      return next;
    });
  }, [activeSheetId]);

  const activateSheet = useCallback((id: string) => {
    setActiveSheetId(id);
  }, []);

  const handleReorderSheets = useCallback((newSheets: SheetItem[]) => {
    setSheets(newSheets);
  }, []);

  // Auto-expand when navigating to a dashboard sub-route
  useEffect(() => {
    if (pathname.startsWith('/dashboard')) {
      setDashboardExpanded(true);
    }
  }, [pathname]);

  // Auto-expand when navigating to a expense sub-route
  useEffect(() => {
    if (pathname.startsWith('/expense')) {
      setExpenseExpanded(true);
    }
  }, [pathname]);

  // Open an initial sheet for the current route on first load
  useEffect(() => {
    const allSheetPaths = [
      ...NAV_ITEMS.map((item) => ({ path: item.path, label: item.label, icon: item.icon })),
      ...DASHBOARD_SUB_ITEMS.map((item) => ({ path: item.path, label: item.label, icon: item.icon })),
      ...EXPENSE_SUB_ITEMS.map((item) => ({ path: item.path, label: item.label, icon: item.icon })),
      ...FOOTER_NAV_ITEMS.map((item) => ({ path: item.path, label: item.label, icon: item.icon })),
    ];
    const matched = allSheetPaths.find((item) =>
      item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
    );
    if (matched && sheets.length === 0) {
      openSheet(matched.path, matched.label, matched.icon);
    }
  }, []);

  // Clear sheets when navigating to a route that is not part of the sheet system
  useEffect(() => {
    const sheetPaths = [
      ...NAV_ITEMS.map((item) => item.path),
      ...DASHBOARD_SUB_ITEMS.map((item) => item.path),
      ...EXPENSE_SUB_ITEMS.map((item) => item.path),
      ...FOOTER_NAV_ITEMS.map((item) => item.path),
    ];
    const isSheetPath = sheetPaths.some((path) =>
      path === '/' ? pathname === '/' : pathname.startsWith(path)
    );
    if (!isSheetPath && sheets.length > 0) {
      setSheets([]);
      setActiveSheetId(null);
    }
  }, [pathname, sheets.length]);

  const isLoggedIn = !!userInfo?.user_id;
  const displayName = (typeof userInfo?.name === 'string' ? userInfo.name : '') || '游客';

  let avatarImageSrc: string | undefined;
  if (avatar.type === 'image') {
    avatarImageSrc = avatar.value;
  } else if (avatar.type === 'emoji' && avatar.value === '🐼' && userInfo?.avatar) {
    avatarImageSrc = userInfo.avatar;
  }

  const activeSubItem = DASHBOARD_SUB_ITEMS.find((item) => pathname.startsWith(item.path));
  const activeExpenseSubItem = EXPENSE_SUB_ITEMS.find((item) => pathname.startsWith(item.path));
  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId);
  const activeTitle = activeSheet?.label
    || activeSubItem?.label
    || activeExpenseSubItem?.label
    || [...NAV_ITEMS, ...FOOTER_NAV_ITEMS].find((item) =>
      item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
    )?.label
    || (pathname.startsWith('/dashboard') ? '成交分析' : '生产力数据多维分析');

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const dataloom = await getDataloom();
      const result = await (dataloom.service.session as any).signOut();
      if ((result as any)?.error) {
        logger.error('退出登录失败:', (result as any).error.message);
        return;
      }
      window.location.reload();
    } catch (err) {
      logger.error('退出登录异常:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogin = async () => {
    const dataloom = await getDataloom();
    (dataloom.service.session as any).redirectToLogin();
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="重点数据分析">
                <Link to="/">
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-extrabold text-xl group-data-[collapsible=icon]:hidden">重点数据分析</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.slice(0, 2).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={sheets.some((sheet) => sheet.path === item.path && sheet.id === activeSheetId)}
                      onClick={() => openSheet(item.path, item.label, item.icon)}
                      tooltip={item.label}
                    >
                      <span className="flex size-4 items-center justify-center text-base leading-none">{item.icon}</span>
                      <span className="font-extrabold group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {/* 成交分析 — 可折叠二级目录 */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={sheets.some((sheet) => sheet.path.startsWith('/dashboard') && sheet.id === activeSheetId)}
                    onClick={() => {
                      setDashboardExpanded((prev) => !prev);
                      openSheet('/dashboard/overview', '成交分析', '📊');
                    }}
                    tooltip="成交分析"
                  >
                    <span className="flex size-4 items-center justify-center text-base leading-none">📊</span>
                    <span className="font-extrabold group-data-[collapsible=icon]:hidden">成交分析</span>
                    <span className="ml-auto text-base leading-none group-data-[collapsible=icon]:hidden transition-transform duration-150 ease-out">{dashboardExpanded ? '▼' : '▶'}</span>
                  </SidebarMenuButton>
                  {dashboardExpanded && (
                    <SidebarMenuSub>
                      {DASHBOARD_SUB_ITEMS.map((sub) => (
                        <SidebarMenuSubItem key={sub.path}>
                          <SidebarMenuSubButton
                            isActive={sheets.some((sheet) => sheet.path === sub.path && sheet.id === activeSheetId)}
                            onClick={() => openSheet(sub.path, sub.label, sub.icon)}
                          >
                            <span className="flex size-4 items-center justify-center text-base leading-none">{sub.icon}</span>
                            <span>{sub.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
                {/* 费用总览 — 可折叠二级目录 */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={sheets.some((sheet) => sheet.path.startsWith('/expense') && sheet.id === activeSheetId)}
                    onClick={() => {
                      setExpenseExpanded((prev) => !prev);
                      openSheet('/expense', '费用总览', '💰');
                    }}
                    tooltip="费用总览"
                  >
                    <span className="flex size-4 items-center justify-center text-base leading-none">💰</span>
                    <span className="font-extrabold group-data-[collapsible=icon]:hidden">费用总览</span>
                    <span className="ml-auto text-base leading-none group-data-[collapsible=icon]:hidden transition-transform duration-150 ease-out">{expenseExpanded ? '▼' : '▶'}</span>
                  </SidebarMenuButton>
                  {expenseExpanded && (
                    <SidebarMenuSub>
                      {EXPENSE_SUB_ITEMS.map((sub) => (
                        <SidebarMenuSubItem key={sub.path}>
                          <SidebarMenuSubButton
                            isActive={sheets.some((sheet) => sheet.path === sub.path && sheet.id === activeSheetId)}
                            onClick={() => openSheet(sub.path, sub.label, sub.icon)}
                          >
                            <span className="flex size-4 items-center justify-center text-base leading-none">{sub.icon}</span>
                            <span>{sub.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
                {NAV_ITEMS.slice(2).filter((item) => item.path !== '/expense').map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={sheets.some((sheet) => sheet.path === item.path && sheet.id === activeSheetId)}
                      onClick={() => openSheet(item.path, item.label, item.icon)}
                      tooltip={item.label}
                    >
                      <span className="flex size-4 items-center justify-center text-base leading-none">{item.icon}</span>
                      <span className="font-extrabold group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            {FOOTER_NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={sheets.some((sheet) => sheet.path === item.path && sheet.id === activeSheetId)}
                  onClick={() => openSheet(item.path, item.label, item.icon)}
                  tooltip={item.label}
                >
                  <span className="flex size-4 items-center justify-center text-base leading-none">{item.icon}</span>
                  <span className={`${item.labelClass} group-data-[collapsible=icon]:hidden`}>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={displayName}>
                    <Avatar className="size-8">
                      {avatarImageSrc && (
                        <AvatarImage src={avatarImageSrc} alt={displayName} />
                      )}
                      <AvatarFallback className="text-base">
                        {avatar.type === 'emoji' ? avatar.value : '🐼'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-medium group-data-[collapsible=icon]:hidden">{displayName}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-48">
                  {isLoggedIn ? (
                    <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
                      <span className="mr-2 text-base leading-none">🚪</span>
                      退出登录
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleLogin}>
                      <span className="mr-2 text-base leading-none">🔑</span>
                      登录
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => toggleSidebar()} tooltip="收起菜单">
                <span className="flex size-4 items-center justify-center text-base leading-none">⬅️</span>
                <span className="group-data-[collapsible=icon]:hidden">收起菜单</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
          <SidebarTrigger />
          <Breadcrumb className="self-center">
            <BreadcrumbList>
              <BreadcrumbItem className="text-foreground font-medium">
                {activeTitle}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center">
            <SettingsButton />
          </div>
        </header>
        {sheets.length > 0 ? (
          <SheetWorkspace
            sheets={sheets}
            activeSheetId={activeSheetId}
            onActivateSheet={activateSheet}
            onCloseSheet={closeSheet}
            onReorderSheets={handleReorderSheets}
          />
        ) : (
          <div className="flex-1 overflow-auto bg-background p-4">
            <Outlet />
          </div>
        )}
      </main>
    </>
  );
};

const Layout = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default Layout;
