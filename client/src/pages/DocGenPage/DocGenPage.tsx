import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getAllDocs,
  getDoc,
  getVersions,
  updateDoc,
  autoGenerate,
  deleteDoc,
  updateStatus,
  type DesignDoc,
  type DocCategory,
  type DocStatus,
} from '@client/src/api/doc-gen';
import {
  FileText,
  Loader2,
  AlertTriangle,
  Plus,
  Save,
  History,
  Trash2,
  Sparkles,
  Eye,
  Edit3,
  CheckCircle2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiSkillsPanel } from './AiSkillsPanel';

const CATEGORY_LABELS: Record<string, string> = {
  overview: '系统总览',
  architecture: '系统架构',
  modules: '功能模块',
  api: '接口定义',
  'data-flow': '数据流程',
  'ui-design': 'UI 设计规范',
  'model-strategy': '模型调用策略',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: 'border-border text-muted-foreground bg-muted/30',
  published: 'border-success text-success bg-success/10',
  archived: 'border-warning text-warning bg-warning/10',
};

const SOURCE_LABELS: Record<string, string> = {
  'auto-generated': '自动生成',
  manual: '手动创建',
  'ai-assisted': 'AI 辅助',
};

const DocGenPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'docs' | 'skills'>('docs');
  const [docs, setDocs] = useState<DesignDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DesignDoc | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DesignDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllDocs();
      setDocs(res.items);
      if (res.items.length > 0 && !selectedDoc) {
        setSelectedDoc(res.items[0]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载文档失败';
      setError(msg);
      logger.error('[DocGenPage] loadDocs error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDoc]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleSelectDoc = useCallback((doc: DesignDoc) => {
    setSelectedDoc(doc);
    setEditMode(false);
    setShowVersions(false);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedDoc) return;
    setEditContent(selectedDoc.content);
    setEditTitle(selectedDoc.title);
    setEditMode(true);
  }, [selectedDoc]);

  const handleSave = useCallback(async () => {
    if (!selectedDoc) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateDoc(selectedDoc.docKey, {
        title: editTitle,
        content: editContent,
        source: 'manual',
      });
      setSelectedDoc(res.item);
      setEditMode(false);
      await loadDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
      logger.error('[DocGenPage] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedDoc, editTitle, editContent, loadDocs]);

  const handleAutoGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      await autoGenerate({ overwrite: true });
      await loadDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '自动生成失败';
      setError(msg);
      logger.error('[DocGenPage] autoGenerate error:', err);
    } finally {
      setGenerating(false);
    }
  }, [loadDocs]);

  const handleDelete = useCallback(async () => {
    if (!selectedDoc) return;
    if (!confirm(`确认删除文档「${selectedDoc.title}」及其所有版本？`)) return;
    try {
      await deleteDoc(selectedDoc.docKey);
      setSelectedDoc(null);
      await loadDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      setError(msg);
      logger.error('[DocGenPage] delete error:', err);
    }
  }, [selectedDoc, loadDocs]);

  const handleToggleStatus = useCallback(async () => {
    if (!selectedDoc) return;
    const nextStatus: DocStatus = selectedDoc.status === 'draft' ? 'published' : 'draft';
    try {
      const res = await updateStatus(selectedDoc.docKey, nextStatus);
      setSelectedDoc(res.item);
      await loadDocs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '状态更新失败';
      setError(msg);
      logger.error('[DocGenPage] toggleStatus error:', err);
    }
  }, [selectedDoc, loadDocs]);

  const handleShowVersions = useCallback(async () => {
    if (!selectedDoc) return;
    try {
      const res = await getVersions(selectedDoc.docKey);
      setVersions(res.items);
      setShowVersions(true);
    } catch (err) {
      logger.error('[DocGenPage] getVersions error:', err);
    }
  }, [selectedDoc]);

  const docsByCategory = useMemo(() => {
    const groups: Record<string, DesignDoc[]> = {};
    for (const doc of docs) {
      if (!groups[doc.category]) groups[doc.category] = [];
      groups[doc.category].push(doc);
    }
    return groups;
  }, [docs]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI 设计文档</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              自动生成 + 手动编辑 + 版本管理
            </p>
          </div>
        </div>
        {activeTab === 'docs' && (
          <Button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="rounded-sm"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {generating ? '生成中...' : '一键生成全部'}
          </Button>
        )}
      </div>

      {/* Tab 导航 */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('docs')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'docs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <FileText className="size-4" />
          设计文档
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'skills'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Wand2 className="size-4" />
          AI 分析技能
        </button>
      </div>

      {activeTab === 'skills' ? (
        <AiSkillsPanel />
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-sm border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-error/60 hover:text-error">
                ✕
              </button>
            </div>
          )}

          <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 240px)' }}>
        {/* 左侧文档列表 */}
        <div className="w-64 shrink-0 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="ml-2 text-sm">加载中...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-sm border border-border bg-card p-6 text-center">
              <FileText className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">暂无文档</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                点击「一键生成全部」自动创建
              </p>
            </div>
          ) : (
            Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
              const catDocs = docsByCategory[cat] ?? [];
              if (catDocs.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                    {label}
                  </h3>
                  <div className="space-y-1">
                    {catDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => handleSelectDoc(doc)}
                        className={cn(
                          'w-full text-left rounded-sm px-3 py-2 transition-colors duration-150',
                          'hover:bg-accent/20',
                          selectedDoc?.id === doc.id
                            ? 'bg-primary/10 border border-primary/30'
                            : 'border border-transparent',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{doc.title}</span>
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            v{doc.version}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full px-1.5 py-0 text-[10px] font-normal',
                              STATUS_BADGE_CLASS[doc.status] ?? '',
                            )}
                          >
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {SOURCE_LABELS[doc.source] ?? doc.source}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧文档内容 */}
        <div className="flex-1 min-w-0">
          {selectedDoc ? (
            <div className="bg-card border border-border rounded-sm flex flex-col h-full">
              {/* 文档头 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="min-w-0">
                  {editMode ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-xl font-semibold bg-transparent border-none outline-none w-full"
                    />
                  ) : (
                    <h2 className="text-xl font-semibold truncate">{selectedDoc.title}</h2>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">
                      v{selectedDoc.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[selectedDoc.category] ?? selectedDoc.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(selectedDoc.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
                        版本
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-sm"
                        onClick={handleToggleStatus}
                      >
                        <CheckCircle2 className="size-3.5" />
                        {selectedDoc.status === 'draft' ? '发布' : '撤回'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-sm text-error hover:text-error"
                        onClick={handleDelete}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-sm"
                        onClick={handleStartEdit}
                      >
                        <Edit3 className="size-3.5" />
                        编辑
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* 文档内容 */}
              <div className="flex-1 overflow-y-auto p-5">
                {editMode ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[60vh] font-mono text-sm rounded-sm resize-none"
                    placeholder="输入 Markdown 格式的文档内容..."
                  />
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                      {selectedDoc.content}
                    </pre>
                  </div>
                )}
              </div>

              {/* 版本历史弹层 */}
              {showVersions && (
                <div className="border-t border-border p-4 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">版本历史</h4>
                    <button
                      onClick={() => setShowVersions(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-1">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedDoc(v);
                          setShowVersions(false);
                        }}
                        className={cn(
                          'w-full text-left rounded-sm px-3 py-2 text-sm transition-colors',
                          'hover:bg-accent/20',
                          v.id === selectedDoc.id
                            ? 'bg-primary/10 border border-primary/30'
                            : 'border border-transparent',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono">v{v.version}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(v.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        {v.isLatest && (
                          <Badge
                            variant="outline"
                            className="rounded-full mt-1 text-[10px] border-primary text-primary"
                          >
                            当前版本
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-sm flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="size-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {loading ? '加载中...' : '选择左侧文档查看内容'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default DocGenPage;
