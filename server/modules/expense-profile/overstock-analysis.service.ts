import { Injectable, Logger } from '@nestjs/common';
import { ExpenseProfileService } from './expense-profile.service';
import {
  CustomerProfileService,
  DEALER_TYPE_TO_FORMAT,
} from '../customer-profile/customer-profile.service';
import { ExpiryAnalysisService, type ParsedExpiryRecord } from './expiry-analysis.service';
import { DatasetService } from '../dataset/dataset.service';
import type {
  OverstockAnalysisFilters,
  OverstockAnalysisResult,
  OverstockStoreRiskItem,
  OverstockRepRiskItem,
  OverstockSpecRiskItem,
  OverstockCohortItem,
  OverstockAnalysisExportResult,
  OverstockPurchaseDrilldown,
  OverstockPurchaseDrilldownGroup,
  OverstockPurchaseDrilldownItem,
} from '@shared/api.interface';

interface EnrichedCohort {
  customerCode: string;
  customerName: string;
  specification: string;
  purchaseMonth: string;
  purchaseAmount: number;
  purchaseQuantity: number;
  salesRep: string;
  region: string;
  tier: string;
  dealerType: string;
  business: string;
  expiryMonth4Amount: number;
  expiryMonth5Amount: number;
}

@Injectable()
export class OverstockAnalysisService {
  private readonly logger = new Logger(OverstockAnalysisService.name);

  constructor(
    private readonly expenseProfileService: ExpenseProfileService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly expiryAnalysisService: ExpiryAnalysisService,
  ) {}

  async analyze(filters: OverstockAnalysisFilters): Promise<OverstockAnalysisResult> {
    const [allExpenses, purchaseRecords] = await Promise.all([
      this.expenseProfileService.findAllUnpaginated(),
      DatasetService.getLatestDatasetPurchaseRecords(),
    ]);

    this.logger.debug(
      `差异门店分析：进货记录 ${purchaseRecords.length} 条，临期原始记录 ${allExpenses.length} 条`,
    );

    const expiryProfileMap = await this.expiryAnalysisService.buildProfileMap();
    const parsedExpiry = this.expiryAnalysisService.parseExpiryRecords(allExpenses, expiryProfileMap);
    const filteredExpiry = this.expiryAnalysisService.applyFilters(parsedExpiry, {
      monthFrom: filters.monthFrom,
      monthTo: filters.monthTo,
      region: filters.region,
      tier: filters.tier,
      dealerType: filters.dealerType,
      business: filters.business,
      specification: filters.specification,
    });

    const normProfileMap = await this.buildNormalizedProfileMap();
    const cohortMap = this.buildCohorts(purchaseRecords, normProfileMap, filters);
    this.distributeExpiryAmounts(cohortMap, filteredExpiry);

    this.logger.debug(
      `差异门店分析：cohort 数 ${cohortMap.size}，筛选后临期记录 ${filteredExpiry.length} 条`,
    );

    const cohortItems = this.buildCohortItems(cohortMap);
    const storeRisks = this.buildStoreRisks(cohortMap);
    const repRisks = this.buildRepRisks(cohortMap);
    const specRisks = this.buildSpecRisks(cohortMap);

    const storeThreshold = this.flagByStdDev(storeRisks);
    this.flagByStdDev(repRisks);

    const summary = this.buildSummary(cohortMap, storeRisks, repRisks, storeThreshold);
    const availableFilters = this.extractAvailableFilters(
      parsedExpiry,
      purchaseRecords,
      normProfileMap,
    );

    return {
      summary,
      purchaseDrilldown: this.buildPurchaseDrilldown(cohortMap),
      storeRisks,
      repRisks,
      specRisks,
      cohorts: cohortItems,
      availableFilters,
    };
  }

  async getExport(filters: OverstockAnalysisFilters): Promise<OverstockAnalysisExportResult> {
    const result = await this.analyze(filters);
    return {
      summary: result.summary,
      storeRisks: result.storeRisks,
      repRisks: result.repRisks,
      specRisks: result.specRisks,
      cohorts: result.cohorts,
    };
  }

  private normalizeCustomerCode(code: string): string {
    const trimmed = String(code ?? '').trim();
    if (/^1201\//i.test(trimmed)) return trimmed;
    if (/^KH\d+/i.test(trimmed)) return trimmed;
    const m = trimmed.match(/^0+(\d+)$/);
    if (m) return `1201/${m[1]}`;
    return trimmed;
  }

  private async buildNormalizedProfileMap(): Promise<
    Map<
      string,
      {
        customerName: string;
        region: string;
        tier: string;
        dealerType: string;
        business: string;
      }
    >
  > {
    const map = new Map<
      string,
      { customerName: string; region: string; tier: string; dealerType: string; business: string }
    >();
    try {
      const profiles = await this.customerProfileService.findAllUnpaginated();
      for (const p of profiles) {
        const rawDealerType = String(p.extras['经销商类型'] ?? '').trim();
        const dealerType = DEALER_TYPE_TO_FORMAT[rawDealerType] ?? rawDealerType;
        const business = String(p.extras['客户经理'] ?? '').trim();
        const key = this.normalizeCustomerCode(p.customerCode);
        map.set(key, {
          customerName: p.customerName,
          region: p.region,
          tier: p.tier,
          dealerType,
          business,
        });
      }
    } catch (err) {
      this.logger.warn(`构建归一化客户资料映射失败: ${(err as Error).message}`);
    }
    return map;
  }

  private buildCohorts(
    purchaseRecords: Array<{
      customerCode: string;
      specification: string;
      purchaseMonth: string;
      purchaseAmount: number;
      purchaseQuantity: number;
      salesRep?: string;
      region?: string;
    }>,
    profileMap: Map<
      string,
      {
        customerName: string;
        region: string;
        tier: string;
        dealerType: string;
        business: string;
      }
    >,
    filters: OverstockAnalysisFilters,
  ): Map<string, EnrichedCohort> {
    // 进货月口径：仅统计筛选月（临期发生月）向前偏移 4 / 5 个月的进货批次。
    // 例如筛选 7 月时，进货月范围 = [7-5, 7-4] = [2月, 3月]；
    // 区间筛选时对应 [monthFrom-5, monthTo-4]。未筛选月份则不限制进货月。
    const purchaseMonthFrom = filters.monthFrom
      ? this.expiryAnalysisService.addMonths(filters.monthFrom, -5)
      : undefined;
    const purchaseMonthTo = filters.monthTo
      ? this.expiryAnalysisService.addMonths(filters.monthTo, -4)
      : undefined;

    const map = new Map<string, EnrichedCohort>();

    for (const r of purchaseRecords) {
      if (purchaseMonthFrom && r.purchaseMonth < purchaseMonthFrom) continue;
      if (purchaseMonthTo && r.purchaseMonth > purchaseMonthTo) continue;

      const profile = profileMap.get(r.customerCode);
      const region = r.region || profile?.region || '';
      const tier = profile?.tier || '';
      const dealerType = profile?.dealerType || '';
      const business = profile?.business || '';
      const salesRep = r.salesRep || profile?.business || '';
      const customerName = profile?.customerName || '';

      if (filters.region?.length && !filters.region.includes(region)) continue;
      if (filters.tier?.length && !filters.tier.includes(tier)) continue;
      if (filters.dealerType?.length && !filters.dealerType.includes(dealerType)) continue;
      if (filters.business?.length && !filters.business.includes(business)) continue;
      if (filters.specification?.length && !filters.specification.includes(r.specification)) continue;
      if (filters.salesRep?.length && !filters.salesRep.includes(salesRep)) continue;

      const key = `${r.customerCode}\t${r.specification}\t${r.purchaseMonth}`;
      const existing = map.get(key);
      if (existing) {
        existing.purchaseAmount += r.purchaseAmount;
        existing.purchaseQuantity += r.purchaseQuantity;
      } else {
        map.set(key, {
          customerCode: r.customerCode,
          customerName,
          specification: r.specification,
          purchaseMonth: r.purchaseMonth,
          purchaseAmount: r.purchaseAmount,
          purchaseQuantity: r.purchaseQuantity,
          salesRep,
          region,
          tier,
          dealerType,
          business,
          expiryMonth4Amount: 0,
          expiryMonth5Amount: 0,
        });
      }
    }

    return map;
  }

  private distributeExpiryAmounts(
    cohortMap: Map<string, EnrichedCohort>,
    expiryRecords: ParsedExpiryRecord[],
  ): void {
    for (const e of expiryRecords) {
      if (!e.customerCode || !e.month || !e.specification) continue;
      const normalizedCode = this.normalizeCustomerCode(e.customerCode);
      // 一条临期记录只能归因到一批进货：优先匹配 offset=4（M-4 最近进货批次），
      // 未命中再尝试 offset=5（M-5），避免同一临期记录同时命中两个进货月
      // 造成金额被重复计入（如 M-4 与 M-5 月均存在同规格进货时翻倍）。
      const month4 = this.expiryAnalysisService.addMonths(e.month, -4);
      const cohort4 = cohortMap.get(`${normalizedCode}\t${e.specification}\t${month4}`);
      if (cohort4) {
        cohort4.expiryMonth4Amount += e.amount;
        continue;
      }
      const month5 = this.expiryAnalysisService.addMonths(e.month, -5);
      const cohort5 = cohortMap.get(`${normalizedCode}\t${e.specification}\t${month5}`);
      if (cohort5) {
        cohort5.expiryMonth5Amount += e.amount;
      }
    }
  }

  private buildCohortItems(cohortMap: Map<string, EnrichedCohort>): OverstockCohortItem[] {
    const items: OverstockCohortItem[] = [];
    for (const c of cohortMap.values()) {
      const expiryAmount = c.expiryMonth4Amount + c.expiryMonth5Amount;
      const conversionRate = c.purchaseAmount > 0 ? expiryAmount / c.purchaseAmount : 0;
      items.push({
        customerCode: c.customerCode,
        customerName: c.customerName,
        region: c.region,
        business: c.business,
        salesRep: c.salesRep,
        specification: c.specification,
        purchaseMonth: c.purchaseMonth,
        purchaseAmount: Math.round(c.purchaseAmount * 100) / 100,
        purchaseQuantity: Math.round(c.purchaseQuantity * 100) / 100,
        expiryMonth4Amount: Math.round(c.expiryMonth4Amount * 100) / 100,
        expiryMonth5Amount: Math.round(c.expiryMonth5Amount * 100) / 100,
        expiryAmount: Math.round(expiryAmount * 100) / 100,
        conversionRate: Math.round(conversionRate * 10000) / 10000,
      });
    }
    return items.sort((a, b) => b.conversionRate - a.conversionRate || a.purchaseAmount - b.purchaseAmount);
  }

  /**
   * 构建「总进货金额」下钻数据。
   *
   * 下钻口径：筛选月（临期发生月 M）的临期品项，在往前偏移 4 / 5 个月
   * （即 M-4、M-5）的进货金额明细。同一进货批次若同时命中 -4/-5 两个
   * 偏移，则分别在两个分组中展示各自对应的临期金额。
   */
  private buildPurchaseDrilldown(
    cohortMap: Map<string, EnrichedCohort>,
  ): OverstockPurchaseDrilldown {
    const groupMap = new Map<string, OverstockPurchaseDrilldownGroup>();

    const upsertGroup = (
      expiryMonth: string,
      purchaseMonth: string,
      offset: number,
    ): OverstockPurchaseDrilldownGroup => {
      const key = `${expiryMonth}\t${purchaseMonth}\t${offset}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          expiryMonth,
          purchaseMonth,
          offset,
          purchaseAmount: 0,
          purchaseQuantity: 0,
          expiryAmount: 0,
          storeCount: 0,
          itemCount: 0,
          items: [],
        };
        groupMap.set(key, group);
      }
      return group;
    };

    for (const c of cohortMap.values()) {
      // offset = 4 对应的临期月为 purchaseMonth + 4
      if (c.expiryMonth4Amount > 0) {
        const expiryMonth = this.expiryAnalysisService.addMonths(c.purchaseMonth, 4);
        const group = upsertGroup(expiryMonth, c.purchaseMonth, 4);
        const item: OverstockPurchaseDrilldownItem = {
          expiryMonth,
          purchaseMonth: c.purchaseMonth,
          offset: 4,
          customerCode: c.customerCode,
          customerName: c.customerName,
          region: c.region,
          business: c.business,
          salesRep: c.salesRep,
          specification: c.specification,
          purchaseAmount: Math.round(c.purchaseAmount * 100) / 100,
          purchaseQuantity: Math.round(c.purchaseQuantity * 100) / 100,
          expiryAmount: Math.round(c.expiryMonth4Amount * 100) / 100,
        };
        group.items.push(item);
        group.purchaseAmount += c.purchaseAmount;
        group.purchaseQuantity += c.purchaseQuantity;
        group.expiryAmount += c.expiryMonth4Amount;
      }

      // offset = 5 对应的临期月为 purchaseMonth + 5
      if (c.expiryMonth5Amount > 0) {
        const expiryMonth = this.expiryAnalysisService.addMonths(c.purchaseMonth, 5);
        const group = upsertGroup(expiryMonth, c.purchaseMonth, 5);
        const item: OverstockPurchaseDrilldownItem = {
          expiryMonth,
          purchaseMonth: c.purchaseMonth,
          offset: 5,
          customerCode: c.customerCode,
          customerName: c.customerName,
          region: c.region,
          business: c.business,
          salesRep: c.salesRep,
          specification: c.specification,
          purchaseAmount: Math.round(c.purchaseAmount * 100) / 100,
          purchaseQuantity: Math.round(c.purchaseQuantity * 100) / 100,
          expiryAmount: Math.round(c.expiryMonth5Amount * 100) / 100,
        };
        group.items.push(item);
        group.purchaseAmount += c.purchaseAmount;
        group.purchaseQuantity += c.purchaseQuantity;
        group.expiryAmount += c.expiryMonth5Amount;
      }
    }

    const groups: OverstockPurchaseDrilldownGroup[] = [];
    let totalPurchaseAmount = 0;
    let totalPurchaseQuantity = 0;
    for (const g of groupMap.values()) {
      const storeSet = new Set<string>();
      for (const item of g.items) {
        storeSet.add(item.customerCode);
      }
      g.storeCount = storeSet.size;
      g.itemCount = g.items.length;
      g.purchaseAmount = Math.round(g.purchaseAmount * 100) / 100;
      g.purchaseQuantity = Math.round(g.purchaseQuantity * 100) / 100;
      g.expiryAmount = Math.round(g.expiryAmount * 100) / 100;
      g.items.sort((a, b) => b.expiryAmount - a.expiryAmount);
      totalPurchaseAmount += g.purchaseAmount;
      totalPurchaseQuantity += g.purchaseQuantity;
      groups.push(g);
    }

    groups.sort(
      (a, b) =>
        a.expiryMonth.localeCompare(b.expiryMonth) ||
        b.purchaseAmount - a.purchaseAmount,
    );

    return {
      totalPurchaseAmount: Math.round(totalPurchaseAmount * 100) / 100,
      totalPurchaseQuantity: Math.round(totalPurchaseQuantity * 100) / 100,
      groups,
    };
  }

  private buildStoreRisks(cohortMap: Map<string, EnrichedCohort>): OverstockStoreRiskItem[] {
    const groups = new Map<string, OverstockStoreRiskItem & { _purchaseAmountSum: number; _purchaseQuantitySum: number; _expSum: number }>();
    for (const c of cohortMap.values()) {
      const existing = groups.get(c.customerCode);
      const expiryAmount = c.expiryMonth4Amount + c.expiryMonth5Amount;
      if (existing) {
        existing._purchaseAmountSum += c.purchaseAmount;
        existing._purchaseQuantitySum += c.purchaseQuantity;
        existing._expSum += expiryAmount;
      } else {
        groups.set(c.customerCode, {
          customerCode: c.customerCode,
          customerName: c.customerName,
          region: c.region,
          business: c.business,
          salesRep: c.salesRep,
          purchaseAmount: 0,
          purchaseQuantity: 0,
          expiryAmount: 0,
          conversionRate: 0,
          isFlagged: false,
          _purchaseAmountSum: c.purchaseAmount,
          _purchaseQuantitySum: c.purchaseQuantity,
          _expSum: expiryAmount,
        });
      }
    }

    const result: OverstockStoreRiskItem[] = [];
    for (const g of groups.values()) {
      g.purchaseAmount = Math.round(g._purchaseAmountSum * 100) / 100;
      g.purchaseQuantity = Math.round(g._purchaseQuantitySum * 100) / 100;
      g.expiryAmount = Math.round(g._expSum * 100) / 100;
      g.conversionRate = g.purchaseAmount > 0 ? Math.round((g._expSum / g._purchaseAmountSum) * 10000) / 10000 : 0;
      result.push(g);
    }
    return result.sort((a, b) => b.conversionRate - a.conversionRate || a.purchaseAmount - b.purchaseAmount);
  }

  private buildRepRisks(cohortMap: Map<string, EnrichedCohort>): OverstockRepRiskItem[] {
    const groups = new Map<
      string,
      OverstockRepRiskItem & { _purchaseAmountSum: number; _purchaseQuantitySum: number; _expSum: number; _stores: Set<string> }
    >();
    for (const c of cohortMap.values()) {
      const key = `${c.salesRep}||${c.region}`;
      const existing = groups.get(key);
      const expiryAmount = c.expiryMonth4Amount + c.expiryMonth5Amount;
      if (existing) {
        existing._purchaseAmountSum += c.purchaseAmount;
        existing._purchaseQuantitySum += c.purchaseQuantity;
        existing._expSum += expiryAmount;
        existing._stores.add(c.customerCode);
      } else {
        groups.set(key, {
          salesRep: c.salesRep,
          region: c.region,
          storeCount: 1,
          purchaseAmount: 0,
          purchaseQuantity: 0,
          expiryAmount: 0,
          conversionRate: 0,
          isFlagged: false,
          _purchaseAmountSum: c.purchaseAmount,
          _purchaseQuantitySum: c.purchaseQuantity,
          _expSum: expiryAmount,
          _stores: new Set<string>([c.customerCode]),
        });
      }
    }

    const result: OverstockRepRiskItem[] = [];
    for (const g of groups.values()) {
      g.storeCount = g._stores.size;
      g.purchaseAmount = Math.round(g._purchaseAmountSum * 100) / 100;
      g.purchaseQuantity = Math.round(g._purchaseQuantitySum * 100) / 100;
      g.expiryAmount = Math.round(g._expSum * 100) / 100;
      g.conversionRate = g.purchaseAmount > 0 ? Math.round((g._expSum / g._purchaseAmountSum) * 10000) / 10000 : 0;
      result.push(g);
    }
    return result.sort((a, b) => b.conversionRate - a.conversionRate || a.purchaseAmount - b.purchaseAmount);
  }

  private buildSpecRisks(cohortMap: Map<string, EnrichedCohort>): OverstockSpecRiskItem[] {
    const groups = new Map<string, OverstockSpecRiskItem & { _purchaseAmountSum: number; _purchaseQuantitySum: number; _expSum: number }>();
    for (const c of cohortMap.values()) {
      const existing = groups.get(c.specification);
      const expiryAmount = c.expiryMonth4Amount + c.expiryMonth5Amount;
      if (existing) {
        existing._purchaseAmountSum += c.purchaseAmount;
        existing._purchaseQuantitySum += c.purchaseQuantity;
        existing._expSum += expiryAmount;
      } else {
        groups.set(c.specification, {
          specification: c.specification,
          purchaseAmount: 0,
          purchaseQuantity: 0,
          expiryAmount: 0,
          conversionRate: 0,
          _purchaseAmountSum: c.purchaseAmount,
          _purchaseQuantitySum: c.purchaseQuantity,
          _expSum: expiryAmount,
        });
      }
    }

    const result: OverstockSpecRiskItem[] = [];
    for (const g of groups.values()) {
      g.purchaseAmount = Math.round(g._purchaseAmountSum * 100) / 100;
      g.purchaseQuantity = Math.round(g._purchaseQuantitySum * 100) / 100;
      g.expiryAmount = Math.round(g._expSum * 100) / 100;
      g.conversionRate = g.purchaseAmount > 0 ? Math.round((g._expSum / g._purchaseAmountSum) * 10000) / 10000 : 0;
      result.push(g);
    }
    return result.sort((a, b) => b.expiryAmount - a.expiryAmount || b.conversionRate - a.conversionRate);
  }

  private flagByStdDev<T extends { conversionRate: number; isFlagged?: boolean }>(
    items: T[],
  ): number {
    const values = items.map((i) => i.conversionRate);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const std = Math.sqrt(variance);
    const threshold = mean + 2 * std;
    for (const item of items) {
      item.isFlagged = item.conversionRate > threshold;
    }
    return Math.round(threshold * 10000) / 10000;
  }

  private buildSummary(
    cohortMap: Map<string, EnrichedCohort>,
    storeRisks: OverstockStoreRiskItem[],
    repRisks: OverstockRepRiskItem[],
    threshold: number,
  ): OverstockAnalysisResult['summary'] {
    let totalPurchaseAmount = 0;
    let totalExpiryAmount = 0;
    for (const c of cohortMap.values()) {
      totalPurchaseAmount += c.purchaseAmount;
      totalExpiryAmount += c.expiryMonth4Amount + c.expiryMonth5Amount;
    }
    totalPurchaseAmount = Math.round(totalPurchaseAmount * 100) / 100;
    totalExpiryAmount = Math.round(totalExpiryAmount * 100) / 100;
    const avgConversionRate =
      totalPurchaseAmount > 0 ? Math.round((totalExpiryAmount / totalPurchaseAmount) * 10000) / 10000 : 0;
    return {
      totalPurchaseAmount,
      totalExpiryAmount,
      avgConversionRate,
      flaggedStoreCount: storeRisks.filter((r) => r.isFlagged).length,
      flaggedRepCount: repRisks.filter((r) => r.isFlagged).length,
      threshold,
    };
  }

  private extractAvailableFilters(
    parsedExpiry: ParsedExpiryRecord[],
    purchaseRecords: Array<{
      customerCode: string;
      specification: string;
      purchaseMonth: string;
      purchaseAmount: number;
      purchaseQuantity: number;
      salesRep?: string;
      region?: string;
    }>,
    profileMap: Map<
      string,
      {
        customerName: string;
        region: string;
        tier: string;
        dealerType: string;
        business: string;
      }
    >,
  ): OverstockAnalysisResult['availableFilters'] {
    const regions = new Set<string>();
    const tiers = new Set<string>();
    const dealerTypes = new Set<string>();
    const businesses = new Set<string>();
    const specifications = new Set<string>();
    const salesReps = new Set<string>();
    const months = new Set<string>();

    for (const r of parsedExpiry) {
      if (r.month) months.add(r.month);
      if (r.region) regions.add(r.region);
      if (r.tier) tiers.add(r.tier);
      if (r.dealerType) dealerTypes.add(r.dealerType);
      if (r.business) businesses.add(r.business);
      if (r.specification) specifications.add(r.specification);
    }

    for (const r of purchaseRecords) {
      if (r.specification) specifications.add(r.specification);
      const profile = profileMap.get(r.customerCode);
      if (profile) {
        if (profile.region) regions.add(profile.region);
        if (profile.tier) tiers.add(profile.tier);
        if (profile.dealerType) dealerTypes.add(profile.dealerType);
        if (profile.business) {
          businesses.add(profile.business);
          salesReps.add(profile.business);
        }
      }
      if (r.salesRep) salesReps.add(r.salesRep);
    }

    return {
      regions: Array.from(regions).sort(),
      tiers: Array.from(tiers).sort(),
      dealerTypes: Array.from(dealerTypes).sort(),
      businesses: Array.from(businesses).sort(),
      specifications: Array.from(specifications).sort(),
      salesReps: Array.from(salesReps).sort(),
      months: Array.from(months).sort(),
    };
  }
}
