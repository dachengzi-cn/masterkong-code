import { desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { dataset } from '@server/database/schema';
import { DatasetService } from '../dataset/dataset.service';
import type { ExpenseRecord } from '@shared/api.interface';
import type { CapabilityDimensionDefinition } from './capability.registry';

/**
 * 业务综合能力评估 —— 分析器
 * 职责：数据清洗、原始指标聚合、Winsorize 截断、百分位标准化、加权汇总。
 * 月份/编码解析与 dataset.service 保持同一口径（此处为复用而复制）。
 */

// ==================== 工具函数（与 dataset.service 口径一致） ====================

/** 客户编码归一化：1201/ 前缀保留、KH 前缀保留、纯前导零数字补全为 1201/{数字} */
export function normalizeAtpCustomerCode(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return '';
  if (/^1201\//i.test(trimmed)) return trimmed;
  if (/^KH\d+/i.test(trimmed)) return trimmed;
  const m = trimmed.match(/^0+(\d+)$/);
  if (m) return `1201/${m[1]}`;
  return trimmed;
}

/** 严格解析月份：支持 "2026-07"、"2026/07"、"2026年7月"、"7月 2026"、完整日期等 */
export function parseAtpMonthStrict(value: string): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})月\s*(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  return null;
}

/** 在 YYYY-MM 基础上增加 offset 个月 */
export function addMonthsToYm(ym: string, offset: number): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const idx = y * 12 + (m - 1) + offset;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** 数值解析：支持数字/字符串/百分比，非法返回 0 */
export function parseNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const s = String(value).replace(/,/g, '').trim();
  if (!s) return 0;
  let n = parseFloat(s.replace(/[%¥￥,\s]/g, ''));
  if (Number.isNaN(n)) return 0;
  if (s.endsWith('%')) n = n / 100;
  return n;
}

/** 判断记录是否为临期记录：sheetType 含「临期」或字段名含「临期/到期」 */
export function isExpiryRecord(e: ExpenseRecord): boolean {
  if (String(e.sheetType ?? '').includes('临期')) return true;
  return Object.keys(e.extras ?? {}).some((k) => /临期|到期/i.test(String(k)));
}

/** 提取记录中的金额：优先取字段名含「金额」的数值 */
export function parseExpiryAmount(e: ExpenseRecord): number {
  for (const [key, value] of Object.entries(e.extras ?? {})) {
    if (/金额|amount|费用/i.test(String(key))) {
      const n = parseNumeric(value);
      if (n > 0) return n;
    }
  }
  return 0;
}

/** 从记录 extras 中提取月份（扫描全部键，口径与 expense-profile 一致） */
export function extractMonthFromRecord(record: { extras?: Record<string, unknown> }): string | null {
  for (const [key, value] of Object.entries(record.extras ?? {})) {
    const raw = String(value ?? '');
    if (!raw) continue;
    const strict = parseAtpMonthStrict(raw);
    if (strict) return strict;
    if (/(日期|时间|月|期间|年月|yearmonth|month|period)/i.test(String(key))) {
      const relaxed = raw.match(/^(\d{4})[./-](\d{1,2})$/);
      if (relaxed) return `${relaxed[1]}-${relaxed[2].padStart(2, '0')}`;
    }
  }
  return null;
}

// ==================== 成交记录加载 ====================

export interface DealRecord {
  customerCode: string;
  salesRep: string | null;
  month: string | null;
  specification: string | null;
  brand: string | null;
}

export interface ProfileLike {
  customerCode: string;
  customerName: string;
  region: string;
  tier: string;
  extras: Record<string, unknown>;
}

/** 字段探测（复制自 dataset.service，供成交记录解析使用） */
function findCustomerCodeField(fields: Array<{ name: string; type?: string }>): string | undefined {
  const exact = [
    '客户编码', '客户代码', '客户编号', '客户-通路客户编码',
    '门店编码', '门店代码', '门店编号', '门店号',
    'customer_code', 'customerCode', 'store_code', 'storeCode', 'outlet_code', 'outletCode',
  ];
  for (const c of exact) {
    const found = fields.find((f) => f.name.trim() === c);
    if (found) return found.name;
  }
  const lower = fields.find((f) => {
    const l = f.name.toLowerCase();
    return (l.includes('customer') || l.includes('store')) && l.includes('code');
  });
  if (lower) return lower.name;
  return fields.find((f) => (f.name.includes('客户') || f.name.includes('门店')) && f.name.includes('编码'))?.name;
}

function findDateField(fields: Array<{ name: string; type?: string }>): string | undefined {
  const dateField = fields.find((f) => f.type === 'date');
  if (dateField) return dateField.name;
  const candidates = ['订单-订单日期', '时间-日期', '订单日期', '日期', '交易日期', '月份', '月份别', '月', '期间', 'period', '年月'];
  for (const c of candidates) {
    const found = fields.find((f) => f.name.trim() === c);
    if (found) return found.name;
  }
  return fields.find((f) => /日期|date|时间|月份|年月|period|期间/i.test(f.name))?.name;
}

/**
 * 加载区间内的成交记录（data_record）。
 * - 内存模式：取最新内存数据集记录（演示环境单数据集，可接受）。
 * - 数据库模式：识别包含规格/业代字段的数据集，按检测出的日期字段做 SQL 过滤。
 */
export async function loadDealRecords(
  db: PostgresJsDatabase,
  monthFrom: string,
  monthTo: string,
): Promise<DealRecord[]> {
  const out: DealRecord[] = [];
  try {
    if (DatasetService.isMemoryMode()) {
      const memDs = DatasetService.getLatestMemoryDataset();
      if (memDs) {
        for (const record of memDs.records) {
          const d = scanDealRecord(record);
          if (d && d.month && d.month >= monthFrom && d.month <= monthTo) out.push(d);
        }
      }
      return out;
    }

    const datasets = await db
      .select({ id: dataset.id, fields: dataset.fields })
      .from(dataset)
      .orderBy(desc(dataset.createdAt));
    for (const ds of datasets) {
      const fields = (ds.fields ?? []) as Array<{ name: string; type?: string }>;
      const hasDeal = fields.some((f) => /规格|品项|spec/i.test(f.name))
        || fields.some((f) => /业代|客户经理|业务员|rep/i.test(f.name));
      if (!hasDeal) continue;
      const codeField = findCustomerCodeField(fields);
      const dateField = findDateField(fields);
      if (!codeField || !dateField) continue;
      const safeCode = codeField.replace(/'/g, "''");
      const safeDate = dateField.replace(/'/g, "''");
      const safeDatasetId = ds.id.replace(/'/g, "''");
      const rows = await db.execute(sql.raw(
        `SELECT content->>'${safeCode}' AS customer_code,` +
        ` content->>'${safeDate}' AS trans_date,` +
        ` content->>'人员-业代' AS sales_rep,` +
        ` content->>'品牌' AS brand,` +
        ` content->>'产品-规格' AS specification` +
        ` FROM data_record` +
        ` WHERE dataset_id = '${safeDatasetId}'` +
        ` AND content_hash IS NOT NULL` +
        ` AND content->>'${safeDate}' IS NOT NULL AND content->>'${safeDate}' != ''`,
      ));
      for (const row of rows as unknown as Array<{
        customer_code: string | null;
        trans_date: string | null;
        sales_rep: string | null;
        brand: string | null;
        specification: string | null;
      }>) {
        const month = row.trans_date ? parseAtpMonthStrict(row.trans_date) : null;
        if (!month || month < monthFrom || month > monthTo) continue;
        const customerCode = String(row.customer_code ?? '').trim();
        if (!customerCode) continue;
        out.push({
          customerCode,
          salesRep: String(row.sales_rep ?? '').trim() || null,
          month,
          specification: String(row.specification ?? '').trim() || null,
          brand: String(row.brand ?? '').trim() || null,
        });
      }
    }
  } catch (err) {
    // 数据库不可用时回退为空，避免阻断主评估流程
  }
  return out;
}

/** 扫描内存记录提取成交信息（键名启发式，与 dataset.service 内存路径一致） */
function scanDealRecord(record: Record<string, unknown>): DealRecord | null {
  if (!record || typeof record !== 'object') return null;
  let customerCode = '';
  let dateVal = '';
  let salesRep = '';
  let brand = '';
  let spec = '';
  for (const [k, v] of Object.entries(record)) {
    const sv = String(v ?? '').trim();
    if (!customerCode && /客户.*编码|customer.*code|门店.*编码|store.*code|^编码$/i.test(k)) customerCode = sv;
    if (!dateVal && /日期|date|时间|月份/i.test(k) && /^\d{4}/.test(sv)) dateVal = sv;
    if (!salesRep && /业代|客户经理|业务员|^rep$/i.test(k)) salesRep = sv;
    if (!brand && /品牌/i.test(k) && sv) brand = sv;
    if (!spec && /规格|品项|spec/i.test(k) && sv) spec = sv;
  }
  if (!customerCode || !dateVal) return null;
  return {
    customerCode,
    salesRep: salesRep || null,
    month: parseAtpMonthStrict(dateVal),
    specification: spec || null,
    brand: brand || null,
  };
}

// ==================== 原始指标聚合 ====================

export interface CapabilityRawInput {
  profiles: ProfileLike[];
  expenses: ExpenseRecord[];
  dealRecords: DealRecord[];
  monthFrom: string;
  monthTo: string;
}

export interface CapabilityObjectRaw {
  key: string;
  region: string;
  salesRep: string | null;
  metrics: Record<string, number | null>;
}

interface ObjectAccumulator {
  customerCount: number;
  totalPoints: number;
  paidPoints: number;
  paidCustomerCount: number;
  goodStatusCount: number;
  salesTotal: number;
  paidCustomerSales: number;
  feeLe10Count: number;
  feeEvaluatedCount: number;
  expiryTotal: number;
  dealCustomerCount: number;
  specSet: Set<string>;
}

/**
 * 按评估对象（所别 / 业代）汇总 8 个维度的原始指标。
 * 返回的对象包含该比较组内的全部对象，供百分位标准化使用。
 */
export function buildObjectRawMetrics(
  input: CapabilityRawInput,
  level: 'region' | 'rep',
  includeOverall = false,
): CapabilityObjectRaw[] {
  const { profiles, expenses, dealRecords, monthFrom, monthTo } = input;

  // 1) 客户编码 → 客户资料
  const profileByCode = new Map<string, ProfileLike>();
  for (const p of profiles) {
    const code = normalizeAtpCustomerCode(String(p.customerCode ?? '').trim());
    if (!code) continue;
    if (!profileByCode.has(code)) profileByCode.set(code, p);
  }

  // 2) 客户销额：编码 → 销额合计
  const salesByCode = new Map<string, number>();
  for (const e of expenses) {
    if (String(e.sheetType ?? '').trim() !== '客户销额') continue;
    const ym = parseAtpMonthStrict(String(e.extras['时间-年/月'] ?? ''));
    if (ym && (ym < monthFrom || ym > monthTo)) continue;
    const code = normalizeAtpCustomerCode(String(e.customerCode ?? '').trim());
    if (!code) continue;
    const amount = parseNumeric(e.extras['回单金额'] ?? e.extras['客户销额'] ?? e.extras['门店销额'] ?? e.extras['销额'] ?? 0);
    if (amount > 0) salesByCode.set(code, (salesByCode.get(code) ?? 0) + amount);
  }

  // 3) ATP 付费：记录金额 ÷ 3 分摊到执行开始日期起 3 个月
  const atpPaidByCode = new Map<string, number>();
  for (const e of expenses) {
    if (String(e.sheetType ?? '').trim() !== 'ATP费用') continue;
    const recordYm = parseAtpMonthStrict(String(e.extras['执行开始日期'] ?? ''));
    if (!recordYm) continue;
    const code = normalizeAtpCustomerCode(String(e.customerCode ?? '').trim());
    if (!code) continue;
    const totalAmount = parseNumeric(e.extras['计划付费金额'] ?? 0);
    if (totalAmount <= 0) continue;
    const monthlyFee = totalAmount / 3;
    for (let off = 0; off < 3; off++) {
      const coveredYm = addMonthsToYm(recordYm, off);
      if (coveredYm < monthFrom || coveredYm > monthTo) continue;
      atpPaidByCode.set(code, (atpPaidByCode.get(code) ?? 0) + monthlyFee);
    }
  }

  // 4) 临期金额：编码 → 临期金额合计
  const expiryByCode = new Map<string, number>();
  for (const e of expenses) {
    if (!isExpiryRecord(e)) continue;
    const ym = extractMonthFromRecord(e);
    if (ym && (ym < monthFrom || ym > monthTo)) continue;
    const code = normalizeAtpCustomerCode(String(e.customerCode ?? '').trim());
    if (!code) continue;
    const amount = parseExpiryAmount(e);
    if (amount > 0) expiryByCode.set(code, (expiryByCode.get(code) ?? 0) + amount);
  }

  // 5) 成交记录：全局规格集、每客户成交、每客户成交规格
  const globalSpecSet = new Set<string>();
  const dealCodeSet = new Set<string>();
  const specByCode = new Map<string, Set<string>>();
  for (const d of dealRecords) {
    if (!d.month || d.month < monthFrom || d.month > monthTo) continue;
    const code = normalizeAtpCustomerCode(d.customerCode);
    if (!code) continue;
    if (d.specification) {
      const spec = d.specification.trim();
      globalSpecSet.add(spec);
      let set = specByCode.get(code);
      if (!set) {
        set = new Set<string>();
        specByCode.set(code, set);
      }
      set.add(spec);
    }
    dealCodeSet.add(code);
  }

  // 6) 按对象聚合
  const objects = new Map<string, { region: string; salesRep: string | null; acc: ObjectAccumulator }>();
  const ensureObject = (region: string, salesRep: string | null) => {
    const key = level === 'region' ? region : `${region}|||${salesRep ?? ''}`;
    let o = objects.get(key);
    if (!o) {
      o = {
        region,
        salesRep,
        acc: createEmptyAccumulator(),
      };
      objects.set(key, o);
    }
    return o;
  };

  // 单客户指标累加（分组对象与全公司对象共用）
  const addToAcc = (acc: ObjectAccumulator, p: ProfileLike, code: string) => {
    const totalPoints = parseNumeric(p.extras['总点数'] ?? 1);
    const paidAmount = atpPaidByCode.get(code) ?? 0;
    const paidPoints = parseNumeric(p.extras['付费点数'] ?? (paidAmount > 0 ? 1 : 0));
    const sales = salesByCode.get(code) ?? 0;

    acc.customerCount += 1;
    acc.totalPoints += totalPoints;
    acc.paidPoints += paidPoints;
    if (paidPoints > 0) acc.paidCustomerCount += 1;

    const status = String(p.extras['合作状态'] ?? '').trim();
    if (status && !/停|终止|未合作|失效|关闭|淘汰|退出/i.test(status)) acc.goodStatusCount += 1;

    acc.salesTotal += sales;
    if (paidPoints > 0 || paidAmount > 0) acc.paidCustomerSales += sales;

    // 费比健康度：付费且有销额的客户，费比 ≤ 10% 记为健康
    if (paidAmount > 0 && sales > 0) {
      acc.feeEvaluatedCount += 1;
      if (paidAmount / sales <= 0.1) acc.feeLe10Count += 1;
    }

    acc.expiryTotal += expiryByCode.get(code) ?? 0;
    if (dealCodeSet.has(code)) acc.dealCustomerCount += 1;
    const specs = specByCode.get(code);
    if (specs) {
      for (const s of specs) acc.specSet.add(s);
    }
  };

  // 全公司聚合（level=region 且 includeOverall 时）：key 固定为 __all__
  const overallAcc = includeOverall && level === 'region' ? createEmptyAccumulator() : null;

  for (const p of profiles) {
    const region = String(p.region ?? '').trim();
    if (!region) continue;
    const rep = level === 'rep' ? String(p.extras['客户经理'] ?? p.extras['业代'] ?? '').trim() : null;
    if (level === 'rep' && !rep) continue;
    const o = ensureObject(region, rep);
    const code = normalizeAtpCustomerCode(String(p.customerCode ?? '').trim());
    addToAcc(o.acc, p, code);
    if (overallAcc) addToAcc(overallAcc, p, code);
  }

  // 7) 生成原始指标
  const result: CapabilityObjectRaw[] = [];
  for (const { region, salesRep, acc } of objects.values()) {
    result.push(buildObjectMetrics(level, region, salesRep, acc, globalSpecSet.size));
  }
  if (overallAcc) {
    result.push(buildObjectMetrics(level, '__all__', null, overallAcc, globalSpecSet.size));
  }
  return result;
}

/** 空累加器 */
function createEmptyAccumulator(): ObjectAccumulator {
  return {
    customerCount: 0,
    totalPoints: 0,
    paidPoints: 0,
    paidCustomerCount: 0,
    goodStatusCount: 0,
    salesTotal: 0,
    paidCustomerSales: 0,
    feeLe10Count: 0,
    feeEvaluatedCount: 0,
    expiryTotal: 0,
    dealCustomerCount: 0,
    specSet: new Set<string>(),
  };
}

/** 由累加器生成单对象原始指标 */
function buildObjectMetrics(
  level: 'region' | 'rep',
  region: string,
  salesRep: string | null,
  acc: ObjectAccumulator,
  globalSpecCount: number,
): CapabilityObjectRaw {
  const key = level === 'region' ? region : `${region}|||${salesRep ?? ''}`;
  const paidCustomerSalesRatio = acc.salesTotal > 0 ? acc.paidCustomerSales / acc.salesTotal : 0;
  const feeHealth = acc.feeEvaluatedCount > 0 ? acc.feeLe10Count / acc.feeEvaluatedCount : 0;
  const paidCustomerRatio = acc.customerCount > 0 ? acc.paidCustomerCount / acc.customerCount : 0;
  const goodStatusRatio = acc.customerCount > 0 ? acc.goodStatusCount / acc.customerCount : 0;

  return {
    key,
    region,
    salesRep,
    metrics: {
      sales_achievement: acc.salesTotal > 0 ? acc.salesTotal : null,
      item_distribution: globalSpecCount > 0 ? acc.specSet.size / globalSpecCount : null,
      atp_performance: acc.paidCustomerCount > 0 || acc.paidCustomerSales > 0
        ? Math.min(1, paidCustomerSalesRatio * 0.6 + feeHealth * 0.4)
        : 0,
      expiry_control: acc.salesTotal > 0 ? acc.expiryTotal / acc.salesTotal : null,
      service_coverage: acc.totalPoints > 0 ? acc.paidPoints / acc.totalPoints : null,
      deal_conversion: acc.customerCount > 0 ? acc.dealCustomerCount / acc.customerCount : null,
      store_productivity: acc.totalPoints > 0 ? acc.salesTotal / acc.totalPoints : null,
      customer_structure: acc.customerCount > 0 ? paidCustomerRatio * 0.5 + goodStatusRatio * 0.5 : null,
    },
  };
}

// ==================== 标准化与加权 ====================

/** 计算分位数（线性插值） */
function percentileValue(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * 单维标准化：对比较组内值 Winsorize 截断（5%~95% 分位）后取百分位排名 → 0~100。
 * 反向维度取 100 - 正向百分位；组内值全部相等时取 50（中性）。
 */
export function standardizeScore(
  groupValues: number[],
  target: number,
  direction: 'up' | 'down',
): number | null {
  if (!Number.isFinite(target) || groupValues.length === 0) return null;
  const sorted = [...groupValues].sort((a, b) => a - b);
  const low = percentileValue(sorted, 0.05);
  const high = percentileValue(sorted, 0.95);
  if (high === low) return 50;
  const clamped = Math.min(Math.max(target, low), high);
  let count = 0;
  for (const v of groupValues) {
    const c = Math.min(Math.max(v, low), high);
    if (c <= clamped) count += 1;
  }
  const rank = count / groupValues.length;
  const score = direction === 'up' ? rank * 100 : (1 - rank) * 100;
  return Math.round(score * 10) / 10;
}

export interface CapabilityAnalyzedObject {
  key: string;
  region: string;
  salesRep: string | null;
  scores: Record<string, number | null>;
  rawValues: Record<string, number | null>;
}

/** 对整个比较组做多维度标准化 */
export function analyzeObjectGroup(
  objects: CapabilityObjectRaw[],
  dims: CapabilityDimensionDefinition[],
): CapabilityAnalyzedObject[] {
  return objects.map((o) => {
    const scores: Record<string, number | null> = {};
    for (const dim of dims) {
      const groupValues = objects
        .map((x) => x.metrics[dim.key])
        .filter((v): v is number => v != null && Number.isFinite(v));
      scores[dim.key] = standardizeScore(groupValues, o.metrics[dim.key], dim.direction);
    }
    return {
      key: o.key,
      region: o.region,
      salesRep: o.salesRep,
      scores,
      rawValues: { ...o.metrics },
    };
  });
}

/** 加权总分（忽略缺失维度，除以启用维度权重和），返回 null 表示无任何可用维度 */
export function computeWeightedTotal(
  scores: Record<string, number | null>,
  dims: CapabilityDimensionDefinition[],
  weightOverrides?: Record<string, number>,
): number | null {
  let sum = 0;
  let wsum = 0;
  for (const dim of dims) {
    const s = scores[dim.key];
    if (s == null) continue;
    const w = weightOverrides?.[dim.key] ?? dim.defaultWeight;
    sum += s * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return Math.round((sum / wsum) * 10) / 10;
}
