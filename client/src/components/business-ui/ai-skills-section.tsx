import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getSkills,
  getModuleMapping,
  updateSkill,
  type AiSkillItem,
  type ModuleRegistryGroup,
  type ModuleRegistrySkill,
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
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
  Info,
  CircleDashed,
  CircleCheck,
  Clock3,
  Lightbulb,
  BookOpen,
  Blocks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  saveVersionCache,
  readCache,
  deleteVersionCache,
  type CachedVersionEntry,
} from '@/lib/version-cache';

type SkillSnapshot = {
  name: string;
  description: string | null;
  promptTemplate: string;
  outputSchema: Record<string, unknown>;
  maxTokens: number;
  version: number;
};

/** 可视化构建：任务预设池 */
const TASK_PRESETS = [
  { id: 'trend', label: '整体趋势', hint: '核心指标变化趋势，识别拐点', template: '{n}. **整体趋势**：总结核心指标的变化趋势，识别增长/下滑拐点' },
  { id: 'rank', label: '排名对比', hint: 'Top/Bottom 表现差异', template: '{n}. **排名对比**：分析 top/bottom 表现差异，找出关键驱动因素' },
  { id: 'anomaly', label: '异常波动', hint: '突变日期与可能原因', template: '{n}. **异常波动**：识别指标突变（如日环比 >15%）的日期与可能原因' },
  { id: 'distribution', label: '分布结构', hint: '结构占比与集中度', template: '{n}. **分布分析**：分析各项指标的分布结构与集中度' },
  { id: 'rhythm', label: '节奏规律', hint: '周末效应/旬度节奏', template: '{n}. **节奏规律**：分析时间维度上的节奏变化规律（如周末效应、旬度节奏）' },
  { id: 'risk', label: '风险预警', hint: '高/中/低风险处置', template: '{n}. **风险预警**：识别高/中/低风险项并给出处置建议' },
  { id: 'opportunity', label: '机会识别', hint: '潜力品类/区域', template: '{n}. **机会识别**：找出潜力大但覆盖率低的品类/区域，给出推广建议' },
  { id: 'action', label: '行动建议', hint: '3-5 条可执行建议', template: '{n}. **行动建议**：基于以上分析给出 3-5 条可执行的业务行动建议' },
] as const;

const ROLE_PRESETS = [
  { id: 'data', label: '数据分析专家', value: '专业的快消品数据分析专家' },
  { id: 'category', label: '品类管理专家', value: '专业的快消品品类管理专家' },
  { id: 'expense', label: '费用管理专家', value: '专业的快消品费用管理专家' },
  { id: 'business', label: '通用业务分析师', value: '资深快消行业业务分析师' },
] as const;

const DATA_TYPE_PRESETS = [
  { id: 'cumulative', label: '累计成交分析数据', value: '累计成交分析数据' },
  { id: 'daily', label: '当日成交分析数据', value: '当日成交分析数据' },
  { id: 'brand-spec', label: '品牌 & 规格成交分析数据', value: '品牌 & 规格成交分析数据' },
  { id: 'expiry', label: '临期费用分析数据', value: '临期费用分析数据' },
  { id: 'atp', label: 'ATP费用绩效分析数据', value: 'ATP费用绩效分析数据' },
  { id: 'general', label: '业务数据', value: '业务数据' },
] as const;

const HELP_STEPS = [
  {
    title: '1. 技能是什么？',
    content: 'AI 分析技能是每个分析模块的"分析大脑"，定义了 AI 用什么视角、分析哪些维度、以什么格式输出结果。',
  },
  {
    title: '2. 修改后何时生效？',
    content: '保存后立即生效。每次执行分析时系统都会实时从数据库读取最新技能配置，无需重启或手动刷新。',
  },
  {
    title: '3. 如何调整分析重点？',
    content: '点击"优化编辑"→ 在"任务生成器"中勾选/取消分析任务（如趋势、排名、风险预警），或直接修改 Prompt 原文。',
  },
  {
    title: '4. 如何回到旧版本？',
    content: '每次保存都会自动生成一个版本存档（存于本机）。在"版本历史"中可一键恢复任意历史版本。',
  },
  {
    title: '5. 输出格式怎么控制？',
    content: '"输出 Schema"定义了 AI 返回的 JSON 结构。通常无需修改；如需调整，可编辑 Schema 或让 AI 按 Prompt 中"输出要求"执行。',
  },
];

export const AiSkillsSection: React.FC = () => {
  const [skills, setSkills] = useState<AiSkillItem[]>([]);
  const [moduleGroups, setModuleGroups] = useState<ModuleRegistryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<AiSkillItem | null>(null);
  const [selectedModuleScope, setSelectedModuleScope] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editMaxTokens, setEditMaxTokens] = useState(4096);
  const [editVersionLabel, setEditVersionLabel] = useState('');

  // 可视化构建器状态
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(ROLE_PRESETS[0].value);
  const [selectedDataType, setSelectedDataType] = useState<string>(DATA_TYPE_PRESETS[0].value);
  const [builderDirty, setBuilderDirty] = useState(false);

  // 版本历史
  const [showVersions, setShowVersions] = useState(false);
  const [cachedVersions, setCachedVersions] = useState<CachedVersionEntry<SkillSnapshot>[]>([]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, modulesRes] = await Promise.all([getSkills(), getModuleMapping()]);
      setSkills(skillsRes.items);
      setModuleGroups(modulesRes.groups);
      if (skillsRes.items.length > 0 && !selectedSkill) {
        setSelectedSkill(skillsRes.items[0]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载技能列表失败';
      setError(msg);
      logger.error('[AiSkillsSection] loadSkills error:', err);
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

  /** 模块映射统计 */
  const mappingStats = useMemo(() => {
    let withSkill = 0;
    let total = 0;
    for (const group of moduleGroups) {
      for (const mod of group.modules) {
        total += 1;
        if (mod.skills.length > 0) withSkill += 1;
      }
    }
    return { withSkill, total };
  }, [moduleGroups]);

  /** 将模块映射转换为扁平列表（用于左侧选择） */
  const moduleList = useMemo(() => {
    const list: Array<{
      pageScope: string;
      name: string;
      icon: string;
      description: string;
      groupName: string;
      groupIcon: string;
      skills: ModuleRegistrySkill[];
    }> = [];
    for (const group of moduleGroups) {
      for (const mod of group.modules) {
        list.push({
          pageScope: mod.pageScope,
          name: mod.name,
          icon: mod.icon,
          description: mod.description,
          groupName: group.groupName,
          groupIcon: group.icon,
          skills: mod.skills,
        });
      }
    }
    return list;
  }, [moduleGroups]);

  const handleSelectModule = useCallback((pageScope: string) => {
    setSelectedModuleScope(pageScope);
    setEditMode(false);
    setError(null);
    setSuccessMsg(null);
    const module = moduleList.find((m) => m.pageScope === pageScope);
    if (module && module.skills.length > 0) {
      const skill = skills.find((s) => s.skillKey === module.skills[0].skillKey);
      if (skill) setSelectedSkill(skill);
    } else {
      setSelectedSkill(null);
    }
  }, [moduleList, skills]);

  const handleSelectSkill = useCallback((skill: AiSkillItem) => {
    setSelectedSkill(skill);
    setSelectedModuleScope(skill.pageScope || 'global');
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

    // 尝试从现有 Prompt 解析出已选任务与角色
    const keywordMap: Record<string, string[]> = {
      trend: ['整体趋势', '趋势分析'],
      rank: ['排名', 'top/bottom', '表现差异'],
      anomaly: ['异常波动', '异常', '突变'],
      distribution: ['分布', '占比'],
      rhythm: ['节奏', '周末'],
      risk: ['风险预警', '风险'],
      opportunity: ['机会', '潜力'],
      action: ['行动建议', '建议'],
    };
    const matched = TASK_PRESETS.filter((t) =>
      (keywordMap[t.id] ?? []).some((kw) => selectedSkill.promptTemplate.includes(kw)),
    ).map((t) => t.id);
    setSelectedTasks(matched);

    // 检测角色
    const roleMatch = ROLE_PRESETS.find((r) => selectedSkill.promptTemplate.includes(r.value));
    setSelectedRole(roleMatch?.value ?? ROLE_PRESETS[0].value);

    // 检测数据类型
    const dataMatch = DATA_TYPE_PRESETS.find((d) => selectedSkill.promptTemplate.includes(d.value));
    setSelectedDataType(dataMatch?.value ?? DATA_TYPE_PRESETS[0].value);

    setBuilderDirty(false);
    setEditMode(true);
    setSuccessMsg(null);
  }, [selectedSkill]);

  /** 根据可视化构建器选项生成 Prompt */
  const generatePrompt = useCallback(() => {
    const taskLines = TASK_PRESETS.filter((t) => selectedTasks.includes(t.id))
      .map((t, i) => t.template.replace('{n}', String(i + 1)))
      .join('\n');
    const prompt = `你是一位${selectedRole}。请基于以下${selectedDataType}，进行深度洞察。

## 分析任务
${taskLines || '1. **整体概览**：总结数据核心特征，识别关键问题点'}

## 输入数据
{{inputData}}

## 用户问题
{{userQuestion}}

## 输出要求
请以 JSON 格式返回，包含以下字段：
{
  "summary": "整体分析摘要（200字以内）",
  "keyFindings": ["关键发现1", "关键发现2"],
  "recommendations": ["建议1", "建议2", "建议3"],
  "riskAlerts": [{"level": "high/medium/low", "description": "风险描述", "action": "建议行动"}]
}`;
    return prompt;
  }, [selectedTasks, selectedRole, selectedDataType]);

  /** 将生成器输出应用到 Prompt 编辑框 */
  const applyGeneratedPrompt = useCallback(() => {
    const prompt = generatePrompt();
    setEditPrompt(prompt);
    setBuilderDirty(true);
  }, [generatePrompt]);

  const toggleTask = useCallback((taskId: string) => {
    setSelectedTasks((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }, []);

  const insertPlaceholder = useCallback((ph: string) => {
    setEditPrompt((prev) => prev + (prev.endsWith('\n') || prev.length === 0 ? '' : '\n') + ph);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedSkill) return;
    if (!editName.trim()) {
      setError('技能名称不能为空');
      return;
    }
    if (!editPrompt.trim()) {
      setError('Prompt 模板不能为空');
      return;
    }
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
      setBuilderDirty(false);
      setSuccessMsg(
        `✓ 技能已保存为 ${editVersionLabel || `v${res.item.version}`}，已立即生效（下次分析自动使用新配置）`,
      );

      // 刷新缓存列表
      const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
      setCachedVersions(cached);

      await loadSkills();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(`保存失败：${msg}`);
      logger.error('[AiSkillsSection] save error:', err);
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
    setSuccessMsg(`已载入历史版本 ${entry.customLabel ?? `v${entry.version}`}，点击保存后立即生效`);
  }, []);

  const handleDeleteCachedVersion = useCallback((cacheId: string) => {
    if (!selectedSkill) return;
    deleteVersionCache('skill', selectedSkill.skillKey, cacheId);
    const cached = readCache<SkillSnapshot>('skill', selectedSkill.skillKey);
    setCachedVersions(cached);
  }, [selectedSkill]);

  /** 当前选中模块（根据 selectedSkill 或 selectedModuleScope） */
  const activeModule = useMemo(() => {
    const scope = selectedSkill?.pageScope || selectedModuleScope;
    return moduleList.find((m) => m.pageScope === scope) ?? null;
  }, [moduleList, selectedSkill, selectedModuleScope]);

  return (
    <div className="space-y-4">
      {/* 分区标题 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Blocks className="size-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">AI 分析技能</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              技能 ↔ 分析模块映射 · 可视化编辑 · 版本管理
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">
            共 {skills.length} 个技能
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'rounded-full px-3 py-1',
              mappingStats.withSkill === mappingStats.total
                ? 'border-success text-success bg-success/10'
                : 'border-warning text-warning bg-warning/10',
            )}
          >
            {mappingStats.withSkill}/{mappingStats.total} 模块已接入
          </Badge>
        </div>
      </div>

      {/* 帮助横幅 */}
      <div className="rounded-sm border border-primary/20 bg-primary/5 overflow-hidden">
        <button
          onClick={() => setShowHelp((prev) => !prev)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
        >
          <BookOpen className="size-4 text-primary" />
          <span className="font-medium">使用帮助 · 新手引导</span>
          <span className="text-xs text-muted-foreground ml-1">点击{showHelp ? '收起' : '展开'}</span>
          {showHelp ? (
            <ChevronUp className="size-4 ml-auto text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 ml-auto text-muted-foreground" />
          )}
        </button>
        {showHelp && (
          <div className="px-4 py-3 space-y-3 border-t border-primary/15">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HELP_STEPS.map((step) => (
                <div key={step.title} className="flex items-start gap-2">
                  <Info className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-sm bg-background/60 border border-border p-3">
              <Zap className="size-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">实时生效原理：</span>
                技能配置保存在服务端数据库（ai_skill 表）。每次执行 AI 分析时，系统都会实时查询数据库获取最新配置，
                因此任何修改保存后<b>立即生效</b>，无需重启服务、无需清理缓存。
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="rounded-sm">
          <AlertTriangle className="size-4" />
          <AlertTitle>操作提示</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <button onClick={() => setError(null)} className="ml-auto text-error/60 hover:text-error shrink-0">
            ✕
          </button>
        </Alert>
      )}

      {successMsg && (
        <Alert className="rounded-sm border-success/30 bg-success/5">
          <CheckCircle2 className="size-4 text-success" />
          <AlertDescription className="text-success">{successMsg}</AlertDescription>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-success/60 hover:text-success shrink-0">
            ✕
          </button>
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* 左侧：模块映射树 */}
        <div className="w-full lg:w-72 lg:shrink-0 space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="ml-2 text-sm">加载中...</span>
            </div>
          ) : moduleGroups.length === 0 ? (
            <div className="rounded-sm border border-border bg-card p-6 text-center">
              <Blocks className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">暂无模块</p>
            </div>
          ) : (
            <div className="space-y-3">
              {moduleGroups.map((group) => (
                <div key={group.groupId}>
                  <div className="flex items-center gap-1.5 px-1 mb-1">
                    <span className="text-sm leading-none">{group.icon}</span>
                    <h4 className="text-xs font-semibold text-foreground">{group.groupName}</h4>
                    <span className="text-[10px] text-muted-foreground">
                      ({group.modules.filter((m) => m.skills.length > 0).length}/{group.modules.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.modules.map((mod) => {
                      const isActive =
                        (selectedSkill?.pageScope || selectedModuleScope) === mod.pageScope;
                      const hasSkill = mod.skills.length > 0;
                      return (
                        <button
                          key={mod.pageScope}
                          onClick={() => handleSelectModule(mod.pageScope)}
                          className={cn(
                            'w-full text-left rounded-sm px-2.5 py-2 transition-colors duration-150 border',
                            'hover:bg-accent/20',
                            isActive
                              ? 'bg-primary/10 border-primary/30'
                              : 'border-transparent',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm leading-none">{mod.icon}</span>
                            <span className="text-sm font-medium truncate flex-1">{mod.name}</span>
                            {hasSkill ? (
                              <CircleCheck className="size-3.5 text-success shrink-0" />
                            ) : (
                              <CircleDashed className="size-3.5 text-muted-foreground/50 shrink-0" />
                            )}
                          </div>
                          {mod.skills.length > 0 ? (
                            <div className="flex items-center gap-1.5 mt-1 pl-6">
                              <Wand2 className="size-3 text-primary" />
                              <span className="text-[11px] text-muted-foreground truncate">
                                {mod.skills[0].name}
                                <span className="text-muted-foreground/60 font-mono ml-1">
                                  v{mod.skills[0].version}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-1 pl-6">
                              <CircleDashed className="size-3 text-muted-foreground/40" />
                              <span className="text-[11px] text-muted-foreground/50">
                                未接入技能（可在该模块页使用 AI 分析）
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：技能详情 / 编辑 */}
        <div className="flex-1 min-w-0">
          {selectedSkill ? (
            <div className="bg-card border border-border rounded-sm flex flex-col">
              {/* 技能头 */}
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="min-w-0 flex-1">
                  {editMode ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-base font-semibold h-8"
                      placeholder="技能名称"
                    />
                  ) : (
                    <h4 className="text-base font-semibold truncate">{selectedSkill.name}</h4>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">
                      v{selectedSkill.version}
                    </span>
                    {activeModule && (
                      <Badge variant="outline" className="rounded-full text-[10px] font-normal">
                        {activeModule.groupIcon} {activeModule.name}
                      </Badge>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground font-mono cursor-help underline decoration-dotted underline-offset-2">
                            key: {selectedSkill.skillKey}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>技能唯一标识，用于 API 调用</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-xs text-muted-foreground">
                      更新于 {new Date(selectedSkill.updatedAt ?? '').toLocaleString('zh-CN')}
                    </span>
                    {editMode && builderDirty && (
                      <Badge variant="outline" className="rounded-full text-[10px] font-normal text-warning border-warning/40 bg-warning/10">
                        <Lightbulb className="size-3 mr-0.5" />
                        待保存
                      </Badge>
                    )}
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
                        保存并生效
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
                        版本历史({cachedVersions.length})
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
              <div className="flex-1 overflow-y-auto max-h-[520px] p-4 space-y-4">
                {/* 编辑模式：可视化构建器 */}
                {editMode && (
                  <div className="rounded-sm border border-primary/25 bg-primary/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        <h5 className="text-sm font-medium">可视化任务生成器</h5>
                        <span className="text-xs text-muted-foreground">勾选分析任务，自动生成 Prompt</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-sm h-7 text-xs"
                        onClick={applyGeneratedPrompt}
                      >
                        <Zap className="size-3" />
                        生成并应用到下方
                      </Button>
                    </div>

                    {/* 角色与数据类型 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">分析角色</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {ROLE_PRESETS.map((role) => (
                            <button
                              key={role.id}
                              onClick={() => setSelectedRole(role.value)}
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs border transition-colors',
                                selectedRole === role.value
                                  ? 'border-primary text-primary bg-primary/10'
                                  : 'border-border text-muted-foreground hover:bg-accent/20',
                              )}
                            >
                              {role.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">数据类型</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {DATA_TYPE_PRESETS.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => setSelectedDataType(d.value)}
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs border transition-colors',
                                selectedDataType === d.value
                                  ? 'border-primary text-primary bg-primary/10'
                                  : 'border-border text-muted-foreground hover:bg-accent/20',
                              )}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 任务勾选 */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">分析任务（可多选）</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                        {TASK_PRESETS.map((task) => (
                          <TooltipProvider key={task.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleTask(task.id)}
                                  className={cn(
                                    'rounded-sm px-2 py-1.5 text-xs border text-left transition-colors',
                                    selectedTasks.includes(task.id)
                                      ? 'border-primary text-primary bg-primary/10'
                                      : 'border-border text-muted-foreground hover:bg-accent/20',
                                  )}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {selectedTasks.includes(task.id) ? (
                                      <CheckCircle2 className="size-3 shrink-0" />
                                    ) : (
                                      <CircleDashed className="size-3 shrink-0 text-muted-foreground/40" />
                                    )}
                                    {task.label}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{task.hint}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                      {selectedTasks.length === 0 && (
                        <p className="text-[11px] text-warning">未勾选任务时将使用默认"整体概览"任务</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 版本号 */}
                {editMode && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">版本号（可选自定义标识）</Label>
                    <Input
                      value={editVersionLabel}
                      onChange={(e) => setEditVersionLabel(e.target.value)}
                      placeholder="例如 v2.1、v3-优化版"
                      className="h-8 rounded-sm w-48 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      保存时作为版本存档标识，便于后续回溯
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
                      placeholder="描述该技能的用途与分析范围（如：分析临期费用趋势与风险）"
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
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    最大 Token 数
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3 text-muted-foreground/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          控制 AI 单次回答的最大长度。数值越大回答越详细，但响应更慢、成本更高
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
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

                {/* Prompt 模板 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Code2 className="size-3.5" />
                    Prompt 模板
                    <span className="text-muted-foreground/60 font-normal">
                      支持变量：{`{{inputData}}`}（数据）· {`{{userQuestion}}`}（问题）
                    </span>
                  </Label>
                  {editMode ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">插入变量：</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs font-mono rounded-full"
                          onClick={() => insertPlaceholder('{{inputData}}')}
                        >
                          {'{{inputData}}'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs font-mono rounded-full"
                          onClick={() => insertPlaceholder('{{userQuestion}}')}
                        >
                          {'{{userQuestion}}'}
                        </Button>
                      </div>
                      <Textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        className="min-h-[280px] font-mono text-xs rounded-sm resize-y"
                        placeholder="输入 Prompt 模板..."
                      />
                    </div>
                  ) : (
                    <pre className="rounded-sm border border-border bg-muted/30 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[320px]">
                      {selectedSkill.promptTemplate}
                    </pre>
                  )}
                </div>
              </div>

              {/* 版本历史弹层 */}
              {showVersions && (
                <div className="border-t border-border p-4 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-medium flex items-center gap-1.5">
                      <History className="size-4" />
                      版本历史（{cachedVersions.length} 个存档）
                    </h5>
                    <button
                      onClick={() => setShowVersions(false)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="关闭"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 当前版本 */}
                  <div className="flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 mb-3">
                    <Clock3 className="size-3.5 text-success" />
                    <span className="text-xs text-success font-medium">
                      当前版本：v{selectedSkill.version}（{selectedSkill.name}）
                    </span>
                  </div>

                  {cachedVersions.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Lightbulb className="size-6 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-xs">暂无历史存档。每次点击"保存并生效"都会自动存档当前版本，方便随时回退。</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {cachedVersions.map((entry) => (
                        <div
                          key={entry.cacheId}
                          className="flex items-center justify-between rounded-sm px-3 py-2 text-sm border border-border hover:bg-accent/20 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-medium shrink-0 text-primary">
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
                              className="h-6 px-2 text-xs text-success"
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
            <div className="bg-card border border-border rounded-sm flex items-center justify-center min-h-[280px]">
              <div className="text-center px-6">
                {activeModule ? (
                  <>
                    <Blocks className="size-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">{activeModule.icon} {activeModule.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto leading-relaxed">
                      {activeModule.description}
                    </p>
                    <Badge variant="outline" className="mt-3 rounded-full text-xs text-warning border-warning/40 bg-warning/10">
                      该模块尚未接入专属 AI 分析技能
                    </Badge>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      你可以使用其他模块的技能，或在左侧选择已接入技能的模块
                    </p>
                  </>
                ) : (
                  <>
                    <Wand2 className="size-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {loading ? '加载中...' : '选择左侧模块查看对应技能'}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
