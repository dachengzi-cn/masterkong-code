# UI 设计指南

> **设计类型**: App 设计（应用架构设计）
> **确认检查**: 本指南适用于可交互的数据分析应用，包含数据管理、客户资料与数据分析看板三大核心页面。

> ℹ️ Section 1 为设计意图与决策上下文。Code agent 实现时以 Section 2（色彩系统）、Section 3（Design Tokens）及之后的具体参数为准。

## 1. Design Archetype (设计原型)

### 1.1 内容理解（每项一句话，不展开）

- **目标用户**: 康师傅营销团队业务人员，高频执行数据上传与多维分析，期望高效、专业、无认知负担
- **核心目的**: 引导完成「客户资料→模板→上传→分析」四步流程 + 支撑多维度数据洞察决策
- **情绪基调**: 掌控感 / 专业清晰 / 避免信息过载与操作焦虑

### 1.2 设计方向（每项一行）

- **Design Style**: Grid 网格 — 数据分析工具需精确感与秩序感，网格线+极细边框强化信息层级与专业信任
- **Application Type**: Admin/SaaS — 三页面功能型应用，Sidebar 导航 + 高密度内容区
- **Aesthetic Direction**: 冷调蓝灰基底 + 品牌蓝精准点睛 + 等宽数字排版，营造「精密仪器」般的数据分析氛围

## 2. Color System (色彩系统)

> 基于应用概要设计的内容语义推导配色方案，确保整体协调。

**色彩关系**: 冷蓝灰主色 + 低饱和中性底 + 深墨文字 + 红绿语义色区分涨跌
**配色设计理由**: 数据分析场景需长时间专注，冷色调降低视觉疲劳；品牌蓝仅用于关键操作，避免干扰数据阅读
**主色推导**: primary 取品牌蓝 HSL(217, 85%, 52%)，关联「下载模板」「确认导入」「查看分析」等核心行动点
**使用比例**: 70% 中性灰白背景 / 20% 卡片与分隔 / 10% 品牌蓝仅限主按钮、激活态、上传高亮

### 2.1 主题颜色

> **Color Token 语义速查（供 code agent 参考）**:
> - `primary` → 主行动：按钮填充、激活态高亮、拖拽上传区激活边框
> - `accent` → 状态反馈：Ghost/Outline 按钮 hover、DropdownMenu focus、Skeleton 占位背景
> - `muted` → 静态非交互：禁用态背景、次级说明背景、占位文字色（`text-muted-foreground`）
> - **选择原则**：用户"可以点击" → primary；交互"正在发生" → accent；内容"不可操作" → muted

| Token                | HSL 值                  | 说明                                     |
| -------------------- | ----------------------- | ---------------------------------------- |
| `background`         | hsl(220, 18%, 97%)      | 冷灰蓝底色，降低长时间注视疲劳           |
| `card`               | hsl(0, 0%, 100%)        | 纯白卡片承载数据与图表                   |
| `foreground`         | hsl(220, 25%, 12%)      | 深墨文字，保障数据可读性                 |
| `muted-foreground`   | hsl(220, 12%, 52%)      | 次要说明与辅助标签                       |
| `primary`            | hsl(217, 85%, 52%)      | 品牌蓝，核心操作与上传高亮               |
| `primary-foreground` | hsl(0, 0%, 100%)        | 主按钮文字                               |
| `accent`             | hsl(217, 40%, 95%)      | 交互反馈背景，hover/focus/skeleton       |
| `accent-foreground`  | hsl(217, 60%, 35%)      | accent 上的文字                          |
| `border`             | hsl(220, 15%, 88%)      | 极细分隔线与卡片边框                     |

### 2.2 Sidebar 颜色

| Token                        | HSL 值                  | 说明                           |
| ---------------------------- | ----------------------- | ------------------------------ |
| `sidebar`                    | hsl(220, 22%, 14%)      | 深色导航基底，与内容区形成对比 |
| `sidebar-foreground`         | hsl(220, 10%, 78%)      | 导航文字，对比度 ≥ 4.5:1       |
| `sidebar-primary`            | hsl(217, 85%, 52%)      | 激活项背景，复用 primary       |
| `sidebar-primary-foreground` | hsl(0, 0%, 100%)        | 激活项文字                     |
| `sidebar-accent`             | hsl(220, 18%, 20%)      | Hover 态背景                   |
| `sidebar-accent-foreground`  | hsl(220, 10%, 90%)      | Hover 态文字                   |
| `sidebar-border`             | hsl(220, 15%, 22%)      | 导航内部边框                   |
| `sidebar-ring`               | hsl(217, 85%, 60%)      | 聚焦环                         |

### 2.3 语义颜色

| 用途     | HSL 值                  | 衍生说明                               |
| -------- | ----------------------- | -------------------------------------- |
| success  | hsl(152, 60%, 42%)      | KPI 上涨箭头、已解析状态标签           |
| error    | hsl(4, 72%, 52%)        | KPI 下跌箭头、删除操作、解析失败提示   |
| warning  | hsl(38, 85%, 48%)       | 数据不足提示、格式警告（仅大字号使用） |

## 3. Design Tokens (设计令牌)

> 本章节是代码实现的单一事实来源，所有组件必须遵循下列原子规则；未列出的值视为禁止。

### 3.1 Color Token Rules

- **`primary`** — 用户「可以点击」的主行动色：主按钮填充、当前激活态、拖拽上传区激活边框、链接。禁止用于静态装饰或非交互文本。
- **`accent`** — 交互「正在发生」的反馈色：Ghost/Outline 按钮 hover、DropdownMenu focus、Skeleton 背景、表格行 hover 背景（使用 `bg-accent/20`）。禁止替代 primary 作为行动点。
- **`muted`** — 内容「不可操作」的静态色：禁用态背景、占位说明、次级标签、空状态提示。禁止用于可点击元素。
- **`success`** / **`error`** / **`warning`** — 仅用于语义状态：success 表示上涨/已解析/正向；error 表示下跌/删除/失败；warning 表示数据不足/格式警告。三者均不可作为按钮主色。
- **选择原则再强调**: 可点击 → `primary`；交互反馈 → `accent`；静态/禁用 → `muted`。

### 3.2 Typography

| Token | 字体族 | 字号 | 字重 | 行高 | 特殊规则 |
| ----- | ------ | ---- | ---- | ---- | -------- |
| `heading` | Inter, "PingFang SC", "Microsoft YaHei", sans-serif | `text-xl` (20px) / `text-2xl` (24px) | 600 | 1.25 | 页面标题使用 24px，卡片标题使用 20px |
| `body` | Inter, "PingFang SC", "Microsoft YaHei", sans-serif | `text-sm` (14px) | 400 | 1.5 | 正文默认字号 |
| `data-mono` | Roboto Mono, "SF Mono", Consolas, monospace | `text-sm` (14px) | 500 | 1.4 | **必须** 设置 `font-variant-numeric: tabular-nums`；数字右对齐 |
| `caption` | Inter, "PingFang SC", "Microsoft YaHei", sans-serif | `text-xs` (12px) | 400 | 1.4 | 标签、辅助说明、时间戳 |

- **数据数字**: 所有表格数值、KPI 大数字、字段计数、金额、百分比强制使用 `data-mono` + `tabular-nums`，禁止用比例字体排版数字。
- **文字截断**: 数据单元格不换行，使用 `truncate` 或固定最大宽度，标题过长使用 `line-clamp-2`。

### 3.3 Spacing

- **密度基调**: `compact`；所有间距以 `4px` 为基准。
- **卡片内边距**: 默认 `p-4` (16px)；KPI 卡带、统计概览区使用 `p-5` (20px)。
- **区块间距**: 段落/模块之间 `gap-6` (24px)；同一卡片内部元素 `gap-4` (16px)。
- **表格单元格**: `px-3 py-2` (12px × 8px)；表头 `py-2.5`。
- **筛选栏/工具栏**: 子项间距 `gap-2` (8px)，与下方内容区 `mb-6` (24px)。

### 3.4 Radius & Shadow

- **通用圆角**: `rounded-sm` (2px) 用于卡片、按钮、输入框、面板、表格。
- **胶囊圆角**: 仅用于筛选触发器、状态标签、展开明细按钮，使用 `rounded-full`。
- **阴影策略**: `shadow-none`；卡片/面板通过 `bg-card border border-border` 表达层级，禁止添加投影制造虚假高度。

### 3.5 Motion

- **基础过渡**: 颜色/背景/边框过渡统一 `transition-colors duration-150 ease-out`。
- **行 hover**: 150ms，背景色切换至 `accent/20`。
- **上传区边框**: 150ms，dragging 状态虚线变实线并添加品牌蓝 `ring-2 ring-primary/30`。
- **钻取/侧边栏展开**: 200ms ease-out，宽度/位移变化。
- **KPI countUp**: 600ms ease-out，仅用于首屏加载；筛选/刷新后不再重复动画。
- **Tooltip**: 120ms fade-in。
- **减弱动效**: 必须监听 `prefers-reduced-motion: reduce`，禁用 countUp、侧边栏动画，过渡改为 0ms 或接近瞬间。

## 4. Typography (字体排版)

- **Heading**: Inter + "PingFang SC", "Microsoft YaHei", sans-serif
- **Body**: Inter + "PingFang SC", "Microsoft YaHei", sans-serif
- **Data/Mono**: Roboto Mono + "SF Mono", "Consolas", monospace
- **字体策略**: 标题与正文统一 Inter 保障跨平台一致性；KPI 数值、表格数据、字段数量强制使用 Roboto Mono 等宽对齐，强化数据精密感

## 5. Layout Strategy (布局策略)

- **导航策略**: Sidebar — 三个功能页面需持久切换，深色侧栏与浅色内容区形成明确工作区边界
- **页面架构**: 全局 `max-w-[1400px]` 居中约束；数据管理页单列纵向三段流式布局；客户资料页统计卡片+上传+列表；分析看板顶部筛选条 + KPI 卡带 + 2×2 图表网格
- **响应式**: 移动端 Sidebar 折叠为抽屉、KPI 卡片改为 2 列、图表网格改为单列；桌面端完整三栏/四宫格布局

## 6. Visual Language (视觉语言)

- **形态参数**: 圆角 `rounded-sm (2px)` · 阴影 `shadow-none`（卡片用 `border border-border` 替代） · 间距基调 `compact`
- **识别签名**: 「极细边框代替阴影」「等宽数字右对齐」「上传区虚线边框激活变实线品牌蓝」
- **装饰策略**: 仅在上传拖拽激活态使用品牌蓝光晕动画；其余区域零装饰，让数据本身成为视觉焦点
- **动效原则**: KPI countUp 600ms ease-out；上传区拖入边框变色 150ms；tooltip 出现 120ms fade-in
- **可及性**: 对比度 ≥ 4.5:1；KPI 涨跌同时使用颜色+箭头符号双重编码；上传进度有文本百分比兜底

## 7. Component Principles (组件原则)

- **状态完整性**: 上传区覆盖 idle/hover/dragging/uploading/error 五态；数据集列表行 hover 显示操作按钮
- **层级清晰**: Primary 按钮填充品牌蓝；Secondary/Ghost 按钮仅边框或透明背景；表格操作列图标按钮弱化默认态
- **一致性**: 所有卡片统一 `bg-card border border-border rounded-sm p-5`；状态标签统一胶囊形 `px-2 py-0.5 text-xs font-medium`
- **筛选工具栏按钮**: 客户总览页人员点数概况区的筛选下拉框（所别/层级 Select）与展开明细 Button 统一尺寸为 `h-8 w-[120px]`，并使用 `rounded-full` 胶囊圆角；展开明细 Button 内文字取消加粗（`font-normal`），箭头图标位于文字右侧；hover 时变为实心品牌绿胶囊按钮（`hover:bg-[hsl(152,60%,42%)] hover:text-white hover:border-[hsl(152,60%,42%)]`），鼠标移开恢复原色

## 8. KPI Card pattern

- **卡片基底**: `bg-card border border-border rounded-sm p-5`，无阴影，无图标实心背景。
- **语义左线**: 左侧添加 2px 实线区分状态：`border-l-2 border-l-success`（正向）、`border-l-error`（负向）、`border-l-border`（中性）。
- **图标处理**: 仅使用线性图标或简洁图形，禁止带彩色实心背景 circle/square；图标颜色与左线同色。
- **数字排版**: KPI 数值必须使用 `data-mono` + `tabular-nums`，默认右对齐或左对齐但需保持等宽；单位/百分比使用 `caption` 样式放在数值下方或右侧。
- **变化指示**: 同比/环比变化同时显示箭头图标（↑/↓/→）与颜色，禁止只用颜色传达趋势。

## 9. Content Grid signature

- **网格背景**: 桌面端主内容区使用极淡 1px 网格背景（`bg-grid-pattern` 或 `repeating-linear-gradient`），颜色取 `border` 的 30% 透明度，营造精密仪器秩序感。
- **层级控制**: 网格线必须位于卡片/表格下方，不得与数据内容重叠；卡片保持纯白底色覆盖网格。
- **响应式**: 移动端隐藏网格背景，避免小屏信息密度过高；平板可保留更稀疏网格。

## 10. Filter Bar pattern

- **容器**: 工具栏使用 `flex items-center gap-2` 横向排列，必要时换行。
- **触发器尺寸**: 所有筛选 Select / Button 统一 `h-8 w-[120px]`；胶囊圆角 `rounded-full`。
- **标签**: 筛选标签使用 `text-xs text-muted-foreground`，与触发器顶部/左侧对齐，避免使用大字号标签。
- **展开明细按钮**: 文字 `font-normal`，图标位于文字右侧；hover 状态按组件原则转为实心品牌绿胶囊按钮。
- **禁用态**: 无数据可筛选时触发器置灰并显示占位文案，禁止隐藏控件造成布局跳动。

## 11. Table pattern

- **表头**: `sticky top-0` 固定，`bg-card` + `border-b`；表头文字使用 `caption` 样式，字母/中文不加粗。
- **斑马纹**: 偶数行使用 `bg-muted/30`，奇数行 `bg-card`；斑马纹颜色不得影响 hover 可读性。
- **行 hover**: `transition-colors duration-150 ease-out hover:bg-accent/20`；hover 时显示行内操作按钮（编辑/删除图标）。
- **数字列**: 所有数值列 `text-right font-mono tabular-nums`；表头数字列同样右对齐。
- **合计行**: 使用上粗线 `border-t-2 border-border` 或 `bg-muted/60` 区分；合计数值加粗，仍保持等宽对齐。
- **空状态**: 空表格显示居中占位文案，不显示无意义的 0 行数据。

## 12. Sidebar pattern

- **图标优先**: 折叠态仅显示图标（Lucide 线性图标或品牌 logo），图标居中对齐；展开态显示图标 + 标签。
- **激活态**: 当前页面使用 `bg-sidebar-primary text-sidebar-primary-foreground rounded-sm`；非激活 hover 使用 `bg-sidebar-accent`。
- **Tooltip**: 折叠态每个导航项必须提供 Tooltip，显示页面中文名称与快捷键（如有）。
- **聚焦环**: 导航项使用 `focus-visible:ring-2 ring-sidebar-ring`。
- **底部操作**: 设置/退出等低频操作使用 `sidebar-accent` 分隔区，避免与主导航混淆。

## 13. Accessibility

- **聚焦可见**: 所有交互元素必须实现 `focus-visible` 高亮环（`ring-2 ring-primary/60 ring-offset-2`），禁止使用默认 outline 样式归零而不提供替代方案。
- **双重编码**: 颜色传达状态时必须配合图标或文本标签：success 配 ↑/✓，error 配 ↓/✕，warning 配 ⚠；不得仅依赖红绿色区分。
- **对比度**: 正文与背景对比度 ≥ 4.5:1；大字号/图标 ≥ 3:1。
- **动效安全**: 遵循 `prefers-reduced-motion`，禁用自动播放计数、侧边栏动画；必要过渡使用 0ms 或即时切换。
- **上传可及性**: 拖拽区除视觉高亮外，提供键盘可访问的「选择文件」按钮与实时屏幕阅读器文本（上传进度、成功/失败状态）。

## 14. Image Direction (图片与视觉资产，按需)

- **Image Role**: 无强制图片需求
- **Image Art Direction**: 优先通过排版、色彩和局部图形建立视觉记忆点；空状态可使用极简线性插画（与 Grid 风格一致）
- **Image Prompt Keywords**: 无
- **Image Avoidance**: 禁止通用商务人物素材、3D 科技图标、抽象渐变背景、任何与分析流程无关的装饰图

## 15. 应避免 (Anti-patterns)

- ❌ 使用大面积渐变色块或深色模式作为默认主题（违背「干净功能型」定位）
- ❌ KPI 卡片使用圆形进度环或仪表盘（增加认知负担，大数字+箭头更高效）
- ❌ 上传区添加复杂插图或步骤图示（虚线框+文案已足够，过度装饰分散注意力）