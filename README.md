# 重点数据分析平台

面向康师傅营销团队的多维数据分析应用，覆盖「客户资料 → 模板 → 上传 → 分析」全流程，支撑客户总览、成交分析、费用分析与服务点数分析等多维度数据洞察。

---

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS 4 + Radix UI + Recharts/ECharts
- **后端**：NestJS 10 + Drizzle ORM + PostgreSQL
- **工具链**：ESLint + Prettier + Stylelint + Jest + Concurrently
- **平台**：基于 `@lark-apaas/fullstack-nestjs-core` 全栈脚手架

---

## 快速开始

```bash
# 安装依赖
npm install

# 同时启动前后端开发服务
npm run dev

# 单独启动
npm run dev:server   # 后端 NestJS（watch 模式）
npm run dev:client   # 前端 Vite

# 类型检查
npm run type:check

# 生产构建
npm run build:prod
```

---

## 板块总览

应用采用「深色 Sidebar 导航 + 浅色内容区」布局，主要板块按业务流程划分为：

| 板块 | 路由 | 入口组件 |
| --- | --- | --- |
| 主页 | `/` | `pages/HomePage/HomePage.tsx` |
| 客户总览 | `/customers` | `pages/CustomerPage/CustomerPage.tsx` |
| 成交分析 · 概览 | `/dashboard/overview` | `pages/DashboardPage/DashboardOverviewPage.tsx` |
| 成交分析 · 累计 | `/dashboard/cumulative` | `pages/DashboardPage/DashboardPage.tsx` |
| 成交分析 · 当日 | `/dashboard/daily` | `pages/DashboardPage/DashboardPage.tsx` |
| 成交分析 · 品牌规格 | `/dashboard/brand-spec` | `pages/DashboardPage/DashboardBrandSpecPage.tsx` |
| 费用总览 | `/expense` | `pages/ExpensePage/ExpensePage.tsx` |
| 临期费用分析 | `/expense/expiry` | `pages/ExpiryExpensePage/ExpiryExpensePage.tsx` |
| ATP 费用分析 | `/expense/atp` | `pages/AtpExpensePage/AtpExpensePage.tsx` |
| 服务点数分析 | `/service-analysis` | `pages/ServiceAnalysisPage/ServiceAnalysisPage.tsx` |
| 数据管理 | `/data` | `pages/DataManagePage/DataManagePage.tsx` |
| 客户列表 | `/customer-list` | `pages/CustomerListPage/CustomerListPage.tsx` |

---

## 各板块使用说明

### 1. 主页（`/`）

应用入口，展示版本更新日志，汇总各版本的迭代要点（数据集管理、费用分析、临期分析等模块的新增与优化记录）。

- 查看历史版本变更（当前版本 v1.7.0）
- 了解各模块上线时间与功能演进
- 快速跳转至数据管理开始上传

---

### 2. 数据管理（`/data`）

数据上传与维护中心，统一管理客户资料、线路资料、费用资料及数据集。所有分析板块的数据均来源于此处。

**功能说明：**

- **快速上传**：`QuickUpload` 一站式数据导入入口，上传完成后自动刷新系统状态
- **数据集管理**：`DatasetList` 查看已解析的数据集列表，支持导入与删除
- **客户资料**：
  - 下载客户资料模板 → 上传 Excel → 自动解析入库
  - 显示文件名、上传时间、数据行数与状态
  - 支持一键「查看分析」跳转至客户总览、「删除」清空客户资料
- **线路资料**：与客户资料相同模式的上传/删除/模板下载流程
- **费用资料**：上传费用数据，按所选月份覆盖既有数据，未选月份保持不变
- **快捷自定义**：`QuickCustom` 自定义上传入口

**关键约束：**

- 费用数据上传按月份覆盖（非追加），仅处理包含选中月份的记录
- 选中无新数据的月份会删除该月既有数据
- 大批量数据（60k+ 条）按 1000 条/批分批上传
- 上传进度可取消，进度条实时显示百分比

---

### 3. 客户总览（`/customers`）

展示客户资料的统计汇总与分类明细，支持上传刷新与多维度筛选。

**功能说明：**

- **统计卡片**：`CustomerSummary` 展示总门店数、付费门店数、付费金额等汇总指标
- **客户分类表**：`CustomerClassification` 按「所别 → 阶层 → 业代」层级聚合
  - 默认仅展示「所别合计」「部别合计」
  - 点击「展开明细/收起明细」切换显示全部行（明细 + 一阶/二阶合计 + 所别合计 + 部别合计）
  - 支持所别、层级多选筛选（胶囊圆角下拉，hover 变实心品牌绿）
  - 饼图展示门店形态分布
- **格式钻取**：`FormatDrilldownPanel` 点击形态维度下钻区域明细
- **上传入口**：页面顶部支持直接上传客户资料刷新数据

---

### 4. 客户列表（`/customer-list`）

全量客户资料的明细查询页，支持搜索、分页与清空操作。

- 按关键词搜索客户（名称、编码等）
- 分页浏览（默认每页 20 条）
- 一键清空所有客户资料（带二次确认对话框）
- 显示总记录数

---

### 5. 成交分析

基于数据集（`data_record`）的多维成交率分析，包含四个子页面。

#### 5.1 概览（`/dashboard/overview`）

成交分析的入口与综合概览，展示 KPI 卡片与趋势图。

- KPI 卡片：服务点数、总订单数、成交率等核心指标（CountUp 动画）
- 月度趋势折线图/柱状图
- 快速选择日期范围（当月、上月、连续二月/三月）

#### 5.2 累计成交分析（`/dashboard/cumulative`）

按所选时间区间累计计算各业代的成交率热力图。

- 筛选条：数据集、日期范围、所别、阶层、业代、品牌、规格、线路、复合形态
- 业代热力图：`SalesRepHeatmap` 行为业代，列为日期，单元格为成交率
- 默认仅展示「所别合计」「部别合计」行
- 下载未成交门店清单（按所选层级过滤）
- 复合形态筛选自动映射到对应的经销商类型

#### 5.3 当日成交分析（`/dashboard/daily`）

按日粒度展示成交率，每日成交率 = 当日成交门店数 / 当日线路门店数。

- 与累计分析相同的筛选条
- 日期单元格展示当日成交率、成交门店数、订单数
- 排除经销商类型：自售、特约士多批、特约特通批
- 所别/阶层合计 = Σ(每日成交门店) / Σ(每日线路门店)

#### 5.4 品牌 & 规格分析（`/dashboard/brand-spec`）

按品牌与规格交叉分析成交情况。

- 筛选条支持品牌、规格双向联动（自定义组合优先置顶）
- 品牌规格矩阵表格 `BrandSpecTable`
- 品牌选项从 `data_record` 的 `品牌` 字段查询
- 支持多品牌矩阵导出（未成交单元格标红）

---

### 6. 费用总览（`/expense`）

整合「临期费用分析」与「ATP 费用分析」的一站式总览页面，所有数据复用现有 API，不新增后端接口。

**功能说明：**

- **统一筛选条**：`ExpenseFilterBar` 月份区间、所别、阶层、形态、业务、规格、业代、复合形态
- **KPI 卡带**：`ExpenseKpiCards`
  - 临期费用总额、环比变化、涉及门店数
  - ATP 总付费金额、加权投入费比、加权付费点销额占比
- **趋势图**：`ExpenseTrendChart` 双系列（临期费用金额、ATP 付费金额）月度趋势
- **分布图**：`ExpenseDistributionChart` 维度切换（所别/阶层/形态/业务/规格/业代），饼图与条形图自动切换
- **排行表**：`ExpenseRankingTable` 各维度下的金额、占比、记录数
- **明细表**：`ExpenseDetailTable` 临期金额与 ATP 付费金额对比
- **压货分析面板**：`OverstockAnalysisPanel`（详见下文）
- **导出报告**：多 Sheet Excel（总览 KPI、月度趋势、临期维度排行、ATP 绩效明细、ATP 维度汇总）

#### 6.1 临期费用分析（`/expense/expiry`）

独立的临期费用分析看板。

- **KPI 卡片**：`ExpiryKpiCards` 临期费用总额、环比、临期项目数、高风险预警数、涉及门店数
- **趋势图**：`ExpiryTrendChart` 月度临期费用趋势
- **排行榜**：`ExpiryRankingTable` 区域/形态/规格/门店 TOP N
- **预警面板**：`ExpiryWarningPanel` 按风险等级排序的预警与处理建议
  - 总额预警 ≥ 5 万元、环比增幅 ≥ 20%
  - 区域/形态占比 ≥ 40%、规格占比 ≥ 30%、门店金额 ≥ 1 万元
- **筛选条**：`ExpiryFilterBar` 月份、区域、形态、规格、门店
- **钻取面板**：`ExpiryDrilldownPanel` 区域下钻明细

#### 6.2 ATP 费用分析（`/expense/atp`）

评估门店付费点位投入产出效率。

- **筛选条**：年月区间、所别、阶层、人员（多选联动）
- **ATP 绩效表**：`AtpPerformance` 按「所别 → 阶层 → 业代」聚合
  - 默认仅展示「所别合计」与「整体合计」
  - 点击「展开明细/缩放合计」切换显示全部明细
  - 投入费比、付费点销额占比表头可点击，展开近 6 个月历史列
  - Top3 值高亮（投入费比浅红、付费点销额占比浅绿）
  - 预警色：投入费比 > 所别合计 × 1.2 红色、> 所别合计 黄色
  - 一阶付费点数为 0 的业代自动隐藏
- **无数据状态**：隐藏筛选条与表格，仅显示空状态引导
- **导出**：Excel 包含「ATP绩效」与「付费门店明细」两个工作表

#### 6.3 压货分析（费用总览底部）

基于 cohort 的临期转化率分析，识别压货风险。

- **数据源**：最新数据集的 `data_record` 作为进货数据；`expense_profile` 中 sheetType 含「临期」的记录作为临期费用
- **保质期**：统一 6 个月，临期窗口为进货月份的 +4、+5 月
- **转化率**：每个 (门店, 规格, 进货月份) cohort 的 临期金额 / 进货金额
- **风险标记**：门店与业代转化率超过「均值 + 2×标准差」标记为压货风险
- **展示**：KPI、风险门店表、风险业代表、规格风险表、Cohort 明细
- **导出**：独立的「下载压货分析」按钮，生成 5 Sheet Excel

---

### 7. 服务点数分析（`/service-analysis`）

基于 ATP 绩效数据的服务点位投入产出分析看板。

**功能说明：**

- **筛选条**：`ServiceFilterBar` 月份区间、所别、阶层、业代、复合形态
- **KPI 卡片**：`ServiceKpiCards` 服务点数、付费金额、付费点销额、投入费比等
- **趋势图**：`ServiceTrendChart` 月度服务点数与付费金额趋势
- **分布图**：`ServiceDistributionChart` 按所别/阶层/业代维度分布
- **覆盖图**：`ServiceCoverageChart` 服务点位覆盖情况
- **排行榜**：`ServiceRankingTable` 各维度 TOP N
- **洞察面板**：`ServiceInsights` 自动生成分析结论
- **明细表**：`ServiceDetailTable` 业代/门店级明细
- **维度切换**：支持所别、阶层、业代等多种聚合维度
- **导出**：Excel 分析报告

---

## 数据上传规范

| 资料类型 | 模板位置 | 上传入口 | 覆盖规则 |
| --- | --- | --- | --- |
| 客户资料 | `client/src/assets/customer-template.xlsx` | 数据管理页 / 客户总览页 | 全量覆盖 |
| 线路资料 | `client/src/assets/route-template.xlsx` | 数据管理页 | 全量覆盖 |
| 费用资料 | `client/public/templates/数据模板-费用资料.xlsx` | 数据管理页 | 按所选月份覆盖 |
| 数据集 | — | 数据管理页 / 快速上传 | 按月份合并覆盖 |

**通用约束：**

- 上传数据直接写入 PostgreSQL，失败时抛错（不回退内存存储）
- 大批量数据按 1000 条/批分批上传
- 月份字段支持多种格式（`YYYY-MM`、`YYYY/MM`、`YYYY年MM月` 等）
- 客户编码归一化：保留 `1201/`、`KH` 开头；前导零数字补全为 `1201/{数字}`

---

## 相关设计文档

| 文档 | 路径 | 说明 |
| --- | --- | --- |
| UI 设计指南 | [AGENTS.md](./AGENTS.md) | 全局色彩、字体、布局、视觉语言、组件原则 |
| ATP 绩效分析设计 | [docs/atp-performance-analysis-plan.md](./docs/atp-performance-analysis-plan.md) | ATP 模块指标口径、交互设计、接口规范 |
| 临期分析开发计划 | [docs/expiry-analysis-plan.md](./docs/expiry-analysis-plan.md) | 临期识别、预警规则、处理建议引擎 |
| 费用总览实现计划 | [.trae/documents/expense-overview-plan.md](./.trae/documents/expense-overview-plan.md) | 费用总览页整合方案与分阶段实现 |
| 压货分析实施计划 | [.trae/documents/overstock-analysis-plan.md](./.trae/documents/overstock-analysis-plan.md) | Cohort 转化率与 2σ 风险标记算法 |

---

## 常用开发命令

```bash
# 开发
npm run dev                  # 同时启动前后端
npm run dev:server           # 仅后端
npm run dev:client           # 仅前端

# 构建与检查
npm run build:prod           # 生产构建（前后端）
npm run type:check           # 类型检查（前后端并发）
npm run eslint               # ESLint 静态检查
npm run stylelint            # Stylelint 样式检查
npm run lint                 # 综合 lint（含 type:check）

# 测试
npm run test                 # 单元测试
npm run test:watch           # 监听模式
npm run test:e2e             # 端到端测试

# 数据库
npm run gen:db-schema        # 同步数据库 schema 至 server/database/schema.ts

# 格式化
npm run format               # Prettier 格式化
```

---

## 项目结构

```
code/
├── client/                  # 前端源码
│   └── src/
│       ├── pages/           # 各功能页面（按板块分目录）
│       ├── components/      # 通用组件（ui/ + business-ui/）
│       ├── api/             # 前端 API 调用层
│       └── hooks/           # 自定义 Hooks
├── server/                  # 后端源码（NestJS）
│   └── modules/
│       ├── customer-profile/  # 客户资料模块
│       ├── dataset/           # 数据集与成交分析模块
│       ├── expense-profile/   # 费用资料模块（含临期/压货分析服务）
│       ├── route-profile/     # 线路资料模块
│       └── route-mapping/     # 线路映射模块
├── shared/                  # 前后端共享类型定义
├── docs/                    # 设计与分析文档
└── .trae/documents/         # 补充设计文档
```
