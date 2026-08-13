# 数据管理系统 — 数据上传元数据规则体系设计文档

> **版本**: v1.0  
> **更新日期**: 2026-07-13  
> **适用范围**: 数据管理模块全量上传/覆盖/清空操作  
> **关联模块**: 生产力数据、客户资料、线路资料、费用资料

---

## 目录

1. [系统架构概览](#1-系统架构概览)
2. [元数据字段定义](#2-元数据字段定义)
3. [数据新增场景 — 元数据生成与存储规则](#3-数据新增场景--元数据生成与存储规则)
4. [数据覆盖场景 — 元数据更新策略与冲突处理](#4-数据覆盖场景--元数据更新策略与冲突处理)
5. [清空操作元数据行为](#5-清空操作元数据行为)
6. [跨模块元数据一致性约束](#6-跨模块元数据一致性约束)
7. [已知问题与改进方向](#7-已知问题与改进方向)

---

## 1. 系统架构概览

### 1.1 数据模块与存储表映射

| 模块 | 文件名前缀 | 主存储表 | 关联表 | 覆盖策略 |
|------|-----------|---------|--------|---------|
| 生产力数据 | `数据模板-生产力数据` | `dataset` + `data_record` | — | 按月份覆盖 |
| 客户资料 | `数据模板-客户资料` | `customer_profile` | — | 全量覆盖（删后重建） |
| 线路资料 | `数据模板-线路资料` | `route_profile` | — | 全量覆盖（删后重建） |
| 费用资料 | `数据模板-费用资料` | `expense_profile` | — | 按月份覆盖 |

### 1.2 上传流水线

```
Excel文件 → 前端解析(xlsx-js-style) → 按模块分组 → 月份选择 → 后端分批写入 → DB持久化
```

**关键参数**:
- 生产力数据批次大小: **500 条/批**
- 客户/线路/费用资料批次大小: **200 条/批**
- 费用资料覆盖批次: 首批 `clearExisting=true`，后续批 `clearExisting=false`

---

## 2. 元数据字段定义

### 2.1 通用系统字段（所有表共有）

以下字段由 PostgreSQL Schema 自动生成或由框架注入，**禁止业务代码手动覆盖**（除 `updatedBy` 外）。

| 字段名 | 数据库列名 | 类型 | 生成规则 | 更新触发 |
|--------|-----------|------|---------|---------|
| 主键ID | `id` | `UUID` | `defaultRandom()` — 插入时自动生成 | 永不更新 |
| 创建时间 | `_created_at` | `timestamptz(3)` | `DEFAULT CURRENT_TIMESTAMP` — 插入时自动生成 | 永不更新 |
| 创建人 | `_created_by` | `user_profile` | `current_setting('app.user_id')` — 框架从会话注入 | 永不更新 |
| 更新时间 | `_updated_at` | `timestamptz(3)` | `DEFAULT CURRENT_TIMESTAMP` — 插入时自动生成 | 业务代码显式 `SET` |
| 更新人 | `_updated_by` | `user_profile` | `current_setting('app.user_id')` — 框架从会话注入 | 业务代码显式 `SET` |

> **重要**: `_updated_at` 的 `DEFAULT CURRENT_TIMESTAMP` 仅在 INSERT 时生效。UPDATE 操作必须由业务代码显式设置 `_updated_at = new Date()`，否则该字段不会自动刷新。

### 2.2 模块专有元数据字段

#### 2.2.1 `dataset` 表（生产力数据集元信息）

| 字段名 | 类型 | 说明 | 生成规则 |
|--------|------|------|---------|
| `name` | `varchar(255)` | 数据集名称（取自文件名去后缀） | 上传时由前端传入 |
| `fields` | `jsonb` | 字段配置数组 `[{name, type}]` | 前端从 Excel 表头推断，仅取首个 Sheet |
| `row_count` | `integer` | 记录总数 | 插入后由 `COUNT(*)` 查询回填或累加 |
| `status` | `varchar(50)` | 数据集状态 | 固定为 `'parsed'` |

#### 2.2.2 `data_record` 表（生产力数据明细）

| 字段名 | 类型 | 说明 | 生成规则 |
|--------|------|------|---------|
| `dataset_id` | `UUID` | 外键关联 `dataset.id` | 继承所属数据集的 ID |
| `content` | `jsonb` | 完整行数据 | 前端解析 Excel 后原样传入，含 `_sheetType` 标记 |
| `content_hash` | `varchar(32)` | 内容指纹 | `MD5(JSON.stringify(record))` — 后端计算 |

#### 2.2.3 `customer_profile` 表

| 字段名 | 类型 | 说明 | 生成规则 |
|--------|------|------|---------|
| `customer_code` | `varchar(255)` | 客户编码（唯一键） | 前端解析，支持别名映射 |
| `customer_name` | `varchar(255)` | 客户名称 | 前端解析 |
| `region` | `varchar(255)` | 区域 | 前端解析 |
| `tier` | `varchar(255)` | 层级 | 前端解析 |
| `extras` | `jsonb` | 扩展字段（经销商类型、客户经理等） | 前端解析非标准列后传入 |

#### 2.2.4 `route_profile` 表

| 字段名 | 类型 | 说明 | 生成规则 |
|--------|------|------|---------|
| `customer_code` | `varchar(255)` | 客户编码（唯一键） | 前端解析 |
| `route_name` | `varchar(255)` | 线路名称 | 前端解析 |
| `extras` | `jsonb` | 扩展字段 | 前端解析非标准列后传入 |

#### 2.2.5 `expense_profile` 表

| 字段名 | 类型 | 说明 | 生成规则 |
|--------|------|------|---------|
| `customer_code` | `varchar(255)` | 客户编码 | 前端解析并标准化（补 `1201/` 前缀） |
| `customer_name` | `varchar(255)` | 客户名称 | 前端解析 |
| `sheet_type` | `varchar(255)` | Sheet 类型 | 取自 Excel Sheet 名称 |
| `extras` | `jsonb` | 扩展字段（含月份、金额等） | 前端解析非标准列后传入 |

---

## 3. 数据新增场景 — 元数据生成与存储规则

### 3.1 生产力数据新增

**触发条件**: 首次上传或数据库中无已有同名数据集。

**流程**:

```
mergeByMonths(name, fields, records=[], uploadMonths)
  → 查询现有 dataset 列表
  → 若列表为空 → INSERT 新 dataset 记录
  → 分批 INSERT data_record (500条/批)
  → UPDATE dataset.row_count = records.length
```

**元数据生成规则**:

| 字段 | 生成方式 |
|------|---------|
| `dataset.id` | PostgreSQL `defaultRandom()` 自动生成 UUID |
| `dataset.name` | 前端传入（文件名去 `.xlsx` 后缀） |
| `dataset.fields` | 前端从 Excel 首个 Sheet 表头推断：`[{name: string, type: 'text'\|'number'\|'date'}]` |
| `dataset.row_count` | 初始为 `0`，插入记录后 UPDATE 为实际记录数 |
| `dataset.status` | 固定 `'parsed'` |
| `dataset._created_at` | `CURRENT_TIMESTAMP` 自动填充 |
| `dataset._created_by` | 框架从会话 `app.user_id` 注入 |
| `dataset._updated_at` | `CURRENT_TIMESTAMP` 自动填充（INSERT 阶段） |
| `dataset._updated_by` | 框架从会话注入 |
| `data_record.id` | `defaultRandom()` 自动生成 |
| `data_record.dataset_id` | 继承所属 `dataset.id` |
| `data_record.content` | 前端解析的完整行数据，含 `_sheetType` 字段标识来源 Sheet |
| `data_record.content_hash` | `createHash('md5').update(JSON.stringify(record)).digest('hex')` |
| `data_record._created_at/by` | 同 dataset 规则 |
| `data_record._updated_at/by` | 同 dataset 规则 |

**`content` JSONB 结构示例**:

```json
{
  "_sheetType": "一阶订单",
  "订单-订单日期": "2026-06-01",
  "客户-通路客户编码": "1201/00001",
  "品牌": "品牌A",
  "产品-规格": "规格X",
  "订单数量-不含促销": "100",
  "订单金额": "5820.00",
  "组织-营业所": "华南所",
  "客户-客户形态": "CA0"
}
```

**字段推断规则** (`inferFieldTypeFromRows`):

- 采样前 20 行数据
- 优先级: `date` > `number` > `text`
- 日期模式: `/^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/`
- 数字模式: `/^-?\d+(\.\d+)?$/`

**列名标准化规则** (`PRODUCTIVITY_COLUMN_MAP`):

| 原始列名 | 标准化列名 |
|---------|-----------|
| `时间-日期` | `订单-订单日期` |
| `客户-业务代表` | `人员-业代` |
| `客户-客户编码` | `客户-通路客户编码` |
| `产品-品牌` | `品牌` |
| `累计排单数量（+非领搭赠，自然箱，含上月排单未过账）` | `订单数量-不含促销` |
| `累计过账数量（+非领搭赠，自然箱）` | `订单数量-不含促销` |
| `回单数量-不含促销` | `订单数量-不含促销` |

> 未在映射表中的列名保持原样。空表头自动命名为 `列N`（N 为列序号）。

### 3.2 客户资料新增

**流程**: `removeAllCustomers()` → `upsertBatch(customers, userId)`

> **注意**: 客户资料始终采用「先全删再插入」策略，不存在纯新增场景。即使数据库为空，也会先执行 `DELETE FROM customer_profile`。

**元数据生成规则**:

| 字段 | 生成方式 |
|------|---------|
| `id` | `defaultRandom()` 自动生成 |
| `customer_code` | 前端通过别名映射解析（`客户编码`/`客户代码`/`编码`/`客户编号`/`code`） |
| `customer_name` | 前端通过别名映射解析 |
| `region` | 前端通过别名映射解析（`区域`/`大区`/`地区`/`营业所`/`所别` 等） |
| `tier` | 前端通过别名映射解析（`层级`/`阶层`/`级别`/`分级` 等） |
| `extras` | 非标准列（未命中别名映射的列）以 `{列名: 值}` 形式存入；**付费金额列（如 `付费金额`、`付费金额(元)` 等）一律过滤，不导入系统** |
| `_created_at/by` | INSERT 时自动/框架注入 |
| `_updated_at/by` | INSERT 时自动/框架注入 |

> **⚠ 付费金额唯一来源约束**（重要）:
> 客户资料中**不再允许出现付费金额数据**。付费金额唯一来源为**费用资料**（`expense_profile` 中 `sheetType = 'ATP费用'` 的 `计划付费金额`，记录金额 ÷ 3 分摊至执行开始日期起 3 个月）。
> - 前端解析阶段：命中付费金额列名黑名单的列被过滤，并向用户给出提示（`已忽略「付费金额」列…`）；
> - 后端入库阶段：`sanitizeExtras` 再次剔除 `付费金额` 相关键，作为最终防线；
> - 上传模板说明：用户操作手册与模板中已明确，客户资料上传数据不应包含付费金额列。

**`extras` 序列化规则** (`sanitizeExtras`):

| 原始值类型 | 存储值 |
|-----------|--------|
| `undefined` / `null` | `''`（空字符串） |
| `Date` 对象 | `ISO 8601 字符串` |
| `Object` / `Array` | `JSON.stringify()` |
| 其他 | `String(value)` |

### 3.3 线路资料新增

**流程**: `removeAllRoutes()` → `upsertBatch(routes, userId)`

与客户资料同理，始终先全删再插入。元数据生成规则与客户资料一致，区别在于业务字段为 `customer_code`、`route_name`、`extras`。

### 3.4 费用资料新增

**流程**: `overwriteExpenses(batch, uploadMonths)` → 后续批 `uploadExpenses(batch, uploadMonths)`

**首批处理** (`clearExisting=true`):

1. 过滤：仅保留 `extras` 中包含 `N月 YYYY` 格式且匹配 `uploadMonths` 的记录
2. 删除：`DELETE FROM expense_profile WHERE extras 中存在匹配 uploadMonths 的月份值`
3. 插入：分批 INSERT（200条/批）

**后续批处理** (`clearExisting=false`):

1. 过滤：同首批
2. 插入：分批 INSERT（200条/批），不再执行 DELETE

**月份提取规则** (`extractMonthFromRecord`):

- 遍历 `extras` 所有值
- 正则匹配: `/(\d+)月\s+(\d{4})/`
- 提取为 `YYYY-MM` 格式
- 仅当匹配到的月份在 `uploadMonths` 列表中时，该记录才会被上传

**元数据生成规则**:

| 字段 | 生成方式 |
|------|---------|
| `id` | `defaultRandom()` 自动生成 |
| `customer_code` | 前端解析并标准化（`normalizeExpenseCustomerCode`） |
| `customer_name` | 前端通过别名映射解析 |
| `sheet_type` | 取自 Excel Sheet 名称 |
| `extras` | 非标准列存入，含月份值和金额字段 |
| `_created_at/by` | INSERT 时自动/框架注入 |
| `_updated_at/by` | INSERT 时自动/框架注入 |

**客户编码标准化规则** (`normalizeExpenseCustomerCode`):

| 原始格式 | 标准化结果 |
|---------|-----------|
| `1201/00001` | 保持不变（已含前缀） |
| `KH00001` | 保持不变（KH 前缀） |
| `00001` | `1201/1`（去除前导零，补 `1201/` 前缀） |
| 其他 | 原样保留 |

---

## 4. 数据覆盖场景 — 元数据更新策略与冲突处理

### 4.1 生产力数据覆盖（按月份覆盖）

**触发条件**: 数据库中已存在 dataset 记录，且用户选择了特定月份。

**核心策略**: `mergeByMonths`

```
1. 查询现有 dataset（按 _created_at DESC 排序，取最新一条）
2. 确定 monthsToDelete:
   - 若 uploadMonths 非空 → 使用 uploadMonths
   - 若 uploadMonths 为空 → 从新数据日期字段自动提取月份
3. DELETE FROM data_record 
     WHERE dataset_id = 目标ID 
     AND 日期字段值落在 monthsToDelete 任意月份范围内
4. 分批 INSERT 新记录 (500条/批)
5. COUNT(*) 查询回填 dataset.row_count
6. UPDATE dataset SET name, fields, row_count, status, _updated_at, _updated_by
```

**月份范围删除 SQL 逻辑**:

```sql
-- 对每个目标月份 YYYY-MM 构建条件
content->>'日期字段' (经 ./ 替换为 -) >= 'YYYY-MM-01'
AND content->>'日期字段' < '下月-01'
-- 多个月份用 OR 连接
```

**元数据更新规则**:

| 字段 | 更新行为 |
|------|---------|
| `dataset.id` | **不变** — 复用已有数据集 ID |
| `dataset.name` | **更新** — 覆盖为本次上传的文件名 |
| `dataset.fields` | **更新** — 覆盖为本次上传的字段配置 |
| `dataset.row_count` | **重算** — `COUNT(*) FROM data_record WHERE dataset_id = ID` |
| `dataset.status` | **重置** — 固定 `'parsed'` |
| `dataset._updated_at` | **更新** — `new Date()` |
| `dataset._updated_by` | **更新** — 当前会话用户 |
| `data_record` (新插入) | 全新记录，`id`/`_created_at`/`_created_by` 自动生成 |
| `data_record` (被删除月份) | 物理删除，不可恢复 |

**未选中月份的记录**:

- **保留** — 不在 `monthsToDelete` 范围内的 `data_record` 记录不受影响
- 元数据（`_created_at`/`_created_by` 等）保持原始值

**冲突处理 — 无日期字段场景**:

```
若 dateField 不存在:
  → DELETE FROM data_record WHERE dataset_id = 目标ID  (全删)
  → INSERT 全部新记录
```

> **风险提示**: 无日期字段时退化为全量覆盖，与按月份覆盖语义不同。

### 4.2 客户资料覆盖（全量覆盖）

**策略**: 先全删再插入（非 Upsert 语义，实际为 Truncate + Insert）

```
1. DELETE FROM customer_profile  (全表删除)
2. 分批 INSERT (200条/批)，使用 onConflictDoUpdate 兜底
```

**元数据更新规则**:

| 字段 | 更新行为 |
|------|---------|
| `id` | **重新生成** — 旧记录物理删除，新记录 `defaultRandom()` |
| `customer_code` | **来自新数据** — 若与旧数据重复则触发 `ON CONFLICT` |
| `customer_name` / `region` / `tier` / `extras` | **来自新数据** — 冲突时取 `EXCLUDED` 值 |
| `_created_at` / `_created_by` | **重置** — 新 INSERT 时自动生成 |
| `_updated_at` | **不显式更新** — 见下方冲突处理说明 |
| `_updated_by` | **更新** — 取 `EXCLUDED._updated_by` |

**`ON CONFLICT` 冲突处理**:

```sql
INSERT INTO customer_profile (customer_code, customer_name, region, tier, extras, _created_by, _updated_by)
VALUES (...)
ON CONFLICT (customer_code) DO UPDATE SET
  customer_name = EXCLUDED.customer_name,
  region = EXCLUDED.region,
  tier = EXCLUDED.tier,
  extras = EXCLUDED.extras,
  _updated_by = EXCLUDED._updated_by;
  -- ⚠️ _updated_at 未包含在 SET 中
```

> **已知缺陷**: `ON CONFLICT DO UPDATE` 的 `SET` 子句未包含 `_updated_at`。当冲突更新时，`_updated_at` 不会刷新为当前时间，保留首次 INSERT 时的值。但由于实际流程为「先全删再插入」，冲突仅在 DELETE 与 INSERT 之间的并发窗口内可能发生，生产环境概率极低。

### 4.3 线路资料覆盖（全量覆盖）

**策略**: 与客户资料完全一致 — 先全删再插入。

**`ON CONFLICT` 冲突处理**:

```sql
ON CONFLICT (customer_code) DO UPDATE SET
  route_name = EXCLUDED.route_name,
  extras = EXCLUDED.extras,
  _updated_by = EXCLUDED._updated_by;
  -- ⚠️ _updated_at 同样未包含在 SET 中
```

> 同客户资料的 `_updated_at` 缺陷问题。

### 4.4 费用资料覆盖（按月份覆盖）

**策略**: 按选定月份删除旧数据后插入新数据。

```
1. 过滤: 仅保留 extras 中月份匹配 uploadMonths 的记录
2. DELETE FROM expense_profile 
     WHERE extras 中存在匹配 uploadMonths 的 "N月 YYYY" 格式值
3. 分批 INSERT (200条/批) — 纯 INSERT，无 ON CONFLICT
```

**月份匹配 DELETE SQL**:

```sql
DELETE FROM expense_profile
WHERE EXISTS (
  SELECT 1
  FROM jsonb_each_text(extras) AS kv
  WHERE kv.value ~ '^[0-9]+月\s+[0-9]{4}$'
    AND to_char(
      to_date(regexp_replace(kv.value, '([0-9]+)月\s+([0-9]{4})', '\2-\1'), 'YYYY-MM'),
      'YYYY-MM'
    ) = ANY($1::text[])  -- uploadMonths 数组
)
```

**元数据更新规则**:

| 字段 | 更新行为 |
|------|---------|
| `id` | **重新生成** — 被删月份的旧记录物理删除，新记录 `defaultRandom()` |
| `customer_code` | **来自新数据** — 经 `normalizeExpenseCustomerCode` 标准化 |
| `customer_name` / `sheet_type` / `extras` | **来自新数据** |
| `_created_at` / `_created_by` | **重置** — 新 INSERT 时自动生成 |
| `_updated_at` / `_updated_by` | **重置** — 新 INSERT 时自动生成 |

**未选中月份的记录**:

- **保留** — 不匹配 `uploadMonths` 的记录不受 DELETE 影响
- 元数据保持原始值

**冲突处理**:

> `expense_profile` 表无唯一约束（`customer_code` 非唯一），因此不会发生主键冲突。同一客户同月可有多条记录。

**边界场景 — 选中月份无新数据**:

- DELETE 仍会执行（删除该月旧数据）
- INSERT 0 条
- **结果**: 该月数据被清空

---

## 5. 清空操作元数据行为

### 5.1 清空全部数据

**触发**: 点击「清空数据」按钮。

**执行顺序**:

```
1. 查询所有 dataset (page=1, pageSize=1000)
2. 逐个删除 dataset → 级联删除 data_record (FK ON DELETE CASCADE)
   - 404 错误忽略（dataset 已不存在）
3. 并行执行:
   - customerApi.removeAllCustomers()  → DELETE FROM customer_profile
   - routeApi.removeAllRoutes()        → DELETE FROM route_profile
   - expenseApi.removeAllExpenses()    → DELETE FROM expense_profile
```

**元数据行为**:

| 表 | 行为 |
|----|------|
| `dataset` | 全部物理删除 |
| `data_record` | 级联删除（`ON DELETE CASCADE`） |
| `customer_profile` | 全部物理删除 |
| `route_profile` | 全部物理删除 |
| `expense_profile` | 全部物理删除 |

> 清空后所有表的 `_created_at`/`_updated_at` 等元数据随记录一同消失，不可恢复。

---

## 6. 跨模块元数据一致性约束

### 6.1 客户编码一致性

| 模块 | 编码标准化 | 说明 |
|------|-----------|------|
| 生产力数据 | 无标准化 | 原样存储 `客户-通路客户编码` 值 |
| 客户资料 | 无标准化 | 原样存储解析值 |
| 线路资料 | 无标准化 | 原样存储解析值 |
| 费用资料 | `normalizeExpenseCustomerCode` | 补 `1201/` 前缀、去前导零 |

> **注意**: 费用资料的编码标准化与其他模块不一致，跨模块 JOIN 时需注意编码格式对齐。

### 6.2 时间戳一致性

| 场景 | `_created_at` | `_updated_at` | 说明 |
|------|--------------|--------------|------|
| 新增 | 自动生成 | 自动生成 | 两者相同 |
| 生产力按月覆盖 — 新记录 | 自动生成 | 自动生成 | 新 INSERT |
| 生产力按月覆盖 — 保留记录 | 不变 | 不变 | 未受影响 |
| 客户/线路覆盖 — 新记录 | 自动生成 | 自动生成 | 先删后插 |
| 客户/线路覆盖 — 冲突更新 | 不变 | ⚠️ **不更新** | `ON CONFLICT` 未 SET `_updated_at` |
| 费用按月覆盖 — 新记录 | 自动生成 | 自动生成 | 新 INSERT |
| 费用按月覆盖 — 保留记录 | 不变 | 不变 | 未受影响 |

### 6.3 `content_hash` 一致性

- 仅 `data_record` 表有 `content_hash` 字段
- 计算方式: `MD5(JSON.stringify(record))`
- 用途: 去重查询（`buildDedupedSubquery` 使用 `DISTINCT ON (content_hash)`）
- **不用于冲突检测** — 覆盖时不依据 hash 判断重复

### 6.4 `fields` 元数据一致性

- 仅 `dataset` 表有 `fields` 字段
- **来源**: 前端从 Excel 首个 Sheet 推断
- **覆盖时机**: 每次 `mergeByMonths` 或 `create` 时整体覆盖
- **已知问题**: 多 Sheet 生产力数据仅记录首个 Sheet 的字段定义，其余 Sheet 的独有列（如 `回单金额`、`累计排单金额`、`累计过账金额`）不在 `fields` 中，但在 `data_record.content` 中实际存在

---

## 7. 已知问题与改进方向

### 7.1 `fields` 元数据不完整

**现象**: 生产力数据含 4 个 Sheet（一阶订单/一阶回单/二阶订单/二阶回单），`dataset.fields` 仅记录首个 Sheet 的字段。

**影响**: 前端动态字段发现机制无法感知其他 Sheet 的独有列。

**当前状态**: 实际数据已完整保存到 `data_record.content`，仅元数据缺失。

**建议**: 修改 `parseProductivityFile`，合并所有 Sheet 的字段定义：

```typescript
// 当前逻辑（仅取首个 Sheet）
if (allFields.length === 0) {
  allFields = validIndices.map(({ h, i }) => ({ name: h, type: inferFieldTypeFromRows(rows, i) }));
}

// 建议改为（合并所有 Sheet）
for (const { h, i } of validIndices) {
  if (!allFields.find(f => f.name === h)) {
    allFields.push({ name: h, type: inferFieldTypeFromRows(rows, i) });
  }
}
```

### 7.2 `ON CONFLICT` 未更新 `_updated_at`

**影响表**: `customer_profile`、`route_profile`

**现象**: `onConflictDoUpdate` 的 `SET` 子句未包含 `_updated_at`，冲突更新时该字段不刷新。

**建议**: 在 `SET` 中增加 `updatedAt: new Date()`：

```typescript
.onConflictDoUpdate({
  target: customerProfile.customerCode,
  set: {
    customerName: sql`EXCLUDED.customer_name`,
    region: sql`EXCLUDED.region`,
    tier: sql`EXCLUDED.tier`,
    extras: sql`EXCLUDED.extras`,
    updatedAt: new Date(),  // ← 补充
    updatedBy: sql`EXCLUDED._updated_by`,
  },
});
```

### 7.3 内存回退机制治理

**影响**: 部分服务在 DB 写入失败时回退到内存存储（`useMemoryStorage = true`），可能导致数据在服务重启后丢失。

**当前状态（2026-07-13 已治理）**:
- 引入 `MEMORY_FALLBACK` 环境开关（默认 `false`），数据库不可用时**直接报错拒绝降级**，杜绝静默数据丢失
- 4 个数据模块（数据集/客户/线路/费用）的 `verifyDatabase` 与全部运行时降级点已统一治理
- 具体治理方案与决策矩阵详见 **[数据持久化与内存回退治理设计文档](memory-storage-governance.md)**

### 7.4 费用资料无唯一约束

**现象**: `expense_profile` 表无 `ON CONFLICT` 机制，同一客户同月可有多条记录。

**影响**: 重复上传同月数据时，DELETE + INSERT 策略可保证不重复，但若 DELETE 失败而 INSERT 成功，会产生重复数据。

**建议**: 考虑增加 `(customer_code, sheet_type, 月份)` 的复合唯一索引，并在 INSERT 时使用 `ON CONFLICT DO UPDATE`。

---

## 附录 A: 元数据字段速查表

### dataset 表

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `id` | UUID | PK | `defaultRandom()` |
| `name` | varchar(255) | NOT NULL | — |
| `row_count` | integer | NOT NULL | `0` |
| `status` | varchar(50) | NOT NULL | `'pending'` |
| `fields` | jsonb | NOT NULL | `'[]'` |
| `_created_at` | timestamptz(3) | NOT NULL | `CURRENT_TIMESTAMP` |
| `_created_by` | user_profile | — | NULL/会话注入 |
| `_updated_at` | timestamptz(3) | NOT NULL | `CURRENT_TIMESTAMP` |
| `_updated_by` | user_profile | — | NULL/会话注入 |

### data_record 表

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `id` | UUID | PK | `defaultRandom()` |
| `dataset_id` | UUID | NOT NULL, FK→dataset.id (CASCADE) | — |
| `content` | jsonb | NOT NULL | `'{}'` |
| `content_hash` | varchar(32) | — | NULL |
| `_created_at` | timestamptz(3) | NOT NULL | `CURRENT_TIMESTAMP` |
| `_created_by` | user_profile | — | NULL/会话注入 |
| `_updated_at` | timestamptz(3) | NOT NULL | `CURRENT_TIMESTAMP` |
| `_updated_by` | user_profile | — | NULL/会话注入 |

### customer_profile 表

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `id` | UUID | PK | `defaultRandom()` |
| `customer_code` | varchar(255) | NOT NULL, UNIQUE | — |
| `customer_name` | varchar(255) | NOT NULL | — |
| `region` | varchar(255) | NOT NULL | — |
| `tier` | varchar(255) | NOT NULL | — |
| `extras` | jsonb | NOT NULL | `'{}'` |
| `_created_at/by` | — | — | 同上 |
| `_updated_at/by` | — | — | 同上 |

### route_profile 表

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `id` | UUID | PK | `defaultRandom()` |
| `customer_code` | varchar(255) | NOT NULL, UNIQUE | — |
| `route_name` | varchar(255) | NOT NULL | — |
| `extras` | jsonb | NOT NULL | `'{}'` |
| `_created_at/by` | — | — | 同上 |
| `_updated_at/by` | — | — | 同上 |

### expense_profile 表

| 列名 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `id` | UUID | PK | `defaultRandom()` |
| `customer_code` | varchar(255) | NOT NULL | — |
| `customer_name` | varchar(255) | — | NULL |
| `sheet_type` | varchar(255) | NOT NULL | — |
| `extras` | jsonb | NOT NULL | `'{}'` |
| `_created_at/by` | — | — | 同上 |
| `_updated_at/by` | — | — | 同上 |

---

## 附录 B: 各模块覆盖策略决策矩阵

| 模块 | 覆盖粒度 | DELETE 范围 | INSERT 方式 | 冲突处理 | 未选月份 |
|------|---------|------------|------------|---------|---------|
| 生产力数据 | 按月份 | 日期字段匹配目标月份的 data_record | 纯 INSERT（新记录） | 无（旧数据已删） | 保留 |
| 客户资料 | 全量 | 全表 DELETE | INSERT + ON CONFLICT DO UPDATE | 更新业务字段 | N/A（无月份概念） |
| 线路资料 | 全量 | 全表 DELETE | INSERT + ON CONFLICT DO UPDATE | 更新业务字段 | N/A（无月份概念） |
| 费用资料 | 按月份 | extras 月份值匹配目标月份的记录 | 纯 INSERT（无 ON CONFLICT） | 无（旧数据已删） | 保留 |
