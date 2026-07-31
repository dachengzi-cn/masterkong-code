import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc } from 'drizzle-orm';
import { aiDesignDoc } from '@server/database/schema';
import {
  DOC_CATEGORY_LABELS,
  DEFAULT_DOC_KEYS,
  ALL_CATEGORIES,
} from './doc-gen.constants';
import type {
  DocCategory,
  DesignDocRecord,
  UpsertDocRequest,
  AutoGenerateRequest,
} from './doc-gen.types';

@Injectable()
export class DocGenService {
  private readonly logger = new Logger(DocGenService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  // ========== 查询 ==========

  /** 获取所有最新版文档 */
  async findAllLatest(): Promise<DesignDocRecord[]> {
    const rows = await this.db
      .select()
      .from(aiDesignDoc)
      .where(eq(aiDesignDoc.isLatest, true))
      .orderBy(desc(aiDesignDoc.updatedAt));
    return rows as unknown as DesignDocRecord[];
  }

  /** 按分类获取最新版文档 */
  async findLatestByCategory(category: DocCategory): Promise<DesignDocRecord[]> {
    const rows = await this.db
      .select()
      .from(aiDesignDoc)
      .where(and(eq(aiDesignDoc.category, category), eq(aiDesignDoc.isLatest, true)))
      .orderBy(desc(aiDesignDoc.updatedAt));
    return rows as unknown as DesignDocRecord[];
  }

  /** 按 docKey 获取最新版 */
  async findLatestByKey(docKey: string): Promise<DesignDocRecord | null> {
    const rows = await this.db
      .select()
      .from(aiDesignDoc)
      .where(and(eq(aiDesignDoc.docKey, docKey), eq(aiDesignDoc.isLatest, true)))
      .limit(1);
    return (rows[0] as unknown as DesignDocRecord) ?? null;
  }

  /** 获取文档的所有版本历史 */
  async getVersionHistory(docKey: string): Promise<DesignDocRecord[]> {
    const rows = await this.db
      .select()
      .from(aiDesignDoc)
      .where(eq(aiDesignDoc.docKey, docKey))
      .orderBy(desc(aiDesignDoc.version));
    return rows as unknown as DesignDocRecord[];
  }

  /** 按 ID 获取单条文档 */
  async findById(id: string): Promise<DesignDocRecord | null> {
    const rows = await this.db
      .select()
      .from(aiDesignDoc)
      .where(eq(aiDesignDoc.id, id))
      .limit(1);
    return (rows[0] as unknown as DesignDocRecord) ?? null;
  }

  // ========== 创建 / 更新 ==========

  /** 创建或更新文档（创建新版本） */
  async upsertDoc(request: UpsertDocRequest): Promise<DesignDocRecord> {
    if (!request.docKey || !request.title || !request.category) {
      throw new BadRequestException('docKey, title, category 为必填项');
    }

    const existing = await this.findLatestByKey(request.docKey);
    const newVersion = existing ? existing.version + 1 : 1;

    // 将旧版本标记为非最新
    if (existing) {
      await this.db
        .update(aiDesignDoc)
        .set({ isLatest: false })
        .where(eq(aiDesignDoc.id, existing.id));
    }

    // 插入新版本
    const [row] = await this.db
      .insert(aiDesignDoc)
      .values({
        docKey: request.docKey,
        title: request.title,
        category: request.category,
        content: request.content ?? '',
        version: newVersion,
        isLatest: true,
        source: request.source ?? 'manual',
        status: request.status ?? 'draft',
      })
      .returning();

    this.logger.log(`Upserted doc ${request.docKey} v${newVersion}`);
    return row as unknown as DesignDocRecord;
  }

  /** 删除文档（所有版本） */
  async deleteDoc(docKey: string): Promise<void> {
    await this.db.delete(aiDesignDoc).where(eq(aiDesignDoc.docKey, docKey));
  }

  /** 更新文档状态 */
  async updateStatus(docKey: string, status: string): Promise<DesignDocRecord> {
    const latest = await this.findLatestByKey(docKey);
    if (!latest) {
      throw new NotFoundException(`文档不存在: ${docKey}`);
    }
    const [row] = await this.db
      .update(aiDesignDoc)
      .set({ status })
      .where(eq(aiDesignDoc.id, latest.id))
      .returning();
    return row as unknown as DesignDocRecord;
  }

  // ========== 自动生成 ==========

  /**
   * 自动生成设计文档
   * 扫描项目代码结构，生成覆盖系统架构、功能模块、接口定义等分类的文档
   */
  async autoGenerate(request: AutoGenerateRequest): Promise<DesignDocRecord[]> {
    const categories = request.categories?.length ? request.categories : ALL_CATEGORIES;
    const results: DesignDocRecord[] = [];

    for (const category of categories) {
      const docKey = DEFAULT_DOC_KEYS[category];
      const existing = await this.findLatestByKey(docKey);

      if (existing && !request.overwrite) {
        results.push(existing);
        continue;
      }

      const content = this.generateContentForCategory(category);
      const title = DOC_CATEGORY_LABELS[category];

      const doc = await this.upsertDoc({
        docKey,
        title,
        category,
        content,
        source: 'auto-generated',
        status: 'published',
      });
      results.push(doc);
    }

    return results;
  }

  /** 根据分类生成文档内容 */
  private generateContentForCategory(category: DocCategory): string {
    switch (category) {
      case 'overview':
        return this.generateOverview();
      case 'architecture':
        return this.generateArchitecture();
      case 'modules':
        return this.generateModules();
      case 'api':
        return this.generateApi();
      case 'data-flow':
        return this.generateDataFlow();
      case 'ui-design':
        return this.generateUiDesign();
      case 'model-strategy':
        return this.generateModelStrategy();
      default:
        return '';
    }
  }

  // ========== 文档内容生成器 ==========

  private generateOverview(): string {
    return `# 大模型数据分析功能集成系统 - 总览

## 1. 系统定位

本系统为康师傅营销数据分析平台的大模型 AI 分析层，在现有数据分析看板基础上叠加 AI 智能洞察与建议能力。

## 2. 核心能力

| 能域 | 说明 |
|------|------|
| 模型网关 | 统一对接 Agnes / DeepSeek / GLM 三大模型，支持配置管理与动态切换 |
| Skill 基准体系 | 定义可复用分析技能模板，覆盖五大分析场景 |
| 协同模式 | 支持独立选择、集成模式、规划-执行-评判三阶段协同 |
| 自动分析流程 | 数据预处理 → 模型选择 → 执行 → 结果优化 → 输出 |
| 设计文档管理 | 自动生成 + 手动编辑 + 版本管理 |

## 3. 覆盖页面

1. 累计成交分析（cumulative）
2. 当日成交分析（daily）
3. 品牌 & 规格分析（brand-spec）
4. 临期费用分析（expiry）
5. ATP 费用分析（atp）

## 4. 技术栈

- 后端：NestJS + Drizzle ORM + PostgreSQL
- 前端：React + TypeScript + Tailwind CSS
- AI：OpenAI 兼容接口（chatCompletions）
`;
  }

  private generateArchitecture(): string {
    return `# 系统架构设计

## 1. 分层架构

\`\`\`
┌─────────────────────────────────────────┐
│           前端分析页面层                   │
│  DashboardPage / AtpExpensePage / ...   │
├─────────────────────────────────────────┤
│         AI 分析面板组件层                  │
│       AiAnalysisPanel (Modal)            │
├─────────────────────────────────────────┤
│         前端 Hook + API 层                │
│     useAiAnalysis / ai-analysis.ts       │
├─────────────────────────────────────────┤
│         后端 AI 分析服务层                 │
│  AiAnalysisService (Skill + Engine)      │
├──────────────┬──────────────────────────┤
│  模型网关层   │   设计文档生成层            │
│ AiConfigSvc  │   DocGenService           │
│ AiService    │                           │
├──────────────┴──────────────────────────┤
│         数据持久层                        │
│  PostgreSQL (ai_skill / ai_session /     │
│  ai_config / ai_design_doc)              │
└─────────────────────────────────────────┘
\`\`\`

## 2. 核心模块

### 2.1 模型网关（AiConfigService + AiService）

- \`AiConfigService\`：管理模型配置（configKey → baseUrl/apiKey/model），支持加密存储
- \`AiService\`：封装 OpenAI 兼容的 \`chatCompletions\` 调用，统一超时/重试/日志

### 2.2 分析引擎（AiAnalysisService）

- **Skill 注册中心**：从数据库加载 SkillDefinition，支持内置 Skill 自动种子填充
- **执行引擎**：根据协同模式分发到三个执行路径
- **结果聚合**：集成模式下合并多模型输出；规划-执行-评判模式下串联三阶段

### 2.3 设计文档模块（DocGenService）

- CRUD + 版本管理
- 自动生成器：扫描项目结构生成架构/模块/API/数据流/UI规范/模型策略文档
- 在线编辑与版本对比

## 3. 数据流

\`\`\`
用户点击「AI 分析」
  → AiAnalysisPanel 收集页面数据 + 用户问题
  → POST /api/ai-analysis/execute
  → AiAnalysisService.executeAnalysis
    → resolveConfigKeys（根据协同模式选择模型）
    → buildPrompt（Skill 模板 + 数据填充）
    → callModel（AiService.chatCompletions）
    → tryParseJson（结果解析）
    → aggregateEnsembleResults（集成模式聚合）
  → 持久化 Session 到数据库
  → 返回 AnalysisExecutionResult
  → 前端渲染洞察、建议、风险提示
\`\`\`
`;
  }

  private generateModules(): string {
    return `# 功能模块定义

## 1. 后端模块

### 1.1 ai-analysis 模块

| 文件 | 职责 |
|------|------|
| ai-analysis.module.ts | 模块定义，OnModuleInit 时种子填充内置 Skill |
| ai-analysis.controller.ts | RESTful API：Skill 查询/更新、配置管理、分析执行、会话历史 |
| ai-analysis.service.ts | 核心逻辑：Skill 注册、三种协同模式执行、模型调用、结果聚合 |
| ai-analysis.constants.ts | 内置 Skill 定义（5 个）、Planner/Critic 系统提示词 |
| ai-analysis.types.ts | 类型定义：SkillDefinition、AnalysisExecutionRequest/Result 等 |

### 1.2 doc-gen 模块

| 文件 | 职责 |
|------|------|
| doc-gen.module.ts | 模块定义 |
| doc-gen.controller.ts | RESTful API：文档 CRUD、版本历史、自动生成 |
| doc-gen.service.ts | 文档管理 + 自动生成器 |
| doc-gen.constants.ts | 分类标签与默认 docKey 映射 |
| doc-gen.types.ts | 类型定义 |

### 1.3 ai 模块（模型网关）

| 文件 | 职责 |
|------|------|
| ai.service.ts | chatCompletions 封装 |
| ai-config.service.ts | 模型配置 CRUD + 加密 |
| ai.module.ts | 模块定义 |

## 2. 前端模块

### 2.1 组件

| 文件 | 职责 |
|------|------|
| ai-analysis-panel.tsx | AI 分析弹窗组件（输入 + 结果展示 + 多模型可视化） |

### 2.2 Hooks

| 文件 | 职责 |
|------|------|
| use-ai-analysis.ts | 管理 Skill 列表、配置、执行状态、会话历史 |

### 2.3 API 客户端

| 文件 | 职责 |
|------|------|
| api/ai-analysis.ts | 封装后端 API 调用 |

## 3. 数据库表

| 表名 | 职责 |
|------|------|
| ai_model_config | 模型配置（configKey、baseUrl、apiKey、model） |
| ai_skill | Skill 定义（promptTemplate、outputSchema、pageScope） |
| ai_analysis_session | 分析会话记录（输入快照、输出、状态、耗时） |
| ai_analysis_config | 全局分析配置（协同模式、默认模型） |
| ai_design_doc | 设计文档（版本管理、分类、状态） |
`;
  }

  private generateApi(): string {
    return `# 接口定义

## 1. AI 分析 API

### 1.1 获取 Skill 列表

\`\`\`
GET /api/ai-analysis/skills
GET /api/ai-analysis/skills/page/:pageScope
\`\`\`

### 1.2 更新 Skill

\`\`\`
PUT /api/ai-analysis/skills/:skillKey
Body: { promptTemplate?, outputSchema?, maxTokens?, name?, description? }
\`\`\`

### 1.3 获取/更新配置

\`\`\`
GET /api/ai-analysis/config
PUT /api/ai-analysis/config
Body: { collaborationMode?, defaultConfigKey?, ensembleConfigKeys?, ... }
\`\`\`

### 1.4 执行分析

\`\`\`
POST /api/ai-analysis/execute
Body: {
  skillKey: string,
  pageScope: string,
  inputData: Record<string, unknown>,
  userQuestion?: string,
  collaborationMode?: 'independent' | 'ensemble' | 'planner-executor-critic',
  configKeys?: string[]
}
Response: AnalysisExecutionResult
\`\`\`

### 1.5 会话历史

\`\`\`
GET /api/ai-analysis/sessions?pageScope=xxx&limit=20
GET /api/ai-analysis/sessions/:sessionId
\`\`\`

## 2. 设计文档 API

### 2.1 获取文档列表

\`\`\`
GET /api/doc-gen/docs
GET /api/doc-gen/docs/category/:category
\`\`\`

### 2.2 获取单篇文档

\`\`\`
GET /api/doc-gen/docs/:docKey
\`\`\`

### 2.3 创建/更新文档

\`\`\`
POST /api/doc-gen/docs
PUT /api/doc-gen/docs/:docKey
Body: { docKey, title, category, content?, source?, status? }
\`\`\`

### 2.4 版本管理

\`\`\`
GET /api/doc-gen/docs/:docKey/versions
GET /api/doc-gen/docs/:docKey/diff?from=1&to=2
\`\`\`

### 2.5 自动生成

\`\`\`
POST /api/doc-gen/auto-generate
Body: { categories?, overwrite? }
\`\`\`

### 2.6 删除与状态

\`\`\`
DELETE /api/doc-gen/docs/:docKey
PATCH /api/doc-gen/docs/:docKey/status
Body: { status: 'draft' | 'published' | 'archived' }
\`\`\`
`;
  }

  private generateDataFlow(): string {
    return `# 数据流程

## 1. AI 分析执行流程

\`\`\`
[用户操作] 点击「AI 分析」按钮
      │
      ▼
[前端] AiAnalysisPanel 打开弹窗
      │  - 加载配置 GET /api/ai-analysis/config
      │  - 按页面加载 Skill GET /api/ai-analysis/skills/page/:scope
      │
      ▼
[前端] 用户输入问题 → 点击「开始分析」
      │
      ▼
[API] POST /api/ai-analysis/execute
      │  Body: { skillKey, pageScope, inputData, userQuestion }
      │
      ▼
[Service] AiAnalysisService.executeAnalysis
      │
      ├─→ resolveSkill (从 DB 加载 SkillDefinition)
      │
      ├─→ resolveConfigKeys (根据协同模式选择模型)
      │     ├─ independent → [defaultConfigKey]
      │     ├─ ensemble → ensembleConfigKeys[]
      │     └─ planner-executor-critic → [planner, executor, critic]
      │
      ├─→ createSession (插入 ai_analysis_session 记录)
      │
      ├─→ 按模式执行：
      │     ├─ executeIndependent → callModel(skill, request, configKey)
      │     ├─ executeEnsemble → Promise.all(callModel × N) → aggregateEnsembleResults
      │     └─ executePlannerExecutorCritic
      │           → callPlanner (生成分析计划)
      │           → callModel (按计划执行)
      │           → callCritic (评审并优化)
      │
      ├─→ buildPrompt: Skill.promptTemplate 占位符替换 + inputData 序列化
      │
      ├─→ callModel → AiService.chatCompletions
      │     → HTTP POST 到模型 baseUrl
      │     → 解析 choices[0].message.content
      │     → tryParseJson 提取 JSON
      │
      ├─→ 聚合 finalOutput
      │
      └─→ updateSession (写入 outputData、status、latencyMs、usage)
      │
      ▼
[API] 返回 AnalysisExecutionResult
      │
      ▼
[前端] 渲染结果
      - summary（摘要）
      - recommendations（行动建议）
      - riskAlerts（风险提示）
      - 多模型对比（集成模式）
      - 计划 + 评审（规划-执行-评判模式）
\`\`\`

## 2. Skill 迭代优化流程

\`\`\`
[分析执行] → 结果质量评估
      │
      ├─→ 用户反馈（好/差）
      │
      ▼
[管理界面] 查看 Skill promptTemplate
      │
      ▼
[编辑] PUT /api/ai-analysis/skills/:skillKey
      │  - 修改 promptTemplate
      │  - 调整 outputSchema
      │  - version 自动递增
      │
      ▼
[下次执行] 使用新版本 Skill
\`\`\`

## 3. 设计文档生成流程

\`\`\`
[触发] 手动或定时调用 autoGenerate
      │
      ▼
[扫描] 遍历分类列表
      │  ├─ overview: 系统总览
      │  ├─ architecture: 架构分层
      │  ├─ modules: 模块清单
      │  ├─ api: 接口定义
      │  ├─ data-flow: 数据流程
      │  ├─ ui-design: UI 规范
      │  └─ model-strategy: 模型策略
      │
      ▼
[生成] 按模板生成 Markdown 内容
      │
      ▼
[持久化] upsertDoc
      │  - 旧版本 isLatest = false
      │  - 新版本 version++, isLatest = true
      │
      ▼
[查看] 前端在线浏览 + 编辑 + 版本对比
\`\`\`
`;
  }

  private generateUiDesign(): string {
    return `# UI 设计规范

## 1. AI 分析面板（AiAnalysisPanel）

### 1.1 触发方式

- 每个分析页面 FilterBar 右侧放置「AI 分析」按钮
- 按钮样式：\`rounded-full border-primary text-primary\`，Sparkles 图标 + 文案
- 无数据时按钮 disabled

### 1.2 弹窗布局

\`\`\`
┌──────────────────────────────────────┐
│ 🤖 AI 数据分析    [协同模式 Badge]  ✕ │
├──────────────────────────────────────┤
│ 分析需求                              │
│ ┌──────────────────────────────────┐ │
│ │ Textarea（默认问题可编辑）         │ │
│ └──────────────────────────────────┘ │
│ 当前协同模式：独立模式                 │
│                              [开始分析]│
├──────────────────────────────────────┤
│ 📊 分析结果区域                        │
│ ┌──────────────────────────────────┐ │
│ │ 摘要 summary                     │ │
│ │ 行动建议 recommendations          │ │
│ │ 风险提示 riskAlerts               │ │
│ │ 多模型对比（集成模式）             │ │
│ │ 计划 + 评审（规划-执行-评判）       │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
\`\`\`

### 1.3 样式规范

- 弹窗：\`max-w-2xl max-h-[90vh]\`，\`bg-card border border-border rounded-sm\`
- 标题：\`text-xl font-semibold\`
- 按钮：Primary 按钮 \`bg-primary text-primary-foreground\`
- 结果区域：\`flex-1 overflow-y-auto\`，支持 Markdown 渲染

## 2. 色彩与排版

遵循项目 AGENTS.md 定义的设计令牌：
- 主色：\`hsl(217, 85%, 52%)\`（品牌蓝）
- 卡片：\`bg-card border border-border\`（纯白 + 极细边框）
- 数字：\`font-mono tabular-nums\`
- 圆角：\`rounded-sm\`（2px）
- 阴影：\`shadow-none\`（用边框替代）

## 3. 交互原则

1. **渐进展示**：先摘要，再建议，最后风险详情
2. **加载反馈**：执行中显示 Loader2 旋转动画 + 「分析中...」文案
3. **错误兜底**：模型调用失败时显示 AlertTriangle + 错误信息 + 重试按钮
4. **多模型可视化**：集成模式并排展示各模型输出，高亮差异
`;
  }

  private generateModelStrategy(): string {
    return `# 模型调用策略

## 1. 模型网关设计

### 1.1 统一接口

所有模型通过 \`AiService.chatCompletions\` 调用，接口兼容 OpenAI Chat Completions API：

\`\`\`typescript
interface ChatCompletionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}
\`\`\`

### 1.2 配置管理

模型配置存储在 \`ai_model_config\` 表，通过 configKey 唯一标识：

| configKey | provider | model | 用途 |
|-----------|----------|-------|------|
| agnes | 内部 | agnes-v1 | 默认分析模型 |
| nvidia-deepseek-v4 | NVIDIA | deepseek-v4 | 集成模式/执行器 |
| nvidia-glm-5-2 | NVIDIA | glm-5-2 | 集成模式/评审器 |

## 2. 协同模式

### 2.1 独立模式（independent）

- 单模型执行，结果直接输出
- 适用于：快速分析、日常查询
- 配置：\`defaultConfigKey\`

### 2.2 集成模式（ensemble）

- 多模型并行执行，结果聚合
- 适用于：需要多视角交叉验证的关键决策
- 配置：\`ensembleConfigKeys[]\`
- 聚合策略：
  - summary：合并各模型摘要，去重后取并集
  - recommendations：合并建议列表，按出现频次排序
  - riskAlerts：合并风险提示，去重

### 2.3 规划-执行-评判（planner-executor-critic）

- 三阶段串行：
  1. **Planner**：分析需求 + 数据摘要 → 生成结构化分析计划
  2. **Executor**：按计划执行详细分析
  3. **Critic**：评审执行结果，补充遗漏、修正偏差
- 适用于：复杂多维度分析、需要深度推理的场景
- 配置：\`plannerConfigKey\` / \`executorConfigKey\` / \`criticConfigKey\`

## 3. Skill 提示词策略

### 3.1 模板结构

\`\`\`
{{systemContext}}

## 分析需求
{{userQuestion}}

## 数据
{{inputData}}

## 输出要求
请按以下 JSON Schema 输出：
{{outputSchema}}
\`\`\`

### 3.2 数据截断

- inputData 序列化后超过 4000 字符时自动截断
- 截断策略：保留 summary + 前N行数据 + 提示「数据已截断」

### 3.3 输出解析

- 优先解析完整 JSON
- 回退策略：提取 \`\`\`json 代码块
- 最终回退：提取第一个 \`{\` 到最后一个 \`}\`

## 4. 迭代优化机制

1. **版本追踪**：Skill 每次更新 version 递增
2. **会话审计**：所有分析执行记录到 ai_analysis_session
3. **反馈闭环**：通过会话历史回溯分析质量，指导 Skill 优化
4. **A/B 对比**：集成模式下多模型输出可直接对比质量
`;
  }
}
