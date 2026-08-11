import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import * as XLSX from 'xlsx-js-style';
import { capabilityDimensionConfig } from '@server/database/schema';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { ExpenseProfileService } from '../expense-profile/expense-profile.service';
import type {
  CapabilityDimensionMeta,
  CapabilityDimensionScore,
  CapabilityDimensionUpdateRequest,
  CapabilityDimensionUpdateResponse,
  CapabilityExportParams,
  CapabilityInsightsParams,
  CapabilityInsightsResult,
  CapabilityOptions,
  CapabilityScoreLevel,
  CapabilityScoreParams,
  CapabilityScoreResult,
} from '@shared/api.interface';
import {
  CAPABILITY_DIMENSIONS,
  buildDefaultDimensionMetas,
  classifyScore,
  getTotalLevel,
} from './capability.registry';
import {
  addMonthsToYm,
  analyzeObjectGroup,
  buildObjectRawMetrics,
  computeWeightedTotal,
  loadDealRecords,
  parseAtpMonthStrict,
  parseNumeric,
  type CapabilityObjectRaw,
  type ProfileLike,
} from './capability-analyzer';
import { buildInsights } from './capability-insights';
import { getScopeContext, isRegionAllowed, type ScopeContext } from './capability-scope';

interface BaseScoreResult {
  scores: CapabilityDimensionScore[];
  totalScore: number;
  rawValues: Record<string, number | null>;
}

@Injectable()
export class CapabilityService {
  private readonly logger = new Logger(CapabilityService.name);
  private static readonly CACHE_TTL_MS = 10_000;

  // 10s TTL 响应缓存（参照 customer-profile 缓存范式，保证 ≤2s 渲染）
  private optionsCache: { key: string; data: CapabilityOptions; expires: number } | null = null;
  private dimsCache: { key: string; data: CapabilityDimensionMeta[]; expires: number } | null = null;
  private scoreCache: { key: string; data: CapabilityScoreResult; expires: number } | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly customerProfileService: CustomerProfileService,
    private readonly expenseProfileService: ExpenseProfileService,
  ) {}

  // ==================== options ====================

  async getOptions(userId: string): Promise<CapabilityOptions> {
    const cacheKey = `options:${userId}`;
    if (this.optionsCache && this.optionsCache.key === cacheKey && this.optionsCache.expires > Date.now()) {
      return this.optionsCache.data;
    }
    const [profiles, expenses] = await Promise.all([
      this.customerProfileService.findAllUnpaginated(),
      this.expenseProfileService.findAllUnpaginated(),
    ]);
    const scope = await getScopeContext(this.db, userId);

    const regionSet = new Set<string>();
    const salesReps: Record<string, Set<string>> = {};
    for (const p of profiles) {
      const region = String(p.region ?? '').trim();
      if (!region || !isRegionAllowed(scope, region)) continue;
      regionSet.add(region);
      const rep = String(p.extras['客户经理'] ?? p.extras['业代'] ?? '').trim();
      if (rep) {
        if (!salesReps[region]) salesReps[region] = new Set<string>();
        salesReps[region].add(rep);
      }
    }
    const months = this.collectSalesMonths(expenses);
    const data: CapabilityOptions = {
      regions: Array.from(regionSet).sort(),
      salesReps: Object.fromEntries(
        Object.entries(salesReps).map(([r, s]) => [r, Array.from(s).sort()]),
      ),
      months,
    };
    this.optionsCache = { key: cacheKey, data, expires: Date.now() + CapabilityService.CACHE_TTL_MS };
    return data;
  }

  // ==================== dimensions ====================

  async getDimensionMetas(userId: string): Promise<CapabilityDimensionMeta[]> {
    const cacheKey = `dims:${userId}`;
    if (this.dimsCache && this.dimsCache.key === cacheKey && this.dimsCache.expires > Date.now()) {
      return this.dimsCache.data;
    }
    const data = await this.resolveDimensionMetas();
    this.dimsCache = { key: cacheKey, data, expires: Date.now() + CapabilityService.CACHE_TTL_MS };
    return data;
  }

  async updateDimensions(
    userId: string,
    body: CapabilityDimensionUpdateRequest,
  ): Promise<CapabilityDimensionUpdateResponse> {
    if (!body?.dimensions?.length) {
      throw new BadRequestException('维度配置不能为空');
    }
    // TODO(RBAC)：后续接入角色体系后，此处应校验 userId 是否具备维度配置管理权限
    const registryKeys = new Set<string>(CAPABILITY_DIMENSIONS.map((d) => d.key));
    for (const item of body.dimensions) {
      if (!registryKeys.has(item.key)) {
        throw new BadRequestException(`未知维度: ${item.key}`);
      }
      if (item.weight != null && (item.weight < 0 || item.weight > 1)) {
        throw new BadRequestException(`权重必须在 0~1 之间: ${item.key}`);
      }
      if (item.thresholdHigh != null && item.thresholdLow != null && item.thresholdHigh <= item.thresholdLow) {
        throw new BadRequestException(`优势阈值必须大于短板阈值: ${item.key}`);
      }
    }
    try {
      const now = new Date();
      for (const item of body.dimensions) {
        const target = CAPABILITY_DIMENSIONS.find((d) => d.key === item.key)!;
        await this.db
          .insert(capabilityDimensionConfig)
          .values({
            dimensionKey: item.key,
            name: target.name,
            weight: String(item.weight ?? target.defaultWeight),
            enabled: item.enabled ?? true,
            thresholdHigh: item.thresholdHigh ?? target.thresholdHigh,
            thresholdLow: item.thresholdLow ?? target.thresholdLow,
            sortOrder: target.sortOrder,
            createdBy: userId,
            updatedBy: userId,
          })
          .onConflictDoUpdate({
            target: capabilityDimensionConfig.dimensionKey,
            set: {
              weight: String(item.weight ?? target.defaultWeight),
              enabled: item.enabled ?? true,
              thresholdHigh: item.thresholdHigh ?? target.thresholdHigh,
              thresholdLow: item.thresholdLow ?? target.thresholdLow,
              updatedBy: userId,
              updatedAt: now,
            },
          });
      }
    } catch (err) {
      this.logger.warn(`updateDimensions 失败: ${(err as Error).message}`);
      throw new BadRequestException('维度配置保存失败（请确认数据库迁移已执行）');
    }
    this.dimsCache = null;
    const dimensions = await this.resolveDimensionMetas();
    return { success: true, dimensions };
  }

  // ==================== score ====================

  async getScore(params: CapabilityScoreParams, userId: string): Promise<CapabilityScoreResult> {
    const cacheKey = `score:${userId}:${JSON.stringify(params)}`;
    if (this.scoreCache && this.scoreCache.key === cacheKey && this.scoreCache.expires > Date.now()) {
      return this.scoreCache.data;
    }
    const data = await this.computeScoreInternal(params, userId);
    this.scoreCache = { key: cacheKey, data, expires: Date.now() + CapabilityService.CACHE_TTL_MS };
    return data;
  }

  private async computeScoreInternal(
    params: CapabilityScoreParams,
    userId: string,
  ): Promise<CapabilityScoreResult> {
    const level = params.level ?? 'region';
    const region = String(params.region ?? '').trim();
    const salesRep = String(params.salesRep ?? '').trim() || undefined;
    const compareType = params.compareType ?? 'none';
    if (level === 'rep' && !region) {
      throw new BadRequestException('业代评估需选择所别');
    }

    const scope = await getScopeContext(this.db, userId);
    const [profiles, expenses] = await Promise.all([
      this.customerProfileService.findAllUnpaginated(),
      this.expenseProfileService.findAllUnpaginated(),
    ]);

    const { monthFrom, monthTo } = this.resolveMonthRange(params, expenses);
    const metas = await this.resolveDimensionMetas();
    const weightOverrides = this.buildWeightOverrides(metas);

    const base = await this.computeBaseScores({
      profiles,
      expenses,
      level,
      region,
      salesRep,
      scope,
      monthFrom,
      monthTo,
      metas,
      weightOverrides,
    });

    let compare: CapabilityScoreResult['compare'] = null;
    if (compareType === 'mom' || compareType === 'yoy') {
      const offset = compareType === 'mom' ? -1 : -12;
      const cFrom = addMonthsToYm(monthFrom, offset);
      const cTo = addMonthsToYm(monthTo, offset);
      try {
        const compareBase = await this.computeBaseScores({
          profiles,
          expenses,
          level,
          region,
          salesRep,
          scope,
          monthFrom: cFrom,
          monthTo: cTo,
          metas,
          weightOverrides,
        });
        compare = {
          type: compareType,
          label: `${cFrom} ~ ${cTo}`,
          totalScore: compareBase.totalScore,
          scores: compareBase.scores.map((s) => ({
            key: s.key,
            score: s.score,
            rawValue: s.rawValue,
          })),
        };
      } catch (err) {
        // 对比期无数据时降级为 null
        this.logger.warn(`对比期(${cFrom}~${cTo})计算失败: ${(err as Error).message}`);
        compare = { type: compareType, label: `${cFrom} ~ ${cTo}`, totalScore: null, scores: [] };
      }
    }

    return {
      level,
      region,
      salesRep,
      monthFrom,
      monthTo,
      compareType,
      scores: base.scores,
      totalScore: base.totalScore,
      totalLevel: getTotalLevel(base.totalScore),
      rawValues: base.rawValues,
      compare,
    };
  }

  private async computeBaseScores(args: {
    profiles: ProfileLike[];
    expenses: import('@shared/api.interface').ExpenseRecord[];
    level: 'region' | 'rep';
    region: string;
    salesRep?: string;
    scope: ScopeContext;
    monthFrom: string;
    monthTo: string;
    metas: CapabilityDimensionMeta[];
    weightOverrides: Record<string, number>;
  }): Promise<BaseScoreResult> {
    const { profiles, expenses, level, region, salesRep, scope, monthFrom, monthTo, metas, weightOverrides } = args;

    // 全公司模式：level=region 且未指定所别，聚合全部授权所别为一个整体对象
    const isOverall = level === 'region' && !region;
    // 数据范围过滤：仅保留授权所别（RBAC 预留，无配置时全量）
    const scopedProfiles = profiles.filter((p) =>
      isRegionAllowed(scope, String(p.region ?? '').trim()),
    );

    const dealRecords = await loadDealRecords(this.db, monthFrom, monthTo);
    const rawInput = { profiles: scopedProfiles, expenses, dealRecords, monthFrom, monthTo };
    let objects: CapabilityObjectRaw[] = buildObjectRawMetrics(rawInput, level, isOverall);
    objects = objects.filter((o) => o.region === '__all__' || isRegionAllowed(scope, o.region));
    if (level === 'rep') {
      objects = objects.filter((o) => o.region === region);
    }

    const analyzed = analyzeObjectGroup(objects, CAPABILITY_DIMENSIONS);
    const targetKey = isOverall ? '__all__' : level === 'region' ? region : `${region}|||${salesRep ?? ''}`;
    const target = analyzed.find((a) => a.key === targetKey);
    if (!target) {
      const label = isOverall ? '全部所别' : level === 'region' ? `所别「${region}」` : `业代「${salesRep}」`;
      throw new NotFoundException(`${label}在所选月份内无评估数据`);
    }

    const scores: CapabilityDimensionScore[] = metas
      .filter((m) => m.enabled)
      .map((m) => {
        const score = target.scores[m.key];
        const raw = target.rawValues[m.key];
        const levelCode: CapabilityScoreLevel =
          score == null ? 'weak' : classifyScore(score, m.thresholdHigh, m.thresholdLow);
        return {
          key: m.key,
          name: m.name,
          score: score ?? 0,
          level: levelCode,
          rawValue: raw,
          rawLabel: formatRawLabel(raw, m),
          weight: m.weight,
        };
      })
      .sort((a, b) => this.sortIndex(a.key) - this.sortIndex(b.key));

    const totalScore = computeWeightedTotal(target.scores, CAPABILITY_DIMENSIONS, weightOverrides) ?? 0;
    return { scores, totalScore, rawValues: target.rawValues };
  }

  // ==================== insights ====================

  async getInsights(params: CapabilityInsightsParams, userId: string): Promise<CapabilityInsightsResult> {
    const result = await this.getScore(params, userId);
    const metas = await this.resolveDimensionMetas();
    const objectName = result.level === 'region' ? result.region : `${result.salesRep ?? ''}（${result.region}）`;
    return buildInsights({
      objectName,
      scores: result.scores,
      dims: metas,
      totalScore: result.totalScore,
      totalLevel: result.totalLevel,
      compare: result.compare
        ? { type: result.compare.type, label: result.compare.label, totalScore: result.compare.totalScore }
        : null,
    });
  }

  // ==================== export ====================

  async exportReport(
    params: CapabilityExportParams,
    userId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const result = await this.computeScoreInternal(params, userId);
    const insights = await this.getInsights(params, userId);
    const metas = await this.resolveDimensionMetas();

    const wb = XLSX.utils.book_new();
    const headerStyle = {
      font: { bold: true, sz: 11 },
      fill: { fgColor: { rgb: 'DCE7F8' }, patternType: 'solid' as const },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    };
    const headerRow = (cells: string[]) => cells.map((v) => ({ v, s: headerStyle }));

    // Sheet1: 维度得分
    const hasCompare = result.compare && result.compare.scores.length > 0;
    const scoreHeaders = ['维度', '得分', '等级', '原始值', '权重', '环比差', '同比差'];
    const scoreRows: Array<Array<string | number | Record<string, unknown>>> = [headerRow(scoreHeaders)];
    for (const s of result.scores) {
      const momDiff = s.compare?.mom ?? null;
      const yoyDiff = s.compare?.yoy ?? null;
      scoreRows.push([
        s.name,
        s.score,
        levelLabel(s.level),
        s.rawLabel ?? '—',
        s.weight,
        momDiff == null ? '—' : (momDiff >= 0 ? '+' : '') + momDiff,
        yoyDiff == null ? '—' : (yoyDiff >= 0 ? '+' : '') + yoyDiff,
      ]);
    }
    scoreRows.push(headerRow(['综合战力', String(result.totalScore), result.totalLevel.label, '', '', '', '']));
    if (hasCompare) {
      scoreRows.push(headerRow(['对比期', '', `总分 ${result.compare?.totalScore ?? '—'}`, '', '', '', '']));
    }
    const ws1 = XLSX.utils.aoa_to_sheet(scoreRows as unknown[][]);
    ws1['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, '维度得分');

    // Sheet2: 原始指标
    const rawHeaders = ['维度', '原始值', '单位', '方向', '说明'];
    const rawRows: Array<Array<string | number | Record<string, unknown>>> = [headerRow(rawHeaders)];
    for (const m of metas.filter((x) => x.enabled)) {
      const s = result.scores.find((x) => x.key === m.key);
      rawRows.push([
        m.name,
        s?.rawValue ?? '—',
        m.unit ?? '—',
        m.direction === 'up' ? '正向（越高越好）' : '反向（越低越好）',
        m.description,
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(rawRows as unknown[][]);
    ws2['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws2, '原始指标');

    // Sheet3: 评估结论
    const objName = result.level === 'region' ? result.region : `${result.salesRep ?? ''}（${result.region}）`;
    const conHeaders = ['项目', '内容'];
    const conRows: Array<Array<string | number | Record<string, unknown>>> = [headerRow(conHeaders)];
    conRows.push(['评估对象', objName]);
    conRows.push(['评估区间', `${result.monthFrom} ~ ${result.monthTo}`]);
    conRows.push(['综合战力', `${result.totalScore} 分（${result.totalLevel.label}）`]);
    if (result.compare && result.compare.totalScore != null) {
      conRows.push([
        '对比期',
        `${result.compare.label}：${result.compare.totalScore} 分`,
      ]);
    }
    conRows.push(['评估结论', insights.summary]);
    conRows.push(['核心优势', insights.strengths.map((s) => s.name).join('、') || '—']);
    conRows.push(['关键短板', insights.weaknesses.map((w) => w.name).join('、') || '—']);
    for (const s of insights.weaknesses) {
      conRows.push([`建议·${s.name}`, s.suggestion ?? '—']);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(conRows as unknown[][]);
    ws3['!cols'] = [{ wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws3, '评估结论');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer, fileName: `能力评估报告-${objName}-${stamp}.xlsx` };
  }

  // ==================== 内部工具 ====================

  private async resolveDimensionMetas(): Promise<CapabilityDimensionMeta[]> {
    const defaults = buildDefaultDimensionMetas();
    try {
      const rows = await this.db
        .select()
        .from(capabilityDimensionConfig)
        .orderBy(capabilityDimensionConfig.sortOrder);
      if (rows.length === 0) return defaults;
      const configMap = new Map(rows.map((r) => [r.dimensionKey, r]));
      return defaults.map((d) => {
        const c = configMap.get(d.key);
        if (!c) return d;
        return {
          ...d,
          weight: parseNumeric(c.weight) || d.weight,
          enabled: c.enabled,
          thresholdHigh: c.thresholdHigh,
          thresholdLow: c.thresholdLow,
        };
      });
    } catch (err) {
      this.logger.warn(`resolveDimensionMetas 回退注册表默认值: ${(err as Error).message}`);
      return defaults;
    }
  }

  private buildWeightOverrides(metas: CapabilityDimensionMeta[]): Record<string, number> {
    const overrides: Record<string, number> = {};
    for (const m of metas) {
      if (m.enabled) overrides[m.key] = m.weight;
    }
    return overrides;
  }

  /** 解析月份范围；缺省时取有客户销额数据的最近月份 */
  private resolveMonthRange(
    params: CapabilityScoreParams,
    expenses: import('@shared/api.interface').ExpenseRecord[],
  ): { monthFrom: string; monthTo: string } {
    const months = this.collectSalesMonths(expenses);
    const latest = months[months.length - 1] ?? null;
    let monthFrom = params.monthFrom?.trim();
    let monthTo = params.monthTo?.trim();
    if (!monthFrom && !monthTo) {
      if (!latest) {
        throw new NotFoundException('暂无客户销额数据，请先上传费用资料');
      }
      return { monthFrom: latest, monthTo: latest };
    }
    const parsedFrom = monthFrom ? parseAtpMonthStrict(monthFrom) : null;
    const parsedTo = monthTo ? parseAtpMonthStrict(monthTo) : null;
    if (monthFrom && !parsedFrom) throw new BadRequestException(`无效的起始月份: ${monthFrom}`);
    if (monthTo && !parsedTo) throw new BadRequestException(`无效的结束月份: ${monthTo}`);
    const from = parsedFrom ?? latest ?? parsedTo ?? '';
    const to = parsedTo ?? from;
    if (!from || !to) throw new BadRequestException('无法确定评估月份范围');
    return { monthFrom: from <= to ? from : to, monthTo: from <= to ? to : from };
  }

  /** 收集客户销额记录中出现的月份（口径与 getAtpAvailableMonths 一致） */
  private collectSalesMonths(expenses: import('@shared/api.interface').ExpenseRecord[]): string[] {
    const monthSet = new Set<string>();
    for (const e of expenses) {
      if (String(e.sheetType ?? '').trim() !== '客户销额') continue;
      for (const [key, value] of Object.entries(e.extras ?? {})) {
        const parsedKey = parseAtpMonthStrict(key);
        if (parsedKey) monthSet.add(parsedKey);
        const strValue = String(value ?? '').trim();
        if (/(月|时间|期间|yearmonth|month|period)/i.test(String(key)) || /^\d{1,2}月\s*\d{4}$/.test(strValue)) {
          const parsedValue = parseAtpMonthStrict(strValue);
          if (parsedValue) monthSet.add(parsedValue);
        }
      }
    }
    return Array.from(monthSet).sort();
  }

  /** 维度展示排序（按注册表 sortOrder） */
  private sortIndex(key: string): number {
    return CAPABILITY_DIMENSIONS.find((d) => d.key === key)?.sortOrder ?? 99;
  }
}

/** 原始值展示文案 */
function formatRawLabel(raw: number | null, meta: CapabilityDimensionMeta): string {
  if (raw == null || !Number.isFinite(raw)) return '—';
  if (meta.unit === '%') return `${(raw * 100).toFixed(1)}%`;
  if (meta.unit === '元') return `¥${Math.round(raw).toLocaleString('zh-CN')}`;
  if (meta.unit === '元/点') return `¥${Math.round(raw).toLocaleString('zh-CN')}/点`;
  return String(Math.round(raw * 100) / 100);
}

/** 等级中文标签 */
function levelLabel(level: CapabilityScoreLevel): string {
  if (level === 'strength') return '优势';
  if (level === 'medium') return '中等';
  return '短板';
}
