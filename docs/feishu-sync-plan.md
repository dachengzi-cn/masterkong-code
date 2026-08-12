# 飞书多维表格数据推送模块设计文稿

> 适用范围：服务端将数据集/分析结果定时或手动推送到飞书多维表格（Bitable）。
> 文档目的：固化「飞书 CLI 接入」的可行性评估结论与实施方案，明确认证授权、数据转换、推送执行、错误处理、定时任务与安全策略，供后续开发维护与团队同步参考。

---

## 1. 结论摘要（TL;DR）

- **可行性结论：可行，风险可控。**
- **方案选型**：生产推送通道采用**飞书开放平台 Open API 直连**（`tenant_access_token` + `batch_create`）；**飞书 CLI（lark-cli）** 仅作为配置验证、一次性运维与 AI Agent 交互的辅助工具，不作为生产定时推送主通道。
- 项目技术栈（NestJS + TypeScript + axios）与飞书 API 完全兼容，且项目构建于飞书生态 `@lark-apaas/fullstack-nestjs-core` 框架之上，集成成本低。
- 数据模型（`dataset.fields` + `dataRecord.content` JSONB）与多维表格字段模型天然匹配，转换仅涉及 text / number / date 三类字段。
- **预计工作量约 7–11 人日**（不含企业管理员审批等待）；单人全职排期 **2–3 周上线**。
- **主要风险点**：多维表格单表记录数上限（需确认目标表套餐额度）、写接口同表不支持并发（1254291）、企业管理员审批节奏。

---

## 2. 背景与目标

### 2.1 业务背景

营销团队的业务数据（客户资料、订单/回单、费用资料等）目前沉淀在本系统（PostgreSQL 数据集 + 内存模式），团队希望将关键数据与结果同步到飞书多维表格，便于在飞书内做二次协作、看板展示与数据治理。

### 2.2 设计目标

- 支持将指定数据集（含字段 schema 与全部记录）推送到飞书多维表格；
- 支持**定时推送**与**手动触发**两种模式；
- 推送过程可观测、可重试、可断点续传、不产生重复数据；
- 凭证与目标表配置可管理、可审计，密钥加密存储；
- 推送失败不阻塞系统主流程（上传/分析链路）。

---

## 3. 飞书平台能力调研

### 3.1 飞书 CLI（lark-cli）

| 项目 | 说明 |
| --- | --- |
| 开源状态 | MIT 协议，v1.0.0 官方开源，`npx @larksuite/cli@latest install` 一行安装 |
| 覆盖范围 | 11 大业务域、200+ 命令、19 个内置 AI Agent Skills、覆盖 2500+ API 端点 |
| 多维表格能力 | 60 个快捷命令（表格/记录/字段/视图/仪表盘），如 `lark-cli base +table-copy` |
| 认证模式 | OAuth 2.0 设备流，支持 bot（应用身份）/ user（用户身份）双身份，`--as bot` 可免个人授权 |
| 输出 | 结构化输出（JSON/NDJSON/CSV），支持 `--page-all` 分页、`--dry-run` 预览 |
| 定位 | 为 AI Agent / 交互式操作设计，支持无头（headless）模式 |

### 3.2 多维表格 Open API（生产推送通道核心接口）

**① 获取应用身份令牌**（server-to-server，无需用户授权）

```text
POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
Body: { "app_id": "cli_xxx", "app_secret": "xxx" }
→ { "code": 0, "tenant_access_token": "t-xxx", "expire": 7200 }
```

- token 有效期约 2 小时，过期需重新获取；多实例部署需缓存 + 并发去重。

**② 批量新增记录**

```text
POST https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create
Header: Authorization: Bearer {tenant_access_token}
Body: {
  "records": [{ "fields": { "客户编码": "1201/001", "回单金额": 1234.5, "日期": 1720000000000 } }],
  "client_token": "uuidv4"   // 幂等键，防重复写入
}
```

### 3.3 关键限制与实现策略

| 维度 | 官方限制 | 实现策略 |
| --- | --- | --- |
| 单次记录数 | 官方文档「单次最多 1,000 条」（部分镜像文档为 500 条） | 分片 500 条/批，遇 1254104 自动减半 |
| 频率限制 | 50 次/秒 | 实际限速 ≤ 10–20 批/秒，预留余量 |
| 幂等 | `client_token`（uuidv4），冲突报 1255006 | 每批生成唯一 uuid，失败重试复用 |
| 单表记录上限 | 错误码 1254103（记录数超限） | 上线前确认目标表套餐额度；超限需分表 |
| 并发 | 同一数据表不支持并发写接口（1254291） | 推送任务串行化（单队列） |
| 写入一致性 | `ignore_consistency_check` 参数 | 数据一致性要求高时保持默认 false |

**辅助接口**（实施中需要）：

- `GET /open-apis/bitable/v1/apps/{app_token}/tables` 列出数据表获取 `table_id`；
- `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields` 按数据集 schema 自动建字段；
- `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search` 按字段值查重（增量/去重推送）。

### 3.4 方案选型：CLI vs Open API

| 维度 | 飞书 CLI（lark-cli） | Open API 直连（推荐） |
| --- | --- | --- |
| 适用场景 | 一次性同步、AI Agent 指令、人工运维、调试排障 | 服务端定时批量推送（生产主通道） |
| 程序化控制 | 需子进程管理 + 解析 stdout，重试/分片/限速能力弱 | 原生支持：幂等、重试、分片、限速、错误分类 |
| 凭证管理 | 存于本机密钥链，面向交互 | 服务端 env/加密库，可控可审计 |
| 调度集成 | 无内置调度，需外部 cron 包裹 shell | 直接集成 @nestjs/schedule，纯进程内 |
| 数据量 | 适合小批量 | 适合万级记录（分片串行推送） |

**结论**：定时、自动、大批量的数据推送以 Open API 为主通道；CLI 用于开发调试阶段验证目标表/字段/权限配置，以及作为「一键手动同步」的运维工具。

---

## 4. 现有架构兼容性分析

### 4.1 技术栈现状

| 维度 | 现状 | 与飞书集成兼容性 |
| --- | --- | --- |
| 后端框架 | NestJS 10 + TypeScript | ✅ 完全兼容 |
| HTTP 客户端 | `axios` / `@nestjs/axios` 已在依赖中 | ✅ 直接复用，无需新增 |
| 数据库 | PostgreSQL + drizzle-orm（`DRIZZLE_DATABASE` DI token） | ✅ 用于任务/推送记录持久化 |
| 平台框架 | `@lark-apaas/fullstack-nestjs-core`（飞书生态 PaaS 框架） | ✅ 天然同生态，出网与部署环境契合 |
| 数据模型 | `dataset.fields: {name, type: 'text'\|'number'\|'date'}[]` + `dataRecord.content: JSONB` | ✅ 与多维表格字段模型一一对应 |
| 定时任务 | 无 `@nestjs/schedule`，服务端无 cron | 需新增依赖（轻量，标准方案） |
| 敏感凭证处理 | 已有先例：`ai-config.service.ts` 用 crypto-js AES 加密 API Key | ✅ 同一模式可复用于飞书 app_secret |
| 存储模式 | DB 模式 + 内存模式（`useMemoryStorage` 回退） | ⚠️ 推送读取层需兼容两种模式 |

### 4.2 兼容性结论

- **高兼容**。数据转换是唯一的核心新增逻辑，但字段类型仅 3 类（text/number/date），映射成本极低。
- 注意事项：项目存在内存模式回退（`DatasetService.useMemoryStorage`），推送服务读取记录时必须同时支持内存 Store 与 `data_record` 表两条路径。

---

## 5. 技术实施方案

### 5.1 总体架构

```text
┌─ 前端（推送配置页 / 手动触发）────────────┐
│  DatasetModule 已有接口                   │
└──────────────┬───────────────────────────┘
               ▼
┌─ 新增 FeishuSyncModule（NestJS）─────────────────────────┐
│  FeishuAuthService   → tenant_access_token 获取/缓存/刷新 │
│  SchemaMapperService → 数据集字段/记录 → 多维表格字段格式  │
│  PushService         → 分片、限速、幂等、重试、串行队列    │
│  SyncTaskService     → 任务状态机 + 断点续传               │
│  ScheduleService     → @nestjs/schedule 定时触发           │
└──────────────┬───────────────────────────┬──────────────┘
               ▼                           ▼
     飞书开放平台 Open API          PostgreSQL
   (open.feishu.cn:443)        (feishu_sync_* 表)
```

新增模块：`server/modules/feishu-sync/`（auth / schema-mapper / push / task / schedule 五个 service）。

新增数据库表：

| 表 | 用途 |
| --- | --- |
| `feishu_sync_config` | app_id/app_secret（AES 加密）、app_token、table_id、字段映射、定时 cron、启用开关 |
| `feishu_sync_task` | 批次号、目标表、记录数、成功/失败数、状态（pending/running/success/failed/partial）、幂等键、错误摘要 |
| `feishu_sync_record` | 失败明细（原始记录 ID + 错误码），供续推与排障 |

### 5.2 认证授权机制

1. **凭证来源**：企业管理员在飞书开放平台创建「自建应用」，获取 `app_id` / `app_secret`，开通权限：多维表格「查看、评论、编辑和管理多维表格」（`bitable:app` 权限，写记录必需），并授予目标多维表格访问权限。
2. **凭证存储**：`app_secret` 用环境变量注入 + 库内 AES 加密（复用 `ai-config.service.ts` 的 crypto-js 模式），前端只回显掩码。
3. **Token 生命周期**：内存缓存 `tenant_access_token`，`expire - 300s` 触发预刷新；多实例/多请求并发刷新时用单飞锁（module-level promise 缓存）防止 token 风暴。
4. **最小权限原则**：仅申请写记录所需权限，不申请通讯录等无关权限；目标表可在多维表格高级权限中限制为「仅该应用可读写」。

### 5.3 数据格式转换（SchemaMapperService）

现有 `FieldConfig = { name, type: 'text'|'number'|'date' }`，映射规则：

| 项目字段类型 | 多维表格字段类型 | 转换规则 |
| --- | --- | --- |
| `text` | 多行文本 (text) | 直接映射字符串 |
| `number` | 数字 (number) | `Number(value)`，无效值置 null |
| `date` | 日期 (date) | 转为 UTC 毫秒时间戳（注意时区） |

实现要点：

- 优先按字段名匹配目标表已有字段（大小写/全半角归一化），字段不存在时调用建字段接口自动补列；
- 空值统一为 null，避免 1254007（空值）报错；超长文本截断（单元格内容过大 1254130）；
- 预留扩展位：未来若字段升级为单选/多选，仅需扩展 mapper。

### 5.4 推送执行与效率（PushService）

```text
读取记录（DB 分页游标 / 内存 Store）
  → 分片 500 条/批
  → 每批生成 client_token(uuidv4)
  → 串行队列发送（遵守同表不并发写限制）
  → 记录批次进度到 feishu_sync_task
  → 成功 → 下一批；失败 → 分类处理（见 5.5）
```

- **分片**：500 条/批；遇 1254104（超限）将批尺寸减半重试。
- **限速**：官方 50 次/秒，实现预留 `--max-qps 20`，避免触发 1254290（请求过快）。
- **串行化**：同表写接口禁并发（1254291），PushService 内部维护单任务队列，跨任务用行级锁防重入。
- **效率测算**：按 20 批/秒 × 500 条 = 1 万条/秒的理论上限；实际 5 万行数据约 10 批、数秒内完成，远低于接口额度。
- **断点续传**：任务中途失败时记录已推送偏移量，重跑时从失败批次续推，不重复写（依赖 client_token 幂等）。

### 5.5 错误处理策略

错误按类别分层处理（错误码参考飞书文档）：

| 错误类型 | 错误码/状态 | 策略 |
| --- | --- | --- |
| 超频/限流 | 1254290、429、5xx | 指数退避重试（1s/2s/4s/8s，最多 5 次） |
| 数据未就绪 | 1254607 | 短延迟（500ms）重试 |
| 单次超限 | 1254104 | 批尺寸减半重试 |
| 幂等冲突 | 1255006 | 重新生成 client_token 重发 |
| 字段/类型错误 | 125406x（字段转换失败） | 标记该记录失败，跳过继续，失败明细入库 |
| 权限/表格不存在 | 1254003/1254004/1254302 | 停止任务，标记 failed，告警 |
| 并发写冲突 | 1254291 | 等待后重试（串行队列已规避） |
| 记录数超限 | 1254103 | 停止并告警，提示分表 |

配套：

- **告警**：任务失败或 partial 时，通过机器人向指定群发送 IM 消息（可选扩展，CLI `im +messages-send` 可辅助实现）。
- **审计**：每次推送生成任务记录（发起人、批次、成功/失败数、耗时），供排障与合规追溯。

### 5.6 定时任务配置

- 新增依赖 `@nestjs/schedule`（NestJS 官方定时方案，与现有 DI 体系无缝集成）。
- 配置项存 `feishu_sync_config`：`cron` 表达式（如每日 `0 2 * * *`）、目标数据集/表、是否启用。
- 每次触发前校验：凭证已配置、目标表存在、无进行中任务（防重叠）。
- 支持手动触发（前端按钮 → 立即执行）与定时触发双通道，共用同一 PushService。
- 内存模式提醒：内存数据随进程重启丢失，定时推送依赖 DB 持久化数据时需先确认服务数据源。

### 5.7 数据安全

- **传输**：全链路 HTTPS（open.feishu.cn 443 出站），凭证不落日志。
- **存储**：app_secret AES 加密入库，密钥走环境变量；token 仅驻留内存。
- **权限边界**：最小权限申请 + 目标表高级权限隔离，避免「全库可写」风险。
- **数据脱敏**：推送前可按字段名配置忽略/脱敏（如手机号、身份证等敏感列），在 mapper 层过滤。
- **审计**：推送记录表留存每次操作轨迹（谁、何时、推了什么、结果）。

### 5.8 系统稳定性

- **不影响主流程**：推送服务独立模块，失败不阻塞上传/分析主链路；推送走独立连接池/队列。
- **熔断**：连续 N 次 5xx 后停止当前任务并告警，避免打爆平台。
- **幂等兜底**：client_token + 任务级去重，网络超时重发不产生脏数据。
- **可观测**：Logger 结构化输出批次进度；任务表提供前端「推送记录」页实时查看。
- **同表串行**：规避 1254291 并发写冲突，是稳定性最关键的约束。

---

## 6. 开发工作量评估

| 阶段 | 内容 | 工作量（人日） |
| --- | --- | --- |
| 0. 前置准备 | 开放平台建应用、开权限、管理员审批、目标表准备（与开发并行） | 0.5–1（开发侧） |
| 1. 认证与配置模块 | FeishuAuthService + 配置 CRUD + 加密存储 | 1–2 |
| 2. 数据转换层 | SchemaMapper + 字段/类型映射 + 建字段 | 1–2 |
| 3. 推送执行层 | 分片、限速、幂等、重试、串行队列、任务状态机 | 1.5–2.5 |
| 4. 定时任务 | @nestjs/schedule 集成 + cron 配置 + 防重叠 | 0.5–1 |
| 5. 前端页面 | 推送配置表单、手动触发、推送记录列表 | 1–2 |
| 6. 测试与验证 | 单元测试（mapper/重试）+ 端到端真实表验证 | 1 |
| **合计** | | **约 7–11 人日** |

> 注：不引入 `@larksuite/node-sdk`（SDK 可选，自行封装更贴合现有 axios/DI 风格，减少依赖面）。

---

## 7. 功能实现路径与预期时间节点

```
Phase 0（第 1 周，与开发并行）
  ├─ 创建飞书自建应用、开通 bitable 权限、提交管理员审批
  ├─ 准备目标多维表格（或自动建表/建字段）
  └─ 产出：应用凭证 + 目标表 app_token/table_id
        ↓
Phase 1（第 1–2 周）核心开发
  ├─ FeishuSyncModule 骨架 + Auth + 配置管理
  ├─ SchemaMapper + PushService（分片/限速/重试/幂等）
  ├─ 定时任务 + 任务状态记录
  └─ 前端配置页 + 推送记录页
        ↓
Phase 2（第 2–3 周）验证与上线
  ├─ 单测 + 真实多维表格端到端验证（1 万行压测、断点续传、错误注入）
  ├─ 部署环境变量配置、出站网络放行 open.feishu.cn
  └─ 试运行 → 正式启用
```

**预期时间节点**：审批顺畅前提下，第 1 周末可跑通最小闭环（手动推送一条数据），第 2–3 周完成全部功能并正式上线。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 单表记录数上限（1254103） | 大数据集无法一次承载 | 上线前确认目标表套餐额度；超限分表或按周期建表 |
| 企业管理员审批延迟 | 阻塞联调 | Phase 0 前置申请，先用个人测试应用并行开发 |
| 同表并发写限制（1254291） | 多任务冲突 | 串行队列 + 行级锁，已在方案内 |
| 内存模式数据重启丢失 | 定时推送取不到数据 | 推送前置校验数据源，DB 模式为主 |
| 字段口径不一致 | 转换失败 | 字段名归一化匹配 + 失败记录明细入库 |

---

## 9. 待确认事项与后续行动

1. 确认 3 个关键输入：
   - 目标数据范围（哪些数据集/分析结果要推送）；
   - 数据规模（单表记录量，直接影响目标表额度与分片策略）；
   - 推送频率（每日/每小时，直接影响 cron 设计）。
2. 启动 Phase 0：创建飞书自建应用并提交权限审批（审批往往是最长等待项，建议最先申请）。
3. 开发启动后按 Phase 1 → Phase 2 推进，验证通过后正式启用。

---

## 10. 参考资料

- 飞书开放平台 - 新增多条记录（batch_create）：https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN
- 飞书 CLI 官方开源说明：https://open.feishu.cn/changelog?from=20220905bot&lang=zh-CN
- 官方 Feishu CLI 站点：https://feishu-cli.com/zh/
- Lark CLI: Put your AI to work in Lark：https://open.larkoffice.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu?lang=en-US
- 新增多条记录 - apifox 镜像文档（含错误码明细）：https://feishu.apifox.cn/api-9020913
