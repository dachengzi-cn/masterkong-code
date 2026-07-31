import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getSkills,
  updateSkill,
  type AiSkillItem,
} from '@client/src/api/ai-analysis';
import {
  Loader2,
  Save,
  Wand2,
  Zap,
  AlertTriangle,
  Code2,
  History,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  saveVersionCache,
  readCache,
  deleteVersionCache,
  type CachedVersionEntry,
} from './version-cache';

const PAGE_SCOPE_LABELS: Record<string, string> = {
  customers: '客户总览',
  expense: '费用总览',
  'service-analysis': '服务点数分析',
  'dashboard/cumulative': '累计成交分析',
  'dashboard/daily': '当日成交分析',
  'dashboard/brand-spec': '品牌规格分析',
  'expense/expiry': '临期费用分析',
  'expense/atp': 'ATP费用分析',
  'expense/overstock': '压货分析',
  global: '通用',
};

type SkillSnapshot = {
  name: string;
  description: string | null;
  promptTemplate: string;
  outputSchema: Record<string, unknown>;
  maxTokens: number;
  version: number;
};

export const AiSkillsPanel: React.FC = () => {
  const [skills, setSkills] = useState<AiSkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<AiSkillItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editMaxTokens, setEditMaxTokens] = useState(4096);
  const [editVersionLabel, setEditVersionLabel] = useState('');

  // 版本历史
  const [showVersions, setShowVersions] = useState(false);
  const [cachedVersions, setCachedVersions] = useState<CachedVersionEntry<SkillSnapshot>[]>([]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSkills();
      setSkills(res.items);
      if (res.items.length > 0 && !selectedSkill) {
        setSelectedSkill(res.items[0]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载技能列表失败';
      setError(msg);
      logger.error('[AiSkillsPanel] loadSkills error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSkill]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // 加载选中技能的缓存版本
  useEffect(() => {
    if (selectedSkill) {
      const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
      setCachedVersions(cached);
    } else {
      setCachedVersions([]);
    }
    setShowVersions(false);
  }, [selectedSkill]);

  const handleSelectSkill = useCallback((skill: AiSkillItem) => {
    setSelectedSkill(skill);
    setEditMode(false);
    setError(null);
    setSuccessMsg(null);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedSkill) return;
    setEditName(selectedSkill.name);
    setEditDescription(selectedSkill.description ?? '');
    setEditPrompt(selectedSkill.promptTemplate);
    setEditMaxTokens(selectedSkill.maxTokens ?? 4096);
    setEditVersionLabel(`v${selectedSkill.version + 1}`);
    setEditMode(true);
    setSuccessMsg(null);
  }, [selectedSkill]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill) return;
    setSaving(true);
    setError(null);
    try {
      // 保存编辑前的快照到缓存
      const snapshot: SkillSnapshot = {
        name: selectedSkill.name,
        description: selectedSkill.description,
        promptTemplate: selectedSkill.promptTemplate,
        outputSchema: selectedSkill.outputSchema,
        maxTokens: selectedSkill.maxTokens,
        version: selectedSkill.version,
      };
      saveVersionCache<SkillSnapshot>(
        'skill',
        selectedSkill.skillKey,
        selectedSkill.version,
        snapshot,
        `v${selectedSkill.version}`,
      );

      const res = await updateSkill(selectedSkill.skillKey, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        promptTemplate: editPrompt,
        maxTokens: editMaxTokens,
      });
      setSelectedSkill(res.item);
      setEditMode(false);
      setSuccessMsg(`技能保存成功，版本已存档（${editVersionLabel || `v${res.item.version}`}）`);

      // 刷新缓存列表
      const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
      setCachedVersions(cached);

      await loadSkills();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
      logger.error('[AiSkillsPanel] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedSkill, editName, editDescription, editPrompt, editMaxTokens, editVersionLabel, loadSkills]);

  const handleShowVersions = useCallback(() => {
    if (!selectedSkill) return;
    const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
    setCachedVersions(cached);
    setShowVersions((prev) => !prev);
  }, [selectedSkill]);

  const handleRestoreVersion = useCallback((entry: CachedVersionEntry<SkillSnapshot>) => {
    const snap = entry.snapshot;
    setEditName(snap.name);
    setEditDescription(snap.description ?? '');
    setEditPrompt(snap.promptTemplate);
    setEditMaxTokens(snap.maxTokens);
    setEditVersionLabel(`v${snap.version}`);
    setEditMode(true);
    setShowVersions(false);
    setSuccessMsg(`已加载历史版本 ${entry.customLabel ?? `v${entry.version}`}，修改后保存将创建新版本`);
  }, []);

  const handleDeleteCachedVersion = useCallback((cacheId: string) => {
    if (!selectedSkill) return;
    deleteVersionCache('skill', selectedSkill.skillKey, cacheId);
    const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
    setCachedVersions(cached);
  }, [selectedSkill]);

  // 按页面分组
  const skillsByPage = React.useMemo(() => {
    const groups: Record<string, AiSkillItem[]> = {};
    for (const skill of skills) {
      const key = skill.pageScope || 'global';
      if (!groups[key]) groups[key] = [];
      groups[key].push(skill);
    }
    return groups;
  }, [skills]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Wand2 className="size-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">AI 分析技能</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              查看 · 修改 · 优化分析技能 · 版本存档管理
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full px-3 py-1">
          共 {skills.length} 个技能
        </Badge>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-sm border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-error/60 hover:text-error">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 p-3 text-sm text-success">
          <Zap className="size-4 shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-success/60 hover:text-success">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {/* 左侧技能列表 */}
        <div className="w-full lg:w-72 lg:shrink-0 space-y-3 max-h-[300px] lg:max-h-none overflow-y-auto lg:overflow-visible">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="ml-2 text-sm">加载中...</span>
            </div>
          ) : skills.length === 0 ? (
            <div className="rounded-sm border border-border bg-card p-6 text-center">
              <Wand2 className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">暂无技能</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                技能在系统启动时自动初始化
              </p>
            </div>
          ) : (
            Object.entries(skillsByPage).map(([pageScope, pageSkills]) => (
              <div key={pageScope}>
                <h3 className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                  {PAGE_SCOPE_LABELS[pageScope] ?? pageScope}
                </h3>
                <div className="space-y-1">
                  {pageSkills.map((skill) => {
                    const cachedCount = readCache('skill', skill.skillKey).length;
                    return (
                      <button
                        key={skill.id}
                        onClick={() => handleSelectSkill(skill)}
                        className={cn(
                          'w-full text-left rounded-sm px-3 py-2 transition-colors duration-150',
                          'hover:bg-accent/20',
                          selectedSkill?.id === skill.id
                            ? 'bg-primary/10 border border-primary/30'
                            : 'border border-transparent',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{skill.name}</span>
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            v{skill.version}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {skill.isBuiltin && (
                            <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] font-normal">
                              内置
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {skill.maxTokens} tokens
                          </span>
                          {cachedCount > 0 && (
                            <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] font-normal text-primary border-primary/30">
                              {cachedCount} 版存档
                            </Badge>
                          )}
                        </div>
                        {skill.description && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                            {skill.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 右侧技能详情/编辑 */}
        <div className="flex-1 min-w-0">
          {selectedSkill ? (
            <div className="bg-card border border-border rounded-sm flex flex-col h-full">
              {/* 技能头 */}
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
                <div className="min-w-0 flex-1">
                  {editMode ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-lg sm:text-xl font-semibold h-8"
                      placeholder="技能名称"
                    />
                  ) : (
                    <h2 className="text-lg sm:text-xl font-semibold truncate">{selectedSkill.name}</h2>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">
                      v{selectedSkill.version}
                    </span>
                    <Badge variant="outline" className="rounded-full text-[10px] font-normal">
                      {PAGE_SCOPE_LABELS[selectedSkill.pageScope] ?? selectedSkill.pageScope}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      key: {selectedSkill.skillKey}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(selectedSkill.updatedAt ?? '').toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {editMode ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-sm"
                        onClick={() => setEditMode(false)}
                        disabled={saving}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-sm"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        保存
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-sm"
                        onClick={handleShowVersions}
                      >
                        <History className="size-3.5" />
                        版本({cachedVersions.length})
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-sm"
                        onClick={handleStartEdit}
                      >
                        <Wand2 className="size-3.5" />
                        优化编辑
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* 技能内容 */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* 自定义版本号 (仅编辑模式) */}
                {editMode && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">版本号（自定义标识）</Label>
                    <Input
                      value={editVersionLabel}
                      onChange={(e) => setEditVersionLabel(e.target.value)}
                      placeholder="例如 v2.1、v3-优化版"
                      className="h-8 rounded-sm w-48 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      保存时将作为版本标识存档，便于后续回溯
                    </p>
                  </div>
                )}

                {/* 描述 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">技能描述</Label>
                  {editMode ? (
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="描述该技能的用途与分析范围"
                      className="h-8 rounded-sm"
                    />
                  ) : (
                    <p className="text-sm text-foreground/80">
                      {selectedSkill.description ?? '暂无描述'}
                    </p>
                  )}
                </div>

                {/* Max Tokens */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">最大 Token 数</Label>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editMaxTokens}
                      onChange={(e) => setEditMaxTokens(Number(e.target.value) || 4096)}
                      className="h-8 rounded-sm w-40 font-mono"
                      min={256}
                      max={32768}
                    />
                  ) : (
                    <p className="text-sm font-mono">{selectedSkill.maxTokens}</p>
                  )}
                </div>

                {/* 输出 Schema 预览 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Code2 className="size-3.5" />
                    输出 Schema
                  </Label>
                  <pre className="rounded-sm border border-border bg-muted/30 p-3 text-xs font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(selectedSkill.outputSchema, null, 2)}
                  </pre>
                </div>

                {/* Prompt 模板 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Prompt 模板
                    <span className="ml-2 text-muted-foreground/60">
                      支持占位符：{`{{inputData}}`} {`{{userQuestion}}`}
                    </span>
                  </Label>
                  {editMode ? (
                    <Textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      className="min-h-[40vh] font-mono text-xs rounded-sm resize-y"
                      placeholder="输入 Prompt 模板..."
                    />
                  ) : (
                    <pre className="rounded-sm border border-border bg-muted/30 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                      {selectedSkill.promptTemplate}
                    </pre>
                  )}
                </div>
              </div>

              {/* 版本历史弹层 */}
              {showVersions && (
                <div className="border-t border-border p-3 sm:p-4 max-h-72 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">
                      版本历史（{cachedVersions.length} 个存档）
                    </h4>
                    <button
                      onClick={() => setShowVersions(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                  {cachedVersions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      暂无存档版本，编辑保存后将自动创建版本存档
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {cachedVersions.map((entry) => (
                        <div
                          key={entry.cacheId}
                          className="flex items-center justify-between rounded-sm px-3 py-2 text-sm border border-transparent hover:bg-accent/20 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-medium shrink-0">
                              {entry.customLabel ?? `v${entry.version}`}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {new Date(entry.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleRestoreVersion(entry)}
                            >
                              <RotateCcw className="size-3" />
                              恢复
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-error hover:text-error"
                              onClick={() => handleDeleteCachedVersion(entry.cacheId)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-sm flex items-center justify-center h-full">
              <div className="text-center">
                <Wand2 className="size-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {loading ? '加载中...' : '选择左侧技能查看详情'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
