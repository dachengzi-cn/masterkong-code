# 重点数据分析平台

> 面向康师傅营销团队的多维数据分析应用，覆盖「客户资料 → 模板 → 上传 → 分析」全流程，支撑客户总览、成交分析、费用分析与服务点数分析等多维度数据洞察。

<div align="center">

**当前版本** `v1.7.0` ｜ **更新日期** 2026-08-12 ｜ **架构** 前后端分离全栈应用

</div>

---

## 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [技术栈详情](#技术栈详情)
- [安装与配置](#安装与配置)
- [使用指南](#使用指南)
- [API 文档](#api-文档)
- [数据库结构](#数据库结构)
- [贡献规范](#贡献规范)
- [已知问题](#已知问题)
- [许可证信息](#许可证信息)
- [联系方式](#联系方式)

---

## 项目概述

本项目是一个**营销业务数据分析平台**，帮助业务人员高效完成数据上传与多维分析。核心业务流为「客户资料 → 模板 → 上传 → 分析」四步闭环：

1. **数据采集**：通过 Excel 模板批量上传客户资料、线路资料、费用资料与销售数据集
2. **数据存储**：所有数据直接写入 PostgreSQL 数据库（无内存回退），支持按月合并覆盖
3. **多维分析**：成交率热力图、品牌规格矩阵、临期费用预警、ATP 投入产出、压货风险识别、服务点数分析
4. **决策输出**：KPI 看板、趋势图表、排行榜、风险预警、Excel 分析报告导出

**设计规范**：遵循 [AGENTS.md](./AGENTS.md) 中定义的 UI 设计指南——冷调蓝灰基底、极细边框、等宽数字排版，营造「精密仪器」般的数据分析氛围。

---

## 核心功能

### 板块总览

| 板块 | 路由 | 说明 |
| --- | --- | --- |
| 主页 | `/` | 更新日志与系统状态概览 |
| 数据管理 | `/data` | 客户/线路/费用资料上传、数据集管理与删除 |
| 客户总览 | `/customers` | 客户分类汇总、格式钻取、付费点分析 |
| 客户列表 | `/customer-list` | 客户明细搜索、分页、清空 |
| 成交分析 · 概览 | `/dashboard/overview` | KPI 卡片与趋势概览 |
| 成交分析 · 累计 | `/dashboard/cumulative` | 业代成交率热力图（累计口径） |
| 成交分析 · 当日 | `/dashboard/daily` | 按日粒度成交率热力图 |
| 成交分析 · 品牌规格 | `/dashboard/brand-spec` | 品牌 × 规格成交矩阵 |
| 费用总览 | `/expense` | 临期 + ATP + 压货一站式总览 |
| 临期费用分析 | `/expense/expiry` | 临期预警、排行榜、处理建议 |
| ATP 费用分析 | `/expense/atp` | 付费点位投入产出绩效分析 |
| 服务点数分析 | `/service-analysis` | 服务点位投入产出分析看板 |

### 关键能力速览

- **数据上传**：Excel 模板下载 → 上传解析 → 批量入库；费用数据按选中月份覆盖，未选月份保持不变
- **成交分析**：累计/当日双口径热力图，支持所别、阶层、业代、品牌、规格、线路、复合形态等多维筛选
- **临期预警**：总额、环比、区域/形态/规格集中度、门店异常六类预警规则，自动生成处理建议
- **ATP 绩效**：投入费比、付费点销额占比指标，支持近 6 个月历史下钻与 Top3 高亮
- **压货风险**：基于 (门店, 规格, 进货月份) cohort 的临期转化率，均值 + 2σ 标记风险
- **报表导出**：各模块均支持带样式的多 Sheet Excel 导出

---

## 技术栈详情

### 前端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| React | ^19.2.0 | UI 框架 |
| TypeScript | ^5.9.2 | 类型安全 |
| Vite | ^7.3.1 | 构建工具 |
| Tailwind CSS | ^4.1.13 | 样式方案 |
| Radix UI | ^1.4.3 | 无头组件库 |
| Recharts | ^2.15.4 | 趋势/柱状/饼图 |
| ECharts | ~5.6.0 | 复杂图表（分类饼图等） |
| react-router-dom | ^6.30.1 | 路由 |
| xlsx-js-style | ^1.2.0 | Excel 导出 |
| @lark-apaas/client-toolkit | ^1.2.50 | 平台能力（登录、用户、数据源） |

### 后端

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| NestJS | ^10.4.20 | 服务端框架 |
| Drizzle ORM | 0.44.6 | 数据访问层 |
| PostgreSQL | — | 主数据库 |
| @lark-apaas/fullstack-nestjs-core | ^1.1.52 | 全栈脚手架（认证、系统字段） |

### 工程化

ESLint 9 + Prettier + Stylelint + Jest 29（单元测试）+ Concurrently（并行启动）+ git hooks（pre-commit）

---

## 安装与配置

### 环境要求

| 依赖 | 最低版本 |
| --- | --- |
| Node.js | ≥ 22.0.0 |
| npm | ≥ 10.0.0 |
| PostgreSQL | 本地或远程实例（默认 5432 端口） |

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制根目录 `.env` 并按需修改：

```bash
# 数据库连接（必需）
SUDA_DATABASE_URL=postgresql://<用户名>@localhost:5432/postgres

# 平台配置（本地开发）
FORCE_AUTHN_INNERAPI_DOMAIN=http://localhost:3000

# 客户端基础路径
CLIENT_BASE_PATH=/

# 日志
LOG_REQUEST_BODY=true
LOG_RESPONSE_BODY=true

# AI 配置加密密钥（生产环境务必改为强随机字符串）
AI_CONFIG_ENCRYPTION_KEY=change-me-to-a-strong-random-key
```

> ⚠️ **权限要求**：数据库角色需具备应用表的 INSERT / UPDATE / DELETE 权限（`customer_profile`、`dataset`、`data_record`、`route_profile`、`route_mapping`、`expense_profile`）以及 `public` schema 下所有序列的 USAGE / SELECT 权限。

### 3. 初始化数据库（自动或手动）

**方式一（推荐，自动）**：应用启动时会在 `onApplicationBootstrap` 阶段**自动幂等创建**全部业务表、`anon_` 角色（datapaas 中间件以该角色执行请求 SQL）并授予权限。新环境只需正确配置 `SUDA_DATABASE_URL` 并确保连接用户有建表权限即可，无需手工执行任何 SQL。

**方式二（手动）**：如需提前初始化，可执行完整初始化脚本：

```bash
psql "$SUDA_DATABASE_URL" -f .tmp-init-db.sql
```

**方式三（增量迁移）**：后续新增功能表的迁移脚本位于 `server/database/migrations/`，按编号顺序执行：

```bash
for f in server/database/migrations/*.sql; do psql "$SUDA_DATABASE_URL" -f "$f"; done
```

> `npm run gen:db-schema` 仅用于将数据库结构反向同步至 `server/database/schema.ts`（开发辅助），**不会**创建表。

### 4. 启动开发服务

```bash
npm run dev             # 并行启动前后端（后端 :3000，前端 :8080）
```

| 服务 | 地址 |
| --- | --- |
| 后端（NestJS） | http://localhost:3000 |
| 前端（Vite） | http://localhost:8080 |

### 5. 生产构建

```bash
npm run build:prod      # 依次构建 server 与 client
```

---

## 使用指南

### 标准工作流

1. **上传数据**（`/data`）：下载模板 → 上传客户资料 / 线路资料 / 费用资料 / 销售数据集
2. **核对数据**：确认上传记录（文件名、行数、解析状态），必要时删除重建
3. **多维分析**：进入客户总览、成交分析、费用总览、服务点数分析等板块查看看板
4. **导出报告**：在各板块使用导出按钮生成 Excel

### 各板块详细说明

#### 数据管理（`/data`）

- 客户/线路/费用资料均支持模板下载、上传解析、进度取消、一键清空
- **费用资料覆盖规则**：按选中月份覆盖，仅处理包含选中月份的记录；选中无新数据的月份会删除该月既有数据
- 大批量数据（6 万条以上）按 1000 条/批自动分批上传

#### 客户总览（`/customers`）

- 分类表默认仅展示「所别合计」「部别合计」，点击「展开明细/收起明细」切换全部行
- 支持所别、层级多选筛选；饼图展示门店形态分布

#### 成交分析（`/dashboard/*`）

- 选择数据集与日期范围，快速选项（当月、上月、连续二/三月）位于日历下方
- **累计口径**：区间内累计成交率；**当日口径**：每日成交门店 / 每日线路门店
- 当日分析排除经销商类型：自售、特约士多批、特约特通批
- 品牌规格矩阵支持多品牌导出（未成交单元格标红）

#### 费用总览（`/expense`）

- 统一筛选条联动临期与 ATP 两套数据
- **临期**：KPI（总额、环比、门店数）+ 趋势 + 排行 + 预警 + 下钻
- **ATP**：默认仅合计行，可展开明细；投入费比/付费点销额占比表头点击展开近 6 个月历史
- **压货**：底部面板展示风险门店/业代/规格与 Cohort 明细，独立下载按钮

#### 服务点数分析（`/service-analysis`）

- 支持所别、阶层、业代维度切换；KPI + 趋势 + 分布 + 覆盖 + 排行 + 洞察 + 明细

### 常见提示

- 各分析页无数据时展示「暂无数据集，请先在数据管理页上传并解析数据集」空状态
- ATP 绩效页无数据时隐藏筛选条与表格，仅保留空状态引导

---

## API 文档

> 基础路径：`/api`。所有接口返回 JSON；写入接口鉴权取 `req.userContext.userId`（本地开发默认 `dev-user`）。多选参数以逗号分隔（如 `?region=华东,华南`）。

### 数据集与成交分析 `/api/datasets`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/datasets` | 数据集分页列表（page / pageSize） |
| POST | `/api/datasets` | 创建数据集（name / fields / records / dedupMode） |
| POST | `/api/datasets/merge-by-months` | 按月份合并覆盖上传（uploadMonths） |
| POST | `/api/datasets/check-duplicates` | 重复数据预检 |
| GET | `/api/datasets/system-status` | 系统状态（客户/数据最近更新时间） |
| GET | `/api/datasets/atp-months` | ATP 可用月份列表 |
| GET | `/api/datasets/atp-performance` | ATP 绩效聚合（dateFrom / dateTo / region / tier / salesRep 等） |
| GET | `/api/datasets/atp-performance-store-detail` | ATP 门店明细 |
| GET | `/api/datasets/brand-spec-options` | 全部品牌与规格选项 |
| POST | `/api/datasets/:id/records` | 追加记录 |
| GET | `/api/datasets/:id` | 数据集详情 |
| DELETE | `/api/datasets/:id` | 删除数据集 |
| GET | `/api/datasets/:id/kpis` | KPI 指标 |
| GET | `/api/datasets/:id/charts/trend` | 趋势图数据 |
| GET | `/api/datasets/:id/charts/bar` | 柱状图数据 |
| GET | `/api/datasets/:id/charts/pie` | 饼图数据 |
| GET | `/api/datasets/:id/heatmap` | 成交率热力图（mode=cumulative/daily） |
| POST | `/api/datasets/:id/cleanup-duplicates` | 清理重复数据 |
| GET | `/api/datasets/:id/unconverted-stores` | 未成交门店查询 |
| GET | `/api/datasets/:id/brand-spec-stats` | 品牌规格统计 |
| GET | `/api/datasets/:id/brand-spec-monthly` | 品牌规格月度统计 |
| GET | `/api/datasets/:id/spec-options` | 规格选项（按 sheetType / brand 筛选） |
| GET | `/api/datasets/:id/sales-rep-drilldown` | 业代钻取 |
| GET | `/api/datasets/:id/sales-rep-unconverted-drilldown` | 业代未成交钻取 |

**热力图请求示例：**

```http
GET /api/datasets/{id}/heatmap?dateFrom=2026-06-01&dateTo=2026-06-30&granularity=day&region=华东&tier=一阶&mode=cumulative
```

### 客户资料 `/api/customers`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/customers` | 客户分页列表（page / pageSize / keyword） |
| POST | `/api/customers` | 批量上传/更新客户资料（customers） |
| GET | `/api/customers/summary` | 客户汇总统计 |
| GET | `/api/customers/upload-record` | 最近上传记录 |
| GET | `/api/customers/classification` | 客户分类汇总 |
| GET | `/api/customers/classification/drilldown` | 格式钻取（region） |
| GET | `/api/customers/filter-options` | 筛选选项 |
| GET | `/api/customers/dimensions` | 客户维度 |
| DELETE | `/api/customers` | 清空全部客户 |
| DELETE | `/api/customers/:id` | 删除单个客户 |

### 线路资料 `/api/routes`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/routes` | 线路分页列表 |
| POST | `/api/routes` | 批量上传/更新线路资料（routes） |
| GET | `/api/routes/upload-record` | 最近上传记录 |
| GET | `/api/routes/names` | 全部线路名称 |
| DELETE | `/api/routes` | 清空全部线路 |
| DELETE | `/api/routes/:id` | 删除单条线路 |

### 费用资料与分析 `/api/expenses`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/expenses` | 费用分页列表（page / pageSize / sheetType） |
| POST | `/api/expenses` | 上传费用（expenses / uploadMonths，按月份追加） |
| POST | `/api/expenses/overwrite` | 覆盖上传费用 |
| GET | `/api/expenses/upload-record` | 最近上传记录 |
| GET | `/api/expenses/available-filters` | 可用月份与规格选项 |
| DELETE | `/api/expenses` | 清空全部费用 |
| DELETE | `/api/expenses/:id` | 删除单条费用 |
| GET | `/api/expenses/expiry-analysis` | 临期分析（monthFrom / monthTo / region / tier / business / specification 等） |
| GET | `/api/expenses/expiry-drilldown` | 临期下钻 |
| GET | `/api/expenses/expiry-over500-stores` | 单店超 5000 元明细 |
| GET | `/api/expenses/expiry-ranking-export` | 临期排行导出 |
| GET | `/api/expenses/overstock-analysis` | 压货分析（含 salesRep 筛选） |
| GET | `/api/expenses/overstock-analysis-export` | 压货分析导出 |

**临期分析请求示例：**

```http
GET /api/expenses/expiry-analysis?monthFrom=2026-05&monthTo=2026-06&region=华东&amountThreshold=5000
```

### 线路映射 `/api/route-mappings`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/route-mappings` | 映射分页列表 |
| POST | `/api/route-mappings` | 上传映射（需登录） |
| DELETE | `/api/route-mappings/:id` | 删除映射（需登录） |

### 类型定义

前后端共享类型位于 [shared/api.interface.ts](./shared/api.interface.ts)，覆盖上述所有接口的请求与响应结构。

---

## 数据库结构

核心业务表（[server/database/schema.ts](./server/database/schema.ts)）：

| 表 | 说明 | 关键字段 |
| --- | --- | --- |
| `dataset` | 数据集元数据 | name、rowCount、status、fields |
| `data_record` | 销售/进货明细 | dataset_id、content(jsonb)、content_hash |
| `customer_profile` | 客户主数据 | customer_code(唯一)、customer_name、region、tier、extras |
| `route_profile` | 线路资料 | customer_code(唯一)、route_name、extras |
| `route_mapping` | 线路映射 | customer_code、route_code、route_name |
| `expense_profile` | 费用资料 | customer_code、customer_name、sheet_type、extras |
| `report_record` | 报表记录 | type、title、file_name、file_path、file_size |

> 注：`content` / `extras` 为 JSONB 字段，承载模板中的动态列（品牌、规格、月份、金额等），字段识别采用模糊匹配工具方法（`findSpecificationField`、`findBrandField`、`findCustomerCodeField`、`findDateField`）。

---

## 贡献规范

### 分支与提交流程

1. 从 `main` 切出功能分支（`feat/xxx` 或 `fix/xxx`）
2. 代码完成后执行完整检查：

```bash
npm run lint              # 综合检查（含 type:check）
npm run eslint            # ESLint
npm run stylelint         # 样式检查
npm run test              # 单元测试
npm run build:prod        # 生产构建验证
```

3. 提交时遵循 pre-commit hook 自动校验（.githooks/pre-commit）

### 代码约定

- **类型安全**：前后端共享类型统一在 `shared/api.interface.ts` 定义，禁止前后端各自散落重复类型
- **动态字段**：数据集字段名多变，必须使用动态字段查找方法而非硬编码字段名
- **数据库写入**：必须直接写 PostgreSQL，失败抛错，禁止降级为内存存储
- **Drizzle 数组绑定**：`= ANY(...)` 需显式 `::text[]` 类型转换，避免 ROW 表达式解析错误
- **新增接口**：后端新增路由后，需在前端 `client/src/api/` 对应模块补充封装

### 提交信息格式

```text
feat: 新增压货分析模块
fix: 修复费用上传月份覆盖逻辑
refactor: 重构热力图数据聚合
```

---

## 已知问题

| 状态 | 问题 | 说明 |
| --- | --- | --- |
| ✅ 已解决 | 大批量上传 500 | 6 万条以上按 1000 条/批分批上传（覆盖 + 追加） |
| ✅ 已解决 | devtool-kits 日志上报 413 | 拦截 `/dev/logs/collect` 与 `/dev/logs/collect-batch` 返回 204 |
| ✅ 已解决 | koa-connect 上下文泄漏 | 改为原生 Koa 中间件实现 |
| ✅ 已解决 | Drizzle 数组参数 42809 | 显式 `::text[]` 类型转换 |
| ✅ 已解决 | 上传后历史月份丢失 | 按月合并覆盖策略 |
| 🔍 排查中 | 首页空白页问题 | 见 [debug-blank-page-root.md](./debug-blank-page-root.md)（后端 :3000 / 前端 :8080 均正常，HTML 与 JS 资源加载正常，待定位渲染层原因） |

---

## 许可证信息

本项目当前**未包含任何许可证文件（LICENSE）**，属于内部/私有项目。

在正式授权之前，请勿对外分发、修改或商业使用本项目代码。如需开源，请在取得项目负责人确认后补充合适的许可证（如 MIT / Apache-2.0）并创建 `LICENSE` 文件。

---

## 联系方式

| 渠道 | 说明 |
| --- | --- |
| 项目维护 | 请在 GitHub / 内网仓库提交 Issue 或通过代码评审反馈问题 |
| 需求与缺陷 | 联系项目负责人或数据平台团队 |

> 📌 补充：本 README 中的页面截图暂未收录，后续可在「使用指南」各板块处补充实际运行截图以增强可读性。

---

## 相关设计文档

| 文档 | 路径 | 说明 |
| --- | --- | --- |
| UI 设计指南 | [AGENTS.md](./AGENTS.md) | 全局色彩、字体、布局、视觉语言、组件原则 |
| ATP 绩效分析设计 | [docs/atp-performance-analysis-plan.md](./docs/atp-performance-analysis-plan.md) | ATP 模块指标口径、交互设计、接口规范 |
| 临期分析开发计划 | [docs/expiry-analysis-plan.md](./docs/expiry-analysis-plan.md) | 临期识别、预警规则、处理建议引擎 |
| 费用总览实现计划 | [.trae/documents/expense-overview-plan.md](./.trae/documents/expense-overview-plan.md) | 费用总览页整合方案与分阶段实现 |
| 压货分析实施计划 | [.trae/documents/overstock-analysis-plan.md](./.trae/documents/overstock-analysis-plan.md) | Cohort 转化率与 2σ 风险标记算法 |
