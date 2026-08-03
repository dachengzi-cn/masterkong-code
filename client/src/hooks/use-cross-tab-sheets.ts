import { useEffect, useRef, useState, useCallback } from 'react';

export interface SyncedSheet {
  id: string;
  path: string;
  openedAt: number;
}

interface TabState {
  tabId: string;
  sheets: SyncedSheet[];
  updatedAt: number;
}

const STORAGE_KEY = 'ks-sheet-sync-v1';
const STALE_THRESHOLD = 30000;
const HEARTBEAT_INTERVAL = 5000;

function generateTabId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readTabs(): Record<string, TabState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TabState>;
    const now = Date.now();
    const cleaned: Record<string, TabState> = {};
    for (const [id, tab] of Object.entries(parsed)) {
      if (tab && now - tab.updatedAt <= STALE_THRESHOLD) {
        cleaned[id] = tab;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeTabs(tabs: Record<string, TabState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

/**
 * 跨浏览器标签页同步当前窗口已打开的 sheet 列表。
 * 用于检测“同一页面在多个窗口中被重复打开”的场景。
 */
export function useCrossTabSheets(currentSheets: SyncedSheet[]) {
  const tabIdRef = useRef<string>(generateTabId());
  const [allTabs, setAllTabs] = useState<Record<string, TabState>>(readTabs);

  const broadcast = useCallback((state: TabState) => {
    setAllTabs((prev) => {
      const latest = readTabs();
      const next = { ...latest, [state.tabId]: state };
      writeTabs(next);
      return next;
    });
  }, []);

  // 初始化时读取一次其它标签页的状态
  useEffect(() => {
    setAllTabs(readTabs());
  }, []);

  // 当前标签页的 sheets 变化时立即广播
  useEffect(() => {
    const state: TabState = {
      tabId: tabIdRef.current,
      sheets: currentSheets,
      updatedAt: Date.now(),
    };
    broadcast(state);
  }, [currentSheets, broadcast]);

  // 监听其它标签页的 storage 事件，并清理过期数据
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as Record<string, TabState>;
        setAllTabs((prev) => {
          const merged = { ...prev, ...parsed };
          const now = Date.now();
          const cleaned: Record<string, TabState> = {};
          for (const [id, tab] of Object.entries(merged)) {
            if (tab && now - tab.updatedAt <= STALE_THRESHOLD) {
              cleaned[id] = tab;
            }
          }
          return cleaned;
        });
      } catch {
        // ignore malformed data
      }
    };

    const handleBeforeUnload = () => {
      setAllTabs((prev) => {
        const next = { ...prev };
        delete next[tabIdRef.current];
        writeTabs(next);
        return next;
      });
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 心跳：定期广播存活状态，并清理已失效的其它标签页数据
  useEffect(() => {
    const interval = setInterval(() => {
      const state: TabState = {
        tabId: tabIdRef.current,
        sheets: currentSheets,
        updatedAt: Date.now(),
      };
      broadcast(state);

      setAllTabs((prev) => {
        const now = Date.now();
        const next: Record<string, TabState> = {};
        let changed = false;
        for (const [id, tab] of Object.entries(prev)) {
          if (now - tab.updatedAt <= STALE_THRESHOLD) {
            next[id] = tab;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, [currentSheets, broadcast]);

  return { tabId: tabIdRef.current, allTabs };
}
