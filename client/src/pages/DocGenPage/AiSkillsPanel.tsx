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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
    setEditMode(true);
    setSuccessMsg(null);
  }, [selectedSkill]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateSkill(selectedSkill.skillKey, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        promptTemplate: editPrompt,
        maxTokens: editMaxTokens,
      });
      setSelectedSkill(res.item);
      setEditMode(false);
      setSuccessMsg('技能保存成功，版本已更新');
      await loadSkills();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
      logger.error('[AiSkillsPanel] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedSkill, editName, editDescription, editPrompt, editMaxTokens, loadSkills]);

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
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wand2 className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI 分析技能</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              查看 · 修改 · 优化分析技能，技能参数持久化存储
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

      <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {/* 左侧技能列表 */}
        <div className="w-72 shrink-0 space-y-3 overflow-y-auto">
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
                  {pageSkills.map((skill) => (
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
                      </div>
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          {skill.description}
                        </p>
                      )}
                    </button>
                  ))}
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
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="min-w-0">
                  {editMode ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-xl font-semibold h-8"
                      placeholder="技能名称"
                    />
                  ) : (
                    <h2 className="text-xl font-semibold truncate">{selectedSkill.name}</h2>
                  )}
                  <div className="flex items-center gap-3 mt-1">
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
                    <Button
                      size="sm"
                      className="rounded-sm"
                      onClick={handleStartEdit}
                    >
                      <Wand2 className="size-3.5" />
                      优化编辑
                    </Button>
                  )}
                </div>
              </div>

              {/* 技能内容 */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
