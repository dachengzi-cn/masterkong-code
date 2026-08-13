# 数据持久化与内存回退治理设计文档

> **版本**: v1.0  
> **更新日期**: 2026-07-13  
> **适用范围**: 全部后端业务数据存储模块  
> **关联模块**: 数据集、客户资料、线路资料、费用资料

---

## 目录

1. [设计目标与规范](#1-设计目标与规范)
2. [存储架构总览](#2-存储架构总览)
3. [MEMORY_FALLBACK 开关定义](#3-memory_fallback-开关定义)
4. [verifyDatabase 启动校验规则](#4-verifydatabase-启动校验规则)
5. [运行时降级决策规则](#5-运行时降级决策规则)
6. [实施状态](#6-实施状态)
7. [故障响应策略](#7-故障响应策略)

---

## 1. 设计目标与规范

### 1.1 核心规范

> **所有非临时性数据必须持久化存储在数据库中**，确保历史数据不会因应用程序重启、服务器故障或服务中断而丢失。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| **杜绝静默数据丢失** | 数据库不可用时禁止将业务数据写入进程内存后无声丢弃 |
| **快速失败（Fail-Fast）** | 存储不可用时立即暴露错误，而非降级运行 |
| **可配置性** | 通过环境变量控制是否允许内存降级，兼顾生产安全与离线演示 |
| **统一治理** | 所有数据模块采用一致的降级决策逻辑，消除行为差异 |

---

## 2. 存储架构总览

### 2.1 数据模块与存储表映射

| 模块 | Service | 主存储表 | 内存存储（仅降级时） |
|------|---------|---------|---------------------|
| 数据集 | `DatasetService` | `dataset` + `data_record` | `datasetStore: Map` |
| 客户资料 | `CustomerProfileService` | `customer_profile` | `memoryStore: Map` |
| 线路资料 | `RouteProfileService` | `route_profile` | `memoryStore: Map` |
| 费用资料 | `ExpenseProfileService` | `expense_profile` | `memoryStore: Map` |

### 2.2 双存储模式

每个业务模块内部维护 `useMemoryStorage` 标志，区分两种运行模式：

```
useMemoryStorage = false  → 所有读写走 PostgreSQL（正常模式）
useMemoryStorage = true   → 所有读写走进程内 Map（仅 MEMORY_FALLBACK=true 时允许）
```

### 2.3 内存存储的风险

| 风险 | 后果 |
|------|------|
| 进程重启 | 内存 Map 清空，数据永久丢失 |
| 多实例部署 | 各实例内存数据互相隔离，数据不一致 |
| 内存上限 | 大数据量上传可能导致 OOM |

---

## 3. MEMORY_FALLBACK 开关定义

### 3.1 环境变量

```bash
# .env
# MEMORY_FALLBACK: 数据库不可用时是否允许降级到内存存储（默认 false）
#   false = 数据库不可用时直接报错，拒绝静默降级（生产环境推荐）
#   true  = 保留内存降级能力（仅用于离线演示/开发，数据在重启后会丢失）
MEMORY_FALLBACK=false
```

### 3.2 取值语义

| 取值 | 数据库不可用时行为 | 适用场景 |
|------|-------------------|---------|
| `false`（默认） | 抛错拒绝降级，**数据绝不写入内存** | 生产环境、正式测试 |
| `true` | 降级到内存存储，数据可读但重启丢失 | 离线演示、无数据库的开发环境 |

### 3.3 读取方式

```typescript
// server/common/utils/memory-fallback.ts
export function isMemoryFallbackEnabled(): boolean {
  return String(process.env.MEMORY_FALLBACK ?? 'false').toLowerCase() === 'true';
}
```

> 未显式配置时默认 `false`，保证生产安全为默认行为。

---

## 4. verifyDatabase 启动校验规则

### 4.1 校验时机

所有业务服务实现 `OnModuleInit`，在**应用启动阶段**执行数据库连通性校验：

```typescript
async onModuleInit(): Promise<void> {
  await this.verifyDatabase();
}
```

### 4.2 校验逻辑

```typescript
private async verifyDatabase(): Promise<void> {
  try {
    const [result] = await this.db.select({ total: count() }).from(表).limit(1);
    this.useMemoryStorage = false;
    this.logger.log(`数据库正常 (${result?.total ?? 0} 条记录)，使用数据库存储`);
  } catch (err) {
    const message = (err as Error).message;
    if (isMemoryFallbackEnabled()) {
      // 显式开启降级时才允许内存模式
      this.useMemoryStorage = true;
      return;
    }
    // 默认行为：直接抛错，拒绝静默降级
    throw new Error(
      `[模块]数据库不可用且内存回退已禁用（MEMORY_FALLBACK=false），拒绝降级。原始错误: ${message}`,
    );
  }
}
```

### 4.3 行为约定

| 场景 | 行为 |
|------|------|
| 数据库可用 | `useMemoryStorage = false`，应用正常启动 |
| 数据库不可用 + `MEMORY_FALLBACK=false` | **抛错 → 应用启动失败**，日志明确提示 |
| 数据库不可用 + `MEMORY_FALLBACK=true` | 降级到内存模式，应用继续运行（数据有丢失风险） |

> **设计意图**: 启动时即校验，确保数据库就绪前应用不接收任何写请求，从源头杜绝数据写入内存。

---

## 5. 运行时降级决策规则

### 5.1 统一决策函数

```typescript
// server/common/utils/memory-fallback.ts
export function shouldFallbackToMemory(context: string, err: unknown): boolean {
  if (isMemoryFallbackEnabled()) {
    return true;  // 允许降级
  }
  // 默认：抛错拒绝降级
  throw new Error(`[${context}] 数据库操作失败且内存回退已禁用（MEMORY_FALLBACK=false），拒绝降级。原始错误: ${(err as Error)?.message}`);
}
```

### 5.2 调用模式

所有运行时数据库操作失败点统一采用以下模式：

```typescript
} catch (err) {
  if (shouldFallbackToMemory('ServiceName.methodName', err)) {
    this.logger.warn(`methodName 失败: ${(err as Error).message}`);
    this.useMemoryStorage = true;
    return this.methodName(...);  // 降级重试
  }
  throw err;  // 不可达，shouldFallbackToMemory 已抛错
}
```

### 5.3 治理范围

| 模块 | 治理方法数 | 说明 |
|------|-----------|------|
| `DatasetService` | 14 处 | findAll/create/appendRecords/remove/findOne/checkDuplicates/mergeByMonths/getKpis/getTrendChart/getBarChart/getPieChart/getSalesRepDrilldown/getSalesRepUnconvertedDrilldown/cleanupDuplicates/getSpecOptions |
| `CustomerProfileService` | 11 处 | getSummary/getLatestUploadRecord/findAll/findAllUnpaginated/upsertBatch/removeAll/removeOne/getDimensions/getFilterOptions/getClassification/getFormatDrilldown |
| `RouteProfileService` | 5 处 | getLatestUploadRecord/findAll/removeAll/removeOne/getAllRouteNames |
| `ExpenseProfileService` | 6 处 | getLatestUploadRecord/findAllUnpaginated/findAll/removeAll/removeOne |

> 所有降级点均改为「先判开关，再决定降级或抛错」，确保行为一致。

---

## 6. 实施状态

### 6.1 已完成（P0 整改）

| 项目 | 状态 | 说明 |
|------|------|------|
| `memory-fallback.ts` 辅助工具 | ✅ 已完成 | `isMemoryFallbackEnabled()` + `shouldFallbackToMemory()` |
| `.env` 添加 `MEMORY_FALLBACK=false` | ✅ 已完成 | 默认生产安全 |
| 4 模块 `verifyDatabase` 改造 | ✅ 已完成 | 失败即抛错 |
| 36 处运行时降级点治理 | ✅ 已完成 | 统一走开关决策 |
| 类型检查 + 生产构建 | ✅ 通过 | `type:check:server` + `build:server` 均通过 |

### 6.2 待办（后续迭代）

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 数据库恢复后自动切回 DB 模式 | P1 | 增加健康检查周期，恢复时自动切换并同步内存数据 |
| 移除 `DatasetService._instance` 静态共享 | P2 | 消除内存模式下的跨模块全局耦合 |
| 内存数据自动回写机制 | P2 | 降级期间数据落盘或重放，避免丢失 |

---

## 7. 故障响应策略

### 7.1 数据库不可用时的用户侧表现

| 层 | 行为 |
|----|------|
| 启动阶段 | 应用拒绝启动，日志输出「数据库不可用且内存回退已禁用」 |
| 运行阶段 | API 返回 500，前端显示明确错误提示，**数据不会被静默丢弃** |

### 7.2 运维指引

1. **确认开关状态**: 生产环境 `.env` 必须为 `MEMORY_FALLBACK=false`
2. **启动失败排查**: 若应用启动报数据库错误，优先检查 `SUDA_DATABASE_URL` 连接串与数据库服务状态
3. **临时演示**: 仅离线演示环境可设置 `MEMORY_FALLBACK=true`，需知晓重启丢数据风险
4. **监控告警**: 建议对启动失败与 500 错误建立告警，及时感知存储异常

---

## 附录 A: 快速决策矩阵

| 场景 | MEMORY_FALLBACK | 数据库状态 | 系统行为 |
|------|----------------|-----------|---------|
| 生产 | false | 可用 | 正常使用数据库 |
| 生产 | false | 不可用 | 启动失败 / 请求报错，数据安全 |
| 演示 | true | 可用 | 正常使用数据库 |
| 演示 | true | 不可用 | 降级内存，可演示但重启丢数据 |
