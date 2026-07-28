import React, { useState, useEffect, useCallback } from 'react';

import { datasetApi } from '@/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { SystemStatusResponse } from '@shared/api.interface';

type ChangeType = 'added' | 'optimized' | 'fixed' | 'removed';

interface ChangelogItem {
  type: ChangeType;
  text: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  items: Array<ChangelogItem | string>;
}

const APP_VERSION = 'v1.8.1';

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.8.1',
    date: '2026-07-06',
    items: [
      { type: 'optimized', text: '主页上传时间实时同步（上传后/切回页面/30秒轮询）' },
      { type: 'optimized', text: 'UI 设计 token 统一，KPI 卡片、筛选栏、表格、侧边栏视觉一致' },
      { type: 'optimized', text: '系统更新日志 redesign，支持变更类型标签与版本折叠展示' },
      { type: 'fixed', text: '6月1日 数据因时区偏移被过滤的问题' },
      { type: 'fixed', text: 'getAppPublished 控制台 JSON 解析错误' },
      { type: 'fixed', text: '清理系统更新日志中 v1.8.0 与 v1.7.0/v1.6.0 的重复条目' },
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-06-17',
    items: [
      { type: 'added', text: '费用资料管理模块（expense-profile），支持费用数据上传、覆盖与清空' },
      { type: 'added', text: '临期费用分析看板，含 KPI、趋势图、排名、预警、钻取面板' },
      { type: 'added', text: 'ATP 费用分析页面，支持按月筛选与绩效查看' },
      { type: 'added', text: '费用资料上传组件与快速自定义上传入口' },
      { type: 'added', text: '费用分析相关 API 接口（上传、查询、钻取、预警）' },
      { type: 'added', text: 'expense_profile 数据表结构' },
      { type: 'added', text: '临期费用分析单元测试' },
      { type: 'optimized', text: '数据管理页整合费用资料上传与快速上传入口' },
      { type: 'optimized', text: '前端路由新增 /expiry-expense 与 /atp-expense' },
      { type: 'optimized', text: 'Dashboard 筛选器组件能力扩展' },
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-06-16',
    items: [
      { type: 'added', text: '线路资料管理模块，支持线路信息上传与维护' },
      { type: 'added', text: '规格选项查询接口，支持按品牌和表单类型筛选' },
      { type: 'added', text: '未成交门店查询接口，支持多维度筛选分析' },
      { type: 'added', text: '业代钻取分析接口，支持按业代查看详细数据' },
      { type: 'added', text: '热力图支持线路、规格、表单类型等筛选维度' },
      { type: 'added', text: '客户格式钻取分析功能，支持按区域下钻' },
      { type: 'optimized', text: '过滤业代为空的虚拟服务点，提升数据准确性' },
      { type: 'optimized', text: '扩展筛选器支持品牌、规格、线路等多维度' },
    ],
  },
  {
    version: 'v1.5.1',
    date: '2026-06-12',
    items: [
      { type: 'optimized', text: '下钻表格形态别/品牌别成交率改为横轴标题+纵轴指标布局' },
      { type: 'optimized', text: '形态别与品牌别成交率改为上下展示' },
      { type: 'optimized', text: '统一表格列宽与间距，品牌标题支持换行' },
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-06-12',
    items: [
      { type: 'added', text: '多品牌矩阵导出，品牌列追加客户资料后，成交填1未成交填0' },
      { type: 'added', text: '未成交单元格红色背景+白色加粗样式标记' },
      { type: 'added', text: '多品牌筛选逻辑，任一品牌未成交即保留该门店' },
      { type: 'fixed', text: '导出Excel按所别分Sheet（此前误按层级分组）' },
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-06-11',
    items: [
      { type: 'optimized', text: '未成交门店查询改为数据库层过滤，显著降低内存占用' },
      { type: 'optimized', text: '数据去重改为索引列查询，告别全表 MD5 计算' },
      { type: 'optimized', text: '热力图数据查询使用 SQL 去重，减少传输量' },
      { type: 'optimized', text: '前端 Excel 库按需加载，首屏体积减少约 300KB' },
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-06-11',
    items: [
      { type: 'added', text: '上传数据按月份合并覆盖，只替换涉及月份数据' },
      { type: 'fixed', text: '上传数据后历史月份记录丢失问题' },
      { type: 'optimized', text: '上传预检显示覆盖月份范围' },
      { type: 'optimized', text: '移除重复数据检测模块，简化上传流程' },
    ],
  },
  {
    version: 'v1.2.1',
    date: '2026-06-10',
    items: [
      { type: 'optimized', text: '分析看板默认按当月加载数据，减轻系统计算压力' },
      { type: 'optimized', text: '热力图与未成交门店查询增加 SQL 层日期过滤' },
      { type: 'optimized', text: '兼容日期格式（点号/斜杠/横杠）的筛选条件' },
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-06-10',
    items: [
      { type: 'added', text: '业代月度成交率导出功能（含颜色规则）' },
      { type: 'added', text: '未成交门店下载功能' },
      { type: 'fixed', text: '未成交门店筛选日期判定逻辑' },
      { type: 'optimized', text: '成交分析热力图交互体验' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-06-06',
    items: [
      { type: 'added', text: '成交分析看板（业代月度成交率热力图）' },
      { type: 'added', text: '客户分类汇总与门店格式统计' },
      { type: 'added', text: '多维度筛选器（区域/阶层/经销商类型/品牌/业代）' },
      { type: 'optimized', text: '数据上传解析流程' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-06-03',
    items: [
      { type: 'added', text: '初始版本：数据管理、客户资料管理、数据分析看板' },
      { type: 'added', text: '支持 Excel 模板下载与数据上传' },
      { type: 'added', text: '支持客户资料批量导入与管理' },
    ],
  },
];

function parseChangelogItem(item: ChangelogItem | string): ChangelogItem {
  if (typeof item !== 'string') {
    return item;
  }

  const prefixMap: Record<string, ChangeType> = {
    '新增': 'added',
    '优化': 'optimized',
    '修复': 'fixed',
    '删除': 'removed',
  };

  const match = item.match(/^([^：:]+)[：:]\s*(.+)$/);
  if (match && match[1] in prefixMap) {
    return { type: prefixMap[match[1]], text: match[2] };
  }

  return { type: 'optimized', text: item };
}

function formatDateTime(value: string | null): string {
  if (!value) return '暂无记录';
  try {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '暂无记录';
  }
}

interface ChangeTypeTagProps {
  type: ChangeType;
}

const ChangeTypeTag: React.FC<ChangeTypeTagProps> = ({ type }) => {
  const config: Record<
    ChangeType,
    { label: string; icon: string; classes: string }
  > = {
    added: {
      label: '新增',
      icon: '+',
      classes: 'text-success bg-success/10 border-success/20',
    },
    optimized: {
      label: '优化',
      icon: '↑',
      classes: 'text-primary bg-primary/10 border-primary/20',
    },
    fixed: {
      label: '修复',
      icon: '🔧',
      classes: 'text-warning bg-warning/10 border-warning/20',
    },
    removed: {
      label: '删除',
      icon: '−',
      classes: 'text-error bg-error/10 border-error/20',
    },
  };

  const { label, icon, classes } = config[type];

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded-full border ${classes}`}
    >
      <span className="leading-none">{icon}</span>
      <span className="leading-none">{label}</span>
    </span>
  );
};

interface VersionSummaryProps {
  items: ChangelogItem[];
}

const VersionSummary: React.FC<VersionSummaryProps> = ({ items }) => {
  const counts = items.reduce(
    (acc, item) => {
      acc[item.type] += 1;
      return acc;
    },
    { added: 0, optimized: 0, fixed: 0, removed: 0 }
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-muted-foreground">本次变更</span>
      <span className="font-mono tabular-nums text-success">新增 {counts.added}</span>
      <span className="text-border">·</span>
      <span className="font-mono tabular-nums text-primary">优化 {counts.optimized}</span>
      <span className="text-border">·</span>
      <span className="font-mono tabular-nums text-warning">修复 {counts.fixed}</span>
      <span className="text-border">·</span>
      <span className="font-mono tabular-nums text-error">删除 {counts.removed}</span>
    </div>
  );
};

const UpdateLog: React.FC = () => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(() => {
    if (CHANGELOG.length === 0) return new Set<string>();
    return new Set<string>([CHANGELOG[0].version]);
  });

  const toggleVersion = useCallback((version: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }, []);

  const loadStatus = useCallback(() => {
    datasetApi
      .getSystemStatus()
      .then(setStatus)
      .catch((err: unknown) => {
        logger.error('Failed to load system status:', err);
      });
  }, []);

  useEffect(() => {
    loadStatus();

    const handleRefresh = () => loadStatus();
    window.addEventListener('system-status-refresh', handleRefresh);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = setInterval(loadStatus, 30000);

    return () => {
      window.removeEventListener('system-status-refresh', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [loadStatus]);

  const parsedChangelog = CHANGELOG.map((entry) => ({
    ...entry,
    parsedItems: entry.items.map(parseChangelogItem),
  }));

  const latestEntry = parsedChangelog[0];

  return (
    <div className="bg-card border border-border rounded-sm">
      <button
        type="button"
        onClick={() => setPanelExpanded(!panelExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/30 transition-colors duration-150 ease-out"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center text-base leading-none text-primary">📦</span>
          <h3 className="text-sm font-bold text-foreground">
            系统更新日志
          </h3>
          <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm">
            {APP_VERSION}
          </span>
        </div>
        <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground">
          {panelExpanded ? '▲' : '▼'}
        </span>
      </button>

      {panelExpanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 bg-accent/30 rounded-sm p-3 border border-border">
              <span className="inline-flex items-center justify-center text-base leading-none text-primary mt-0.5 shrink-0">🕒</span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">客户资料最近更新</p>
                <p className="text-sm font-bold font-mono text-green-700 bg-green-50 px-1.5 py-0.5 rounded-sm inline-block mt-0.5">
                  {formatDateTime(status?.latestCustomerUpdatedAt ?? null)}
                </p>
                {status?.totalCustomers != null && status.totalCustomers > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    共 {status.totalCustomers.toLocaleString()} 条记录
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-accent/30 rounded-sm p-3 border border-border">
              <span className="inline-flex items-center justify-center text-base leading-none text-primary mt-0.5 shrink-0">⬆️</span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">销售数据最近上传</p>
                <p className="text-sm font-bold font-mono text-green-700 bg-green-50 px-1.5 py-0.5 rounded-sm inline-block mt-0.5">
                  {formatDateTime(status?.latestDatasetCreatedAt ?? null)}
                </p>
                {status?.latestDatasetName && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" title={status.latestDatasetName}>
                    {status.latestDatasetName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {latestEntry && (
            <div className="bg-accent/20 rounded-sm p-3 border border-border">
              <VersionSummary items={latestEntry.parsedItems} />
            </div>
          )}

          <div className="relative space-y-0">
            <div className="absolute left-[4px] top-1.5 bottom-1.5 border-l-2 border-border" />

            {parsedChangelog.map((entry, index) => {
              const isLatest = index === 0;
              const isExpanded = expandedVersions.has(entry.version);
              const itemCount = entry.parsedItems.length;

              return (
                <div key={entry.version} className="relative pl-6 pb-4 last:pb-0">
                  <div
                    className={`absolute left-0 top-1.5 size-2.5 rounded-full border-2 border-card ${
                      isLatest ? 'bg-primary' : 'bg-muted-foreground'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => toggleVersion(entry.version)}
                    className="flex items-center gap-2 w-full group"
                  >
                    <span className="text-xs font-mono font-medium text-foreground">
                      {entry.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.date}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">
                      ({itemCount} 项)
                    </span>
                    <span className="inline-flex items-center justify-center text-xs leading-none text-muted-foreground transition-transform duration-150 ease-out group-hover:text-foreground">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-150 ease-out ${
                      isExpanded ? 'max-h-[800px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
                    }`}
                  >
                    <ul className="space-y-1.5">
                      {entry.parsedItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChangeTypeTag type={item.type} />
                          <span className="text-xs text-foreground leading-relaxed">
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateLog;
