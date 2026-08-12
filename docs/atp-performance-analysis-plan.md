# ATP 绩效分析模块设计文稿

> 适用范围：费用总览 → ATP 费用分析页面（`/expense/atp`）。
> 文档目的：固化 ATP 绩效分析的实现思路、数据来源、指标口径与交互设计，供后续维护与迭代参考。

---

## 1. 背景与目标

### 1.1 业务背景

ATP（Activation / Trade Promotion）费用分析用于评估门店付费点位的投入产出效率。业务侧需要回答：

- 各营业所、各阶层、各业代付费点位的数量与金额分布；
- 投入费比（付费金额 / 付费门店销额）是否健康；
- 付费门店销额占总门店销额的转化比例；
- 费比异常（过高 / 过低）及低销额门店的占比；
- 近 6 个月关键指标的历史趋势。

### 1.2 设计目标

- 以客户资料为维度主表，以费用资料中的「客户销额」为金额来源；
- 按「所别 → 阶层 → 业代」层级聚合，同时支持下钻到单门店明细；
- 关键指标支持近 6 个月展开对比；
- 默认仅展示汇总，避免信息过载；
- 无数据时隐藏全部分析 UI，仅保留空状态引导。

---

## 2. 数据来源与关联

### 2.1 主数据源

| 来源 | 表/工作表 | 作用 |
| --- | --- | --- |
| 客户资料 | `customer_profile` | 门店主数据：所别、阶层、业代、总点数、付费点数 |
| 费用资料 | `expense_profile`（`sheetType = '客户销额'`） | 客户编码维度的门店销额 |
| 费用资料 | `expense_profile`（`sheetType = 'ATP费用'`） | 付费金额唯一来源（`计划付费金额`） |

### 2.2 关联键

- 客户资料的客户编码与费用资料的客户编码通过 **客户编码** 关联。
- 编码归一化规则（`normalizeAtpCustomerCode`）：
  - 保留 `1201/`、`KH` 开头的原始编码；
  - 对前导零数字编码补全为 `1201/{数字}`。

### 2.3 月份口径

- 客户销额工作表中存在字段 `时间-年/月`，用于识别该条销额记录所属月份。
- 支持多种月份格式：`YYYY-MM`、`YYYY/MM`、`YYYY年MM月`、`MM月 YYYY`、完整日期等。
- 用户选择年月区间后，仅汇总落在 `[startMonth, endMonth]` 范围内的销额记录。

---

## 3. 核心指标定义

### 3.1 基础字段

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `totalPoints` | 客户资料 `总点数` | 门店总点数，默认 1 |
| `paidPoints` | 客户资料 `付费点数`；若为空则 `付费金额 > 0 ? 1 : 0` | 实际付费点数；「付费金额」判断基于费用资料（ATP费用） |
| `paidAmount` | 费用资料（`sheetType = 'ATP费用'`）`计划付费金额` ÷ 3 | ATP 投入金额，付费金额唯一来源为费用资料 |
| `totalStoreSales` | 费用资料「客户销额」合计 | 时间区间内该客户总销额 |
| `paidStoreSales` | 若 `paidAmount > 0` 则等于 `totalStoreSales`，否则为 0 | 付费门店的销额 |

### 3.2 派生指标

| 指标 | 公式 | 业务含义 |
| --- | --- | --- |
| `paidPointFeeRatio`（投入费比） | `(paidAmount × 选择月份数) / paidStoreSales` | 付费点位投入占其产生销额的比例 |
| `paidPointSalesRatio`（付费点销额占比） | `paidStoreSales / totalStoreSales` | 付费门店销额占总门店销额的转化比例 |
| `feeRatioLe10` / `feeRatio10to15` / `feeRatioGt15` | 单店 `storeFeeRatio = (paidAmount × 月份数) / storeSales`，按 ≤10%、10%~15%、>15% 计数 | 费比分档门店数 |
| `feeRatioNoDeal` | 有付费金额但 `storeSales ≤ 0` 的门店数 | 未成交付费点数 |
| `salesLt1000Count` / `salesLt2000Count` | 付费门店中销额 < 1000 / < 2000 的门店数 | 低销额付费点数 |
| 各 `*Ratio` 占比字段 | 对应计数 / `paidPoints` | 某档门店占付费点数的比例 |

> 注：单店计算只在 `paidAmount > 0` 时进行；未付费门店不参与分档计数。

### 3.3 汇总指标计算规则

- 计数类指标（`feeRatioLe10` 等）按层级求和；
- 占比类指标在汇总后重新计算：`计数合计 / paidPoints合计`；
- `paidPointFeeRatio`、`paidPointSalesRatio` 在汇总层重新按合计金额计算，避免简单平均。

---

## 4. 数据汇总层级

### 4.1 主表（业代维度）

主表按 `(所别, 阶层, 业代)` 聚合，展示：

- **明细行**：每个 `(所别, 阶层, 业代)` 组合；
- **所别合计**：每个所别内的所有明细聚合；
- **整体合计**：全部数据聚合。

默认视图仅展示 **所别合计** 与 **整体合计**。

### 4.2 门店明细表

按单门店展开，展示每个客户一行，并增加：

- **业代合计**：同一业代下所有门店聚合；
- **所别合计**：同一所别下所有门店聚合；
- **整体合计**：全部门店聚合。

门店明细中的 `paidPointSalesRatio` 口径与主表不同：

- 明细行：单店销额 / 该业代总销额；
- 业代合计：业代总销额 / 所别总销额；
- 所别合计：所别总销额 / 整体总销额；
- 整体合计：1（代表 100%）。

### 4.3 隐藏规则

- 一阶层级中 `paidPoints === 0` 的业代不展示；
- 前端筛选条件（所别、阶层、人员）进一步过滤展示结果。

---

## 5. 筛选与权限规则

### 5.1 筛选条件

页面筛选条位于 ATP 绩效卡片上方，条件包括：

| 条件 | 类型 | 联动说明 |
| --- | --- | --- |
| 年月区间 | 两个 `Select`（起止月） | 起止月相互约束，确保 `startMonth ≤ endMonth` |
| 所别 | 多选 | 选择后级联刷新可选「人员」与「客户形态」 |
| 阶层 | 多选 | 支持一阶、二阶等 |
| 人员 | 多选 | 随所选所别联动 |

### 5.2 月份选项

- 优先从后端接口 `/api/datasets/atp-months` 获取有数据的月份；
- 若接口失败或无数据，则回退到近 13 个月选项。

### 5.3 无数据状态

- 当 ATP 绩效接口返回空数据时，隐藏筛选条、表格标题、导出按钮；
- 仅展示空状态：图标 +「暂无数据集」+「请先在数据管理页上传并解析数据集」+ 跳转按钮。

---

## 6. 前端页面与交互设计

### 6.1 页面组件结构

```
client/src/pages/AtpExpensePage/
├── AtpExpensePage.tsx      # 页面容器：筛选条状态、月份、联动过滤
├── AtpPerformance.tsx      # ATP 绩效分析面板：表格、下钻、导出
```

### 6.2 卡片标题栏

- 标题：**ATP绩效**
- 展开/缩放按钮：
  - 默认文案「展开明细」；
  - 展开后文案「缩放合计」；
  - 采用胶囊圆角、hover 变绿色实心按钮。
- 导出按钮：**导出ATP绩效**，导出包含主表与门店明细两个工作表。

### 6.3 表格设计

- 表头固定，`overflow-x-auto` 横向滚动；
- 指标列右对齐，使用 `Roboto Mono` 等宽字体；
- 文本列左对齐；
- 汇总行背景加深；
- 表头支持换行显示（如「付费点销额占比」拆为两行）。

### 6.4 可点击表头

- **投入费比** 与 **付费点销额占比** 表头可点击；
- 点击后右侧展开近 6 个月历史列（如「6月」「7月」…「11月」）；
- 再次点击收起；
- 加载中显示 ⏳ 旋转图标；
- 当前展开列的表头显示旋转后的 ▶ 箭头。

### 6.5 表头折叠（所别 / 阶层）

- 点击「所别」表头：切换到仅展示合计行；
- 点击「阶层」表头：预留按阶层折叠的能力；
- 当前激活的折叠列高亮浅绿色背景。

### 6.6 预警色

数据行中的关键指标按与所属 **所别合计** 的比较进行预警：

| 指标 | 红色预警 | 黄色预警 |
| --- | --- | --- |
| 投入费比 | > 所别合计 × 1.2 | > 所别合计 |
| 付费点销额占比 | < 所别合计 × 0.8 | < 所别合计 |

下钻历史列中，Top3 值高亮：

- 投入费比 Top3 → 浅红；
- 付费点销额占比 Top3 → 浅绿。

---

## 7. 后端接口

### 7.1 接口清单

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/datasets/atp-months` | GET | 返回 ATP 绩效可用的月份列表 |
| `/api/datasets/atp-performance` | GET | 返回业代维度聚合数据 |
| `/api/datasets/atp-performance-store-detail` | GET | 返回单门店明细数据 |

### 7.2 请求参数

```ts
interface AtpPerformanceQuery {
  dateFrom: string;   // 开始日期，如 2025-06-01
  dateTo: string;     // 结束日期，如 2025-06-30
  granularity: 'day'; // 当前仅按天汇总，实际按月份范围聚合
}
```

筛选条件通过 `HeatmapFilterParams` 透传：

```ts
interface HeatmapFilterParams {
  region?: string[];    // 所别
  tier?: string[];      // 阶层
  salesRep?: string[];  // 人员
  // ... 其他字段在 ATP 中暂未使用
}
```

### 7.3 返回结构

```ts
interface AtpPerformanceResponse {
  rows: AtpPerformanceRow[];
}

interface AtpPerformanceRow {
  region: string;
  tier: string;
  salesRep: string;
  totalPoints: number;
  paidPoints: number;
  paidAmount: number;
  totalStoreSales: number;
  paidStoreSales: number;
  paidPointFeeRatio: number;
  paidPointSalesRatio: number;
  feeRatioLe10?: number;
  feeRatio10to15?: number;
  feeRatioGt15?: number;
  feeRatioNoDeal?: number;
  feeRatioLe10Ratio?: number;
  feeRatio10to15Ratio?: number;
  feeRatioGt15Ratio?: number;
  feeRatioNoDealRatio?: number;
  salesLt1000Count?: number;
  salesLt1000Ratio?: number;
  salesLt2000Count?: number;
  salesLt2000Ratio?: number;
}

interface AtpPerformanceStoreRow extends AtpPerformanceRow {
  customerName: string;
  customerCode: string;
}
```

---

## 8. 下钻分析逻辑

### 8.1 触发方式

用户点击 **投入费比** 或 **付费点销额占比** 表头，组件以当前 `dateTo` 所在月份为终点，向前取 6 个月，逐月请求 `/api/datasets/atp-performance`。

### 8.2 主表下钻计算

对每个下钻月份，按后端返回的明细行聚合：

- **业代级**：
  - 投入费比 = `paidAmount / paidStoreSales`；
  - 付费点销额占比 = `paidStoreSales / totalStoreSales`。
- **所别级**：分别对所别内所有业代求和后再计算比值。
- **整体级**：对所有数据求和后再计算比值。

### 8.3 门店明细下钻计算

对每个下钻月份请求 `/api/datasets/atp-performance-store-detail`：

- **门店级**：
  - 投入费比 = `paidAmount / paidStoreSales`；
  - 付费点销额占比 = `单店销额 / 业代总销额`。
- **业代级**：
  - 投入费比 = 业代合计 `paidAmount / paidStoreSales`；
  - 付费点销额占比 = 业代总销额 / 所别总销额。
- **所别级**：
  - 投入费比 = 所别合计 `paidAmount / paidStoreSales`；
  - 付费点销额占比 = 所别总销额 / 整体总销额。
- **整体级**：
  - 投入费比 = 整体合计 `paidAmount / paidStoreSales`；
  - 付费点销额占比 = 1。

### 8.4 Top3 高亮

对每一条下钻数据序列，Top3 值高亮显示，用于快速定位异常月份。

---

## 9. Excel 导出设计

### 9.1 工作表结构

导出的 Excel 包含两个工作表：

1. **ATP绩效**：当前主表可见行（含展开的下钻月度列）；
2. **付费门店明细**：单门店明细（含门店级下钻月度列）。

### 9.2 样式规范

- 表头：浅蓝灰背景（`hsl(217, 40%, 95%)`），居中，加粗；
- 下钻列：稍深背景（`hsl(217, 40%, 92%)`）；
- 数据行：斑马纹（白 / 浅灰）；
- 汇总行：
  - 整体合计：`hsl(217, 40%, 92%)`；
  - 所别合计：`hsl(220, 18%, 93%)`；
  - 业代合计：`hsl(220, 18%, 95%)`；
- 预警单元格沿用前端的红 / 黄填充色；
- 百分比列使用 `0.00%` 数字格式。

### 9.3 导出触发

点击标题栏「导出ATP绩效」按钮，异步请求门店明细，完成后浏览器下载 `ATP绩效_{dateFrom}_{dateTo}.xlsx`。

---

## 10. 异常与边界处理

| 场景 | 处理策略 |
| --- | --- |
| 无客户资料或无客户销额 | 主表返回空数组，前端展示空状态 |
| 客户编码无法归一化 | 跳过该客户 |
| `paidStoreSales` 为 0 | 相关费比指标记为 0，避免除零 |
| 选择月份区间跨年 | `countMonths` 正确计算月份数 |
| 下钻接口部分失败 | 当前实现会整体报错并 toast 提示 |
| 一阶无付费点业代 | 服务端与前端双重过滤，不展示 |

---

## 11. 相关文件清单

### 11.1 前端

- `client/src/pages/AtpExpensePage/AtpExpensePage.tsx` — 页面容器、筛选条、月份选择
- `client/src/pages/AtpExpensePage/AtpPerformance.tsx` — 绩效表格、下钻、导出
- `client/src/api/dataset.ts` — ATP 相关 API 调用
- `shared/api.interface.ts` — ATP 类型定义

### 11.2 后端

- `server/modules/dataset/dataset.controller.ts` — ATP 接口路由
- `server/modules/dataset/dataset.service.ts` — ATP 数据聚合与计算逻辑
- `server/modules/customer-profile/customer-profile.service.ts` — 客户资料查询
- `server/modules/expense-profile/expense-profile.service.ts` — 费用资料查询

---

## 12. 后续可扩展点

- 支持按「客户形态」「品牌」「规格」等更多维度过滤；
- 增加 ATP 投入金额环比/同比分析；
- 在门店明细中增加单店详情弹窗；
- 支持下钻列自定义月份数量（目前固定 6 个月）。
