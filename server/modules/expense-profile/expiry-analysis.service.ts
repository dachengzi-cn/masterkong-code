import { Injectable, Logger } from '@nestjs/common';
import { ExpenseProfileService } from './expense-profile.service';
import { CustomerProfileService, DEALER_TYPE_TO_FORMAT } from '../customer-profile/customer-profile.service';
import type {
  ExpenseRecord,
  ExpiryAnalysisFilters,
  ExpiryAnalysisResult,
  ExpiryDrilldownResult,
  ExpiryDrilldownStoreOver500Row,
  ExpiryDrilldownSpecShareRow,
  ExpiryDrilldownOfficeSpecShareRow,
  ExpiryKpiData,
  ExpiryOfficeAmountMom,
  ExpiryOfficeRankingItem,
  ExpiryOfficeStoreMom,
  ExpiryOver500StoreDetail,
  ExpiryRankingExportCell,
  ExpiryRankingExportResult,
  ExpiryRankingExportRow,
  ExpiryRankingExportSheet,
  ExpiryRankingItem,
  ExpiryStoreOver500Item,
  ExpiryTopSpecificationItem,
  ExpiryTrendItem,
  ExpiryWarningItem,
  ExpiryRiskLevel,
} from '@shared/api.interface';

export interface ParsedExpiryRecord {
  month: string;
  region: string;
  tier: string;
  dealerType: string;
  business: string;
  specification: string;
  customerCode: string;
  customerName: string;
  amount: number;
  sheetType: string;
}

const AMOUNT_THRESHOLD_HIGH = 50_000;
const MOM_THRESHOLD_HIGH = 0.5;
const MOM_THRESHOLD_MEDIUM = 0.2;
const REGION_SHARE_THRESHOLD = 0.4;
const DEALER_TYPE_SHARE_THRESHOLD = 0.4;
const SPECIFICATION_SHARE_THRESHOLD = 0.3;

@Injectable()
export class ExpiryAnalysisService {
  private readonly logger = new Logger(ExpiryAnalysisService.name);

  constructor(
    private readonly expenseProfileService: ExpenseProfileService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  async analyze(filters: ExpiryAnalysisFilters): Promise<ExpiryAnalysisResult> {
    const allRecords = await this.expenseProfileService.findAllUnpaginated();
    const profileMap = await this.buildProfileMap();
    const parsed = this.parseExpiryRecords(allRecords, profileMap);

    // 趋势图保留全部月份，不受月份筛选影响
    const trend = this.aggregateTrend(parsed);
    const filtered = this.applyFilters(parsed, filters);

    const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
    const totalRecords = filtered.length;

    const latestMonthAnalysis = this.analyzeLatestMonth(filtered, trend);

    const regionRank = this.aggregateByDimension(filtered, 'region');
    const tierRank = this.aggregateByDimension(filtered, 'tier');
    const dealerTypeRank = this.aggregateByDimension(filtered, 'dealerType');
    const businessRank = this.aggregateByDimension(filtered, 'business');
    const specificationRank = this.aggregateByDimension(filtered, 'specification');

    const { topCurrentMonthOffices, topThreeMonthOffices } =
      this.computeOfficeWindowRankings(parsed, filtered);

    const warnings = this.generateWarnings(
      totalAmount,
      latestMonthAnalysis,
      regionRank,
      dealerTypeRank,
      specificationRank,
    );

    const involvedStoreCount = new Set(filtered.map((r) => r.customerCode).filter(Boolean)).size;
    const threshold = filters.amountThreshold ?? 500;
    const storeOver500ByOffice = this.computeStoreOver500ByOffice(filtered, threshold);
    const topSpecifications = this.computeTopSpecifications(filtered);
    const topOfficeMom = this.computeTopOfficeMomChange(parsed, filtered, trend);
    const hasMonthFilter = filters.monthFrom && filters.monthTo;
    const officeStoreMom = hasMonthFilter
      ? this.computePeriodStoreMom(parsed, filtered, filters.monthFrom, filters.monthTo)
      : this.computeOfficeStoreMom(parsed, filtered);
    const officeAmountMom = hasMonthFilter
      ? this.computePeriodAmountMom(parsed, filtered, filters.monthFrom, filters.monthTo)
      : this.computeOfficeAmountMom(parsed, filtered);
    const monthOverMonthChange = hasMonthFilter
      ? this.computeTotalAmountMom(parsed, filters.monthFrom, filters.monthTo)
      : latestMonthAnalysis.change;

    const kpis: ExpiryKpiData = {
      totalAmount,
      monthOverMonthChange,
      topOfficeName: topOfficeMom.office,
      topOfficeMomChange: topOfficeMom.change,
      involvedStoreCount,
      storeOver500ByOffice,
      topSpecifications,
      officeStoreMom,
      officeAmountMom,
    };

    const availableFilters = this.extractAvailableFilters(parsed);

    return {
      kpis,
      trend,
      regionRank,
      tierRank,
      dealerTypeRank,
      businessRank,
      specificationRank,
      warnings,
      topCurrentMonthOffices,
      topThreeMonthOffices,
      availableFilters,
    };
  }

  /** 获取可用的筛选选项（月份、规格等），独立于主分析查询，供前端初始化时填充下拉 */
  async getAvailableFilters(): Promise<{ months: string[]; specifications: string[] }> {
    const allRecords = await this.expenseProfileService.findAllUnpaginated();
    const profileMap = await this.buildProfileMap();
    const parsed = this.parseExpiryRecords(allRecords, profileMap);
    const { months, specifications } = this.extractAvailableFilters(parsed);
    return { months, specifications };
  }

  async getDrilldown(filters: ExpiryAnalysisFilters): Promise<ExpiryDrilldownResult> {
    const allRecords = await this.expenseProfileService.findAllUnpaginated();
    const profileMap = await this.buildProfileMap();
    const parsed = this.parseExpiryRecords(allRecords, profileMap);
    const filtered = this.applyFilters(parsed, filters);

    const months = Array.from(new Set(filtered.map((r) => r.month).filter(Boolean))).sort().reverse();
    const threshold = filters.amountThreshold ?? 500;

    const storeOver500Monthly = this.computeStoreOver500Monthly(filtered, months, threshold);
    const over500StoreSpecShare = this.computeOver500StoreSpecShare(filtered, months, threshold);
    const officeMonthlySpecShare = this.computeOfficeMonthlySpecShare(filtered, months);

    return {
      months,
      storeOver500Monthly,
      over500StoreSpecShare,
      officeMonthlySpecShare,
    };
  }

  async getRankingExport(filters: ExpiryAnalysisFilters): Promise<ExpiryRankingExportResult> {
    const allRecords = await this.expenseProfileService.findAllUnpaginated();
    const profileMap = await this.buildProfileMap();
    const parsed = this.parseExpiryRecords(allRecords, profileMap);
    const filtered = this.applyFilters(parsed, filters);

    const offices = Array.from(new Set(filtered.map((r) => r.region).filter(Boolean))).sort();

    return {
      region: this.buildRankingExportSheet(filtered, 'region', '所别', offices),
      tier: this.buildRankingExportSheet(filtered, 'tier', '阶层', offices),
      dealerType: this.buildRankingExportSheet(filtered, 'dealerType', '形态', offices),
      business: this.buildRankingExportSheet(filtered, 'business', '业务', offices),
      specification: this.buildRankingExportSheet(filtered, 'specification', '规格', offices),
    };
  }

  async getOver500StoreDetails(filters: ExpiryAnalysisFilters): Promise<ExpiryOver500StoreDetail[]> {
    const allRecords = await this.expenseProfileService.findAllUnpaginated();
    const profileMap = await this.buildProfileMap();
    const parsed = this.parseExpiryRecords(allRecords, profileMap);
    const filtered = this.applyFilters(parsed, filters);

    const storeMonthlyMap = new Map<string, Map<string, { amount: number; records: ParsedExpiryRecord[] }>>();
    for (const r of filtered) {
      if (!r.customerCode || !r.month) continue;
      const monthMap = storeMonthlyMap.get(r.customerCode) ?? new Map<string, { amount: number; records: ParsedExpiryRecord[] }>();
      const item = monthMap.get(r.month) ?? { amount: 0, records: [] };
      item.amount += r.amount;
      item.records.push(r);
      monthMap.set(r.month, item);
      storeMonthlyMap.set(r.customerCode, monthMap);
    }

    const threshold = filters.amountThreshold ?? 500;
    const result: ExpiryOver500StoreDetail[] = [];
    for (const [customerCode, monthMap] of storeMonthlyMap.entries()) {
      for (const [month, { amount, records }] of monthMap.entries()) {
        if (amount < threshold) continue;
        const sample = records[0];
        const topSpecs = this.getTopSpecsByAmount(records, amount);
        result.push({
          customerCode,
          customerName: sample.customerName,
          region: sample.region,
          tier: sample.tier,
          business: sample.business,
          dealerType: sample.dealerType,
          month,
          amount: this.round(amount),
          topSpecifications: topSpecs,
        });
      }
    }

    return result.sort((a, b) => a.region.localeCompare(b.region) || a.business.localeCompare(b.business) || b.amount - a.amount);
  }

  private getTopSpecsByAmount(
    records: ParsedExpiryRecord[],
    totalAmount: number,
  ): { specification: string; amount: number; share: number }[] {
    const specMap = new Map<string, number>();
    for (const r of records) {
      if (!r.specification) continue;
      specMap.set(r.specification, (specMap.get(r.specification) ?? 0) + r.amount);
    }
    return Array.from(specMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([specification, amount]) => ({
        specification,
        amount: this.round(amount),
        share: totalAmount > 0 ? this.round(amount / totalAmount) : 0,
      }));
  }

  private computeStoreOver500Monthly(
    records: ParsedExpiryRecord[],
    months: string[],
    threshold = 500,
  ): ExpiryDrilldownStoreOver500Row[] {
    const grouped = new Map<string, { region: string; tier: string; business: string; monthly: Map<string, Map<string, number>> }>();

    for (const r of records) {
      if (!r.region || !r.tier || !r.business || !r.customerCode || !r.month) continue;
      const key = `${r.region}|${r.tier}|${r.business}`;
      const item = grouped.get(key) ?? {
        region: r.region,
        tier: r.tier,
        business: r.business,
        monthly: new Map<string, Map<string, number>>(),
      };

      const storeMap = item.monthly.get(r.month) ?? new Map<string, number>();
      storeMap.set(r.customerCode, (storeMap.get(r.customerCode) ?? 0) + r.amount);
      item.monthly.set(r.month, storeMap);
      grouped.set(key, item);
    }

    const result: ExpiryDrilldownStoreOver500Row[] = [];
    for (const { region, tier, business, monthly } of grouped.values()) {
      const monthlyCounts: Record<string, number> = {};
      let totalCount = 0;
      for (const month of months) {
        const storeMap = monthly.get(month);
        const count = storeMap
          ? Array.from(storeMap.values()).filter((amount) => amount >= threshold).length
          : 0;
        monthlyCounts[month] = count;
        totalCount += count;
      }
      result.push({ region, tier, business, monthlyCounts, totalCount });
    }

    return result
      .filter((r) => r.totalCount > 0)
      .sort((a, b) => b.totalCount - a.totalCount || a.region.localeCompare(b.region))
      .slice(0, 15);
  }

  private computeOver500StoreSpecShare(
    records: ParsedExpiryRecord[],
    months: string[],
    threshold = 500,
  ): ExpiryDrilldownSpecShareRow[] {
    // Identify stores with monthly total >= threshold within the filtered records
    const storeMonthlyMap = new Map<string, Map<string, number>>();
    for (const r of records) {
      if (!r.customerCode || !r.month) continue;
      const monthMap = storeMonthlyMap.get(r.customerCode) ?? new Map<string, number>();
      monthMap.set(r.month, (monthMap.get(r.month) ?? 0) + r.amount);
      storeMonthlyMap.set(r.customerCode, monthMap);
    }

    const over500StoreMonths = new Set<string>();
    for (const [customerCode, monthMap] of storeMonthlyMap.entries()) {
      for (const [month, amount] of monthMap.entries()) {
        if (amount >= threshold) {
          over500StoreMonths.add(`${customerCode}|${month}`);
        }
      }
    }

    const specMonthlyAmount = new Map<string, Map<string, number>>();
    const monthlyTotals = new Map<string, number>();
    for (const r of records) {
      if (!r.specification || !r.month || !over500StoreMonths.has(`${r.customerCode}|${r.month}`)) continue;
      const monthMap = specMonthlyAmount.get(r.specification) ?? new Map<string, number>();
      monthMap.set(r.month, (monthMap.get(r.month) ?? 0) + r.amount);
      specMonthlyAmount.set(r.specification, monthMap);
      monthlyTotals.set(r.month, (monthlyTotals.get(r.month) ?? 0) + r.amount);
    }

    const specTotals = Array.from(specMonthlyAmount.entries()).map(([specification, monthMap]) => {
      const totalAmount = Array.from(monthMap.values()).reduce((sum, v) => sum + v, 0);
      return { specification, totalAmount };
    });

    const top5Specs = new Set(
      specTotals
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 5)
        .map((s) => s.specification),
    );

    return Array.from(specMonthlyAmount.entries())
      .sort(([, a], [, b]) => {
        const totalA = Array.from(a.values()).reduce((sum, v) => sum + v, 0);
        const totalB = Array.from(b.values()).reduce((sum, v) => sum + v, 0);
        return totalB - totalA;
      })
      .slice(0, 15)
      .map(([specification, monthMap]) => {
        const monthlyShares: Record<string, number> = {};
        const monthlyAmounts: Record<string, number> = {};
        let totalAmount = 0;
        for (const month of months) {
          const amount = monthMap.get(month) ?? 0;
          const total = monthlyTotals.get(month) ?? 1;
          monthlyAmounts[month] = this.round(amount);
          monthlyShares[month] = this.round(amount / total);
          totalAmount += amount;
        }
        return {
          specification,
          monthlyShares,
          monthlyAmounts,
          totalAmount: this.round(totalAmount),
          isTop5: top5Specs.has(specification),
        };
      });
  }

  private computeOfficeMonthlySpecShare(
    records: ParsedExpiryRecord[],
    months: string[],
  ): ExpiryDrilldownOfficeSpecShareRow[] {
    const officeSpecMonthlyAmount = new Map<string, Map<string, Map<string, number>>>();
    for (const r of records) {
      if (!r.region || !r.specification || !r.month) continue;
      const specMonthly = officeSpecMonthlyAmount.get(r.region) ?? new Map<string, Map<string, number>>();
      const monthly = specMonthly.get(r.specification) ?? new Map<string, number>();
      monthly.set(r.month, (monthly.get(r.month) ?? 0) + r.amount);
      specMonthly.set(r.specification, monthly);
      officeSpecMonthlyAmount.set(r.region, specMonthly);
    }

    const result: ExpiryDrilldownOfficeSpecShareRow[] = [];
    for (const [region, specMonthly] of officeSpecMonthlyAmount.entries()) {
      const specTotals = Array.from(specMonthly.entries()).map(([specification, monthly]) => ({
        specification,
        total: Array.from(monthly.values()).reduce((sum, v) => sum + v, 0),
      }));
      const top5Specs = specTotals
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((s) => s.specification);

      for (const specification of top5Specs) {
        const monthly = specMonthly.get(specification)!;
        const monthlyData: Record<string, { share: number; amount: number; rank: number }> = {};
        const monthRanks: { month: string; rank: number }[] = [];

        for (const month of months) {
          const officeMonthlyTotal = Array.from(specMonthly.values())
            .map((m) => m.get(month) ?? 0)
            .reduce((sum, v) => sum + v, 0);
          const amount = monthly.get(month) ?? 0;
          const sortedSpecs = Array.from(specMonthly.entries())
            .map(([spec, m]) => ({ spec, amount: m.get(month) ?? 0 }))
            .sort((a, b) => b.amount - a.amount);
          const rank = sortedSpecs.findIndex((s) => s.spec === specification) + 1;

          monthlyData[month] = {
            amount: this.round(amount),
            share: officeMonthlyTotal > 0 ? this.round(amount / officeMonthlyTotal) : 0,
            rank,
          };
          monthRanks.push({ month, rank });
        }

        const isConsecutiveTop1 = this.hasConsecutiveTop1(monthRanks, 3);
        result.push({ region, specification, monthlyData, isConsecutiveTop1 });
      }
    }

    return result.sort((a, b) => a.region.localeCompare(b.region) || a.specification.localeCompare(b.specification));
  }

  private hasConsecutiveTop1(ranks: { month: string; rank: number }[], consecutive: number): boolean {
    const sorted = [...ranks].sort((a, b) => a.month.localeCompare(b.month));
    let streak = 0;
    for (const { rank } of sorted) {
      if (rank === 1) {
        streak += 1;
        if (streak >= consecutive) return true;
      } else {
        streak = 0;
      }
    }
    return false;
  }

  private monthToDate(month: string): Date {
    const [year, mon] = month.split('-').map(Number);
    return new Date(year, mon - 1, 1);
  }

  private dateToMonth(date: Date): string {
    const year = date.getFullYear();
    const mon = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${mon}`;
  }

  private monthDiff(a: string, b: string): number {
    const d1 = this.monthToDate(a);
    const d2 = this.monthToDate(b);
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  }

  addMonths(month: string, n: number): string {
    const date = this.monthToDate(month);
    date.setMonth(date.getMonth() + n);
    return this.dateToMonth(date);
  }

  private computePrevPeriod(monthFrom?: string, monthTo?: string): { from?: string; to?: string } {
    if (!monthFrom || !monthTo) return {};
    const length = this.monthDiff(monthFrom, monthTo) + 1;
    const prevFrom = this.addMonths(monthFrom, -length);
    const prevTo = this.addMonths(monthTo, -length);
    return { from: prevFrom, to: prevTo };
  }

  isMonthInRange(month: string, from?: string, to?: string): boolean {
    if (!month) return false;
    if (from && month < from) return false;
    if (to && month > to) return false;
    return true;
  }

  private computePeriodStoreMom(
    allRecords: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
    monthFrom?: string,
    monthTo?: string,
  ): ExpiryOfficeStoreMom[] {
    const filteredRegions = Array.from(new Set(filtered.map((r) => r.region).filter(Boolean)));
    if (filteredRegions.length === 0) return [];

    const prev = this.computePrevPeriod(monthFrom, monthTo);

    const currentMap = new Map<string, Set<string>>();
    const prevMap = new Map<string, Set<string>>();

    for (const r of allRecords) {
      if (!r.region || !r.month || !r.customerCode) continue;
      if (this.isMonthInRange(r.month, monthFrom, monthTo)) {
        const set = currentMap.get(r.region) ?? new Set<string>();
        set.add(r.customerCode);
        currentMap.set(r.region, set);
      }
      if (this.isMonthInRange(r.month, prev.from, prev.to)) {
        const set = prevMap.get(r.region) ?? new Set<string>();
        set.add(r.customerCode);
        prevMap.set(r.region, set);
      }
    }

    return filteredRegions
      .sort()
      .map((office) => {
        const current = currentMap.get(office)?.size ?? 0;
        const prevCount = prevMap.get(office)?.size ?? 0;
        let momChange = 0;
        if (prevCount === 0) {
          momChange = current > 0 ? 100 : 0;
        } else {
          momChange = this.roundPct(((current - prevCount) / prevCount) * 100);
        }
        return { office, count: current, momChange };
      })
      .sort((a, b) => b.count - a.count || a.office.localeCompare(b.office));
  }

  private computePeriodAmountMom(
    allRecords: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
    monthFrom?: string,
    monthTo?: string,
  ): ExpiryOfficeAmountMom[] {
    const filteredRegions = Array.from(new Set(filtered.map((r) => r.region).filter(Boolean)));
    if (filteredRegions.length === 0) return [];

    const prev = this.computePrevPeriod(monthFrom, monthTo);

    const currentMap = new Map<string, number>();
    const prevMap = new Map<string, number>();

    for (const r of allRecords) {
      if (!r.region || !r.month) continue;
      if (this.isMonthInRange(r.month, monthFrom, monthTo)) {
        currentMap.set(r.region, (currentMap.get(r.region) ?? 0) + r.amount);
      }
      if (this.isMonthInRange(r.month, prev.from, prev.to)) {
        prevMap.set(r.region, (prevMap.get(r.region) ?? 0) + r.amount);
      }
    }

    return filteredRegions
      .sort()
      .map((office) => {
        const current = currentMap.get(office) ?? 0;
        const prevAmount = prevMap.get(office) ?? 0;
        let momChange = 0;
        if (prevAmount === 0) {
          momChange = current > 0 ? 100 : 0;
        } else {
          momChange = this.roundPct((current / prevAmount - 1) * 100);
        }
        return { office, amount: current, momChange };
      })
      .sort((a, b) => b.amount - a.amount || a.office.localeCompare(b.office));
  }

  private computeTotalAmountMom(
    allRecords: ParsedExpiryRecord[],
    monthFrom?: string,
    monthTo?: string,
  ): number {
    const prev = this.computePrevPeriod(monthFrom, monthTo);
    let current = 0;
    let prevAmount = 0;
    for (const r of allRecords) {
      if (!r.month) continue;
      if (this.isMonthInRange(r.month, monthFrom, monthTo)) {
        current += r.amount;
      }
      if (this.isMonthInRange(r.month, prev.from, prev.to)) {
        prevAmount += r.amount;
      }
    }
    if (prevAmount === 0) return current > 0 ? 100 : 0;
    return this.roundPct((current / prevAmount - 1) * 100);
  }

  async buildProfileMap(): Promise<Map<string, { customerName: string; region: string; tier: string; dealerType: string; business: string }>> {
    const map = new Map<string, { customerName: string; region: string; tier: string; dealerType: string; business: string }>();
    try {
      const profiles = await this.customerProfileService.findAllUnpaginated();
      for (const p of profiles) {
        const rawDealerType = String(p.extras['经销商类型'] ?? '').trim();
        const dealerType = DEALER_TYPE_TO_FORMAT[rawDealerType] ?? rawDealerType;
        const business = String(p.extras['客户经理'] ?? '').trim();
        map.set(p.customerCode, {
          customerName: p.customerName,
          region: p.region,
          tier: p.tier,
          dealerType,
          business,
        });
      }
    } catch (err) {
      this.logger.warn(`构建客户资料映射失败: ${(err as Error).message}`);
    }
    return map;
  }

  parseExpiryRecords(
    records: ExpenseRecord[],
    profileMap: Map<string, { customerName: string; region: string; tier: string; dealerType: string; business: string }>,
  ): ParsedExpiryRecord[] {
    const result: ParsedExpiryRecord[] = [];
    for (const record of records) {
      if (!this.isExpiryRecord(record)) {
        continue;
      }
      const extras = record.extras ?? {};
      const month = this.parseMonth(extras);
      const amount = this.parseAmount(extras);
      const profile = profileMap.get(record.customerCode);
      result.push({
        month,
        region: profile?.region ?? '',
        tier: profile?.tier ?? '',
        dealerType: profile?.dealerType ?? '',
        business: profile?.business ?? '',
        specification: this.normalizeString(extras['临期产品']),
        customerCode: record.customerCode,
        customerName: profile?.customerName || this.normalizeString(extras['客户-通路客户名称']) || record.customerCode,
        amount,
        sheetType: record.sheetType,
      });
    }
    return result;
  }

  private isExpiryRecord(record: ExpenseRecord): boolean {
    if (record.sheetType && String(record.sheetType).includes('临期')) {
      return true;
    }
    const keys = Object.keys(record.extras ?? {});
    return keys.some((k) => k.includes('临期') || k.includes('到期'));
  }

  private parseMonth(extras: Record<string, unknown>): string {
    const monthKeys = Object.keys(extras).filter(
      (k) => k.includes('年/月') || k.includes('月'),
    );
    for (const key of monthKeys) {
      const raw = String(extras[key] ?? '').trim();
      if (!raw) continue;
      const match = raw.match(/(\d{1,2})月\s*(\d{4})/);
      if (match) {
        const month = String(match[1]).padStart(2, '0');
        return `${match[2]}-${month}`;
      }
      const isoMatch = raw.match(/(\d{4})-(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}`;
      }
    }
    return '';
  }

  private parseAmount(extras: Record<string, unknown>): number {
    const amountKeys = Object.keys(extras).filter(
      (k) => k.includes('金额g') || k.includes('金额'),
    );
    for (const key of amountKeys) {
      const raw = extras[key];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
      if (!Number.isNaN(num)) {
        return num;
      }
    }
    return 0;
  }

  private normalizeString(value: unknown): string {
    if (value == null) return '';
    return String(value).trim();
  }

  applyFilters(
    records: ParsedExpiryRecord[],
    filters: ExpiryAnalysisFilters,
  ): ParsedExpiryRecord[] {
    return records.filter((r) => {
      if (filters.monthFrom && r.month && r.month < filters.monthFrom) return false;
      if (filters.monthTo && r.month && r.month > filters.monthTo) return false;
      if (filters.region?.length && !filters.region.includes(r.region)) return false;
      if (filters.tier?.length && !filters.tier.includes(r.tier)) return false;
      if (filters.dealerType?.length && !filters.dealerType.includes(r.dealerType)) return false;
      if (filters.business?.length && !filters.business.includes(r.business)) return false;
      if (filters.specification?.length && !filters.specification.includes(r.specification)) return false;
      return true;
    });
  }

  private aggregateTrend(records: ParsedExpiryRecord[]): ExpiryTrendItem[] {
    const map = new Map<string, { amount: number; recordCount: number; tier1Amount: number; tier2Amount: number }>();
    for (const r of records) {
      if (!r.month) continue;
      const cur = map.get(r.month) ?? { amount: 0, recordCount: 0, tier1Amount: 0, tier2Amount: 0 };
      cur.amount += r.amount;
      cur.recordCount += 1;
      if (r.tier === '一阶') cur.tier1Amount += r.amount;
      else if (r.tier === '二阶') cur.tier2Amount += r.amount;
      map.set(r.month, cur);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([month, v], index) => {
      const prev = index > 0 ? sorted[index - 1][1] : undefined;
      const momDifference = prev ? this.round(v.amount - prev.amount) : undefined;
      return {
        month,
        amount: this.round(v.amount),
        recordCount: v.recordCount,
        momDifference,
        tier1Amount: this.round(v.tier1Amount),
        tier2Amount: this.round(v.tier2Amount),
      };
    });
  }

  private analyzeLatestMonth(
    filtered: ParsedExpiryRecord[],
    fullTrend: ExpiryTrendItem[],
  ): { month: string; amount: number; prevMonth: string; prevAmount: number; difference: number; change: number } {
    const filteredMonths = Array.from(new Set(filtered.map((r) => r.month).filter(Boolean))).sort();
    if (filteredMonths.length === 0 || fullTrend.length < 2) {
      return { month: '', amount: 0, prevMonth: '', prevAmount: 0, difference: 0, change: 0 };
    }
    const latestMonth = filteredMonths[filteredMonths.length - 1];
    const latestIndex = fullTrend.findIndex((t) => t.month === latestMonth);
    if (latestIndex <= 0) {
      return { month: latestMonth, amount: fullTrend[latestIndex]?.amount ?? 0, prevMonth: '', prevAmount: 0, difference: 0, change: 0 };
    }
    const latest = fullTrend[latestIndex];
    const prev = fullTrend[latestIndex - 1];
    const difference = this.round(latest.amount - prev.amount);
    const change = prev.amount === 0 ? (latest.amount > 0 ? 100 : 0) : this.round(((latest.amount - prev.amount) / prev.amount) * 100);
    return {
      month: latest.month,
      amount: latest.amount,
      prevMonth: prev.month,
      prevAmount: prev.amount,
      difference,
      change,
    };
  }

  private computeOfficeStoreMom(
    allRecords: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
  ): ExpiryOfficeStoreMom[] {
    const filteredRegions = Array.from(new Set(filtered.map((r) => r.region).filter(Boolean)));
    if (filteredRegions.length === 0) return [];

    const allMonths = Array.from(new Set(allRecords.map((r) => r.month).filter(Boolean))).sort();
    if (allMonths.length === 0) return [];
    const prevMonth = allMonths.length > 1 ? allMonths[allMonths.length - 2] : undefined;

    const currentMap = new Map<string, Set<string>>();
    const prevMap = new Map<string, Set<string>>();

    for (const r of allRecords) {
      if (!r.region || !r.month || !r.customerCode) continue;
      if (r.month === allMonths[allMonths.length - 1]) {
        const set = currentMap.get(r.region) ?? new Set<string>();
        set.add(r.customerCode);
        currentMap.set(r.region, set);
      }
      if (prevMonth && r.month === prevMonth) {
        const set = prevMap.get(r.region) ?? new Set<string>();
        set.add(r.customerCode);
        prevMap.set(r.region, set);
      }
    }

    return filteredRegions
      .sort()
      .map((office) => {
        const current = currentMap.get(office)?.size ?? 0;
        const prev = prevMap.get(office)?.size ?? 0;
        let momChange = 0;
        if (prev === 0) {
          momChange = current > 0 ? 100 : 0;
        } else {
          momChange = this.round(((current - prev) / prev) * 100);
        }
        return { office, count: current, momChange };
      })
      .sort((a, b) => b.count - a.count || a.office.localeCompare(b.office));
  }

  private computeOfficeAmountMom(
    allRecords: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
  ): ExpiryOfficeAmountMom[] {
    const filteredRegions = Array.from(new Set(filtered.map((r) => r.region).filter(Boolean)));
    if (filteredRegions.length === 0) return [];

    const allMonths = Array.from(new Set(allRecords.map((r) => r.month).filter(Boolean))).sort();
    if (allMonths.length === 0) return [];
    const latestMonth = allMonths[allMonths.length - 1];
    const prevMonth = allMonths.length > 1 ? allMonths[allMonths.length - 2] : undefined;

    const officeMonthlyAmount = new Map<string, Map<string, number>>();
    for (const r of allRecords) {
      if (!r.region || !r.month) continue;
      const monthly = officeMonthlyAmount.get(r.region) ?? new Map<string, number>();
      monthly.set(r.month, (monthly.get(r.month) ?? 0) + r.amount);
      officeMonthlyAmount.set(r.region, monthly);
    }

    return filteredRegions
      .sort()
      .map((office) => {
        const monthly = officeMonthlyAmount.get(office);
        const current = monthly?.get(latestMonth) ?? 0;
        const prev = prevMonth ? (monthly?.get(prevMonth) ?? 0) : 0;
        let momChange = 0;
        if (prev === 0) {
          momChange = current > 0 ? 100 : 0;
        } else {
          momChange = this.round((current / prev - 1) * 100);
        }
        return { office, amount: current, momChange };
      })
      .sort((a, b) => b.amount - a.amount || a.office.localeCompare(b.office));
  }

  private computeTopOfficeMomChange(
    allRecords: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
    fullTrend: ExpiryTrendItem[],
  ): { office: string; change: number } {
    const filteredMonths = Array.from(new Set(filtered.map((r) => r.month).filter(Boolean))).sort();
    if (filteredMonths.length === 0) {
      return { office: '', change: 0 };
    }
    const latestMonth = filteredMonths[filteredMonths.length - 1];

    const officeMonthlyAmount = new Map<string, Map<string, number>>();
    for (const r of allRecords) {
      if (!r.region || !r.month) continue;
      const monthly = officeMonthlyAmount.get(r.region) ?? new Map<string, number>();
      monthly.set(r.month, (monthly.get(r.month) ?? 0) + r.amount);
      officeMonthlyAmount.set(r.region, monthly);
    }

    let topOffice = '';
    let topAmount = -1;
    for (const [office, monthly] of officeMonthlyAmount.entries()) {
      const amount = monthly.get(latestMonth) ?? 0;
      if (amount > topAmount) {
        topAmount = amount;
        topOffice = office;
      }
    }

    if (!topOffice) {
      return { office: '', change: 0 };
    }

    const latestIndex = fullTrend.findIndex((t) => t.month === latestMonth);
    const prevTrend = latestIndex > 0 ? fullTrend[latestIndex - 1] : undefined;
    const prevMonth = prevTrend?.month;
    const officeMonthly = officeMonthlyAmount.get(topOffice)!;
    const prevAmount = prevMonth ? (officeMonthly.get(prevMonth) ?? 0) : 0;
    const change = prevAmount === 0
      ? 0
      : this.round((topAmount / prevAmount - 1) * 100);

    return { office: topOffice, change };
  }

  private aggregateByDimension(
    records: ParsedExpiryRecord[],
    key: keyof Pick<
      ParsedExpiryRecord,
      'region' | 'tier' | 'dealerType' | 'business' | 'specification'
    >,
  ): ExpiryRankingItem[] {
    const map = new Map<string, { amount: number; recordCount: number }>();
    for (const r of records) {
      const value = r[key];
      if (!value) continue;
      const cur = map.get(value) ?? { amount: 0, recordCount: 0 };
      cur.amount += r.amount;
      cur.recordCount += 1;
      map.set(value, cur);
    }
    const total = Array.from(map.values()).reduce((sum, v) => sum + v.amount, 0) || 1;
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.amount - a.amount)
      .map(([value, v]) => ({
        dimension: key,
        value,
        amount: this.round(v.amount),
        recordCount: v.recordCount,
        share: this.round(v.amount / total),
      }));
  }

  private buildRankingExportSheet(
    records: ParsedExpiryRecord[],
    key: keyof Pick<
      ParsedExpiryRecord,
      'region' | 'tier' | 'dealerType' | 'business' | 'specification'
    >,
    rowHeader: string,
    offices: string[],
  ): ExpiryRankingExportSheet {
    const isRegionSheet = key === 'region';
    const rowMap = new Map<
      string,
      {
        total: { amount: number; recordCount: number };
        offices: Map<string, { amount: number; recordCount: number }>;
      }
    >();

    for (const r of records) {
      const dimensionValue = r[key];
      if (!dimensionValue) continue;
      if (!rowMap.has(dimensionValue)) {
        rowMap.set(dimensionValue, {
          total: { amount: 0, recordCount: 0 },
          offices: new Map(),
        });
      }
      const row = rowMap.get(dimensionValue)!;
      row.total.amount += r.amount;
      row.total.recordCount += 1;
      if (!isRegionSheet && r.region) {
        const officeData = row.offices.get(r.region) ?? { amount: 0, recordCount: 0 };
        officeData.amount += r.amount;
        officeData.recordCount += 1;
        row.offices.set(r.region, officeData);
      }
    }

    const grandTotal = Array.from(rowMap.values()).reduce((sum, row) => sum + row.total.amount, 0) || 1;

    const officeTotals = isRegionSheet
      ? new Map<string, number>()
      : new Map<string, number>(
          offices.map((office) => {
            const total = Array.from(rowMap.values()).reduce(
              (sum, row) => sum + (row.offices.get(office)?.amount ?? 0),
              0,
            );
            return [office, total] as const;
          }),
        );

    const rows: ExpiryRankingExportRow[] = Array.from(rowMap.entries())
      .sort(([, a], [, b]) => b.total.amount - a.total.amount)
      .map(([dimensionValue, row]) => {
        const rowOffices: Record<string, ExpiryRankingExportCell> = {};
        for (const office of offices) {
          const officeData = row.offices.get(office) ?? { amount: 0, recordCount: 0 };
          const officeTotal = officeTotals.get(office) ?? 1;
          rowOffices[office] = {
            amount: this.round(officeData.amount),
            share: this.round(officeData.amount / officeTotal),
            recordCount: officeData.recordCount,
          };
        }
        return {
          dimensionValue,
          total: {
            amount: this.round(row.total.amount),
            share: this.round(row.total.amount / grandTotal),
            recordCount: row.total.recordCount,
          },
          offices: rowOffices,
        };
      });

    return {
      sheetName: rowHeader,
      rowHeader,
      offices: isRegionSheet ? [] : offices,
      rows,
    };
  }

  private computeOfficeWindowRankings(
    parsed: ParsedExpiryRecord[],
    filtered: ParsedExpiryRecord[],
  ): { topCurrentMonthOffices: ExpiryOfficeRankingItem[]; topThreeMonthOffices: ExpiryOfficeRankingItem[] } {
    const filteredMonths = Array.from(new Set(filtered.map((r) => r.month).filter(Boolean))).sort();
    const anchorMonth =
      filteredMonths.length > 0 ? filteredMonths[filteredMonths.length - 1] : this.getLatestMonth(parsed);
    if (!anchorMonth) {
      return { topCurrentMonthOffices: [], topThreeMonthOffices: [] };
    }

    const currentMonthRecords = parsed.filter((r) => r.month === anchorMonth);
    const topCurrentMonthOffices = this.aggregateByOffice(currentMonthRecords).slice(0, 3);

    const startMonth = this.shiftMonth(anchorMonth, -2);
    const threeMonthRecords = parsed.filter((r) => r.month >= startMonth && r.month <= anchorMonth);
    const topThreeMonthOffices = this.aggregateByOffice(threeMonthRecords).slice(0, 3);

    return { topCurrentMonthOffices, topThreeMonthOffices };
  }

  private getLatestMonth(records: ParsedExpiryRecord[]): string {
    const months = records.map((r) => r.month).filter(Boolean);
    return months.sort().pop() ?? '';
  }

  private computeStoreOver500ByOffice(
    records: ParsedExpiryRecord[],
    threshold = 500,
  ): ExpiryStoreOver500Item[] {
    const months = Array.from(new Set(records.map((r) => r.month).filter(Boolean))).sort();
    if (months.length === 0) return [];
    const latestMonth = months[months.length - 1];
    const latestRecords = records.filter((r) => r.month === latestMonth);

    const officeStoreMap = new Map<string, Map<string, number>>();
    for (const r of latestRecords) {
      if (!r.region || !r.customerCode) continue;
      const storeMap = officeStoreMap.get(r.region) ?? new Map<string, number>();
      storeMap.set(r.customerCode, (storeMap.get(r.customerCode) ?? 0) + r.amount);
      officeStoreMap.set(r.region, storeMap);
    }

    const result: ExpiryStoreOver500Item[] = [];
    for (const [office, storeMap] of officeStoreMap.entries()) {
      const count = Array.from(storeMap.values()).filter((amount) => amount >= threshold).length;
      if (count > 0) {
        result.push({ office, count });
      }
    }
    return result.sort((a, b) => b.count - a.count);
  }

  private computeTopSpecifications(records: ParsedExpiryRecord[]): ExpiryTopSpecificationItem[] {
    const map = new Map<string, number>();
    for (const r of records) {
      if (!r.specification) continue;
      map.set(r.specification, (map.get(r.specification) ?? 0) + r.amount);
    }
    const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0) || 1;
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([specification, amount]) => ({
        specification,
        amount: this.round(amount),
        share: this.round(amount / total),
      }));
  }

  private shiftMonth(month: string, delta: number): string {
    const [year, mon] = month.split('-').map(Number);
    const date = new Date(year, mon - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private aggregateByOffice(records: ParsedExpiryRecord[]): ExpiryOfficeRankingItem[] {
    const map = new Map<string, number>();
    for (const r of records) {
      if (!r.region) continue;
      map.set(r.region, (map.get(r.region) ?? 0) + r.amount);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([office, amount]) => ({ office, amount: this.round(amount) }));
  }

  private generateWarnings(
    totalAmount: number,
    latestMonthAnalysis: { month: string; amount: number; prevMonth: string; prevAmount: number; difference: number; change: number },
    regionRank: ExpiryRankingItem[],
    dealerTypeRank: ExpiryRankingItem[],
    specificationRank: ExpiryRankingItem[],
  ): ExpiryWarningItem[] {
    const warnings: ExpiryWarningItem[] = [];

    if (totalAmount >= AMOUNT_THRESHOLD_HIGH) {
      warnings.push({
        id: 'total-amount-high',
        type: '总额预警',
        level: 'high',
        title: '临期费用总额过高',
        description: `临期费用总额达到 ¥${this.formatCurrency(totalAmount)}，超过高风险阈值。`,
        amount: this.round(totalAmount),
        suggestion: '建议加大促销清库力度，优先消化临期库存，并追溯近期临期费用上升原因。',
      });
    }

    if (latestMonthAnalysis.prevAmount > 0) {
      const change = latestMonthAnalysis.change / 100;
      const { month, prevMonth, amount } = latestMonthAnalysis;
      if (change >= MOM_THRESHOLD_HIGH) {
        warnings.push({
          id: 'mom-high',
          type: '环比预警',
          level: 'high',
          title: '临期费用环比大幅上升',
          description: `${month} 环比 ${prevMonth} 上升 ${(change * 100).toFixed(1)}%。`,
          amount: this.round(amount),
          suggestion: '建议立即召开临期专项清理会议，逐所/逐门店追溯上升原因并制定清库计划。',
        });
      } else if (change >= MOM_THRESHOLD_MEDIUM) {
        warnings.push({
          id: 'mom-medium',
          type: '环比预警',
          level: 'medium',
          title: '临期费用环比上升',
          description: `${month} 环比 ${prevMonth} 上升 ${(change * 100).toFixed(1)}%。`,
          amount: this.round(amount),
          suggestion: '建议关注重点区域与规格，提前安排促销活动。',
        });
      }
    }

    for (const item of regionRank) {
      if (item.share >= REGION_SHARE_THRESHOLD) {
        warnings.push({
          id: `region-concentration-${item.value}`,
          type: '区域集中',
          level: 'medium',
          title: `区域集中：${item.value}`,
          description: `${item.value} 临期费用占比 ${(item.share * 100).toFixed(1)}%。`,
          amount: item.amount,
          suggestion: `建议下沉至 ${item.value} 重点门店/客户追踪，快速定位高临期费用来源。`,
        });
      }
    }

    for (const item of dealerTypeRank) {
      if (item.share >= DEALER_TYPE_SHARE_THRESHOLD) {
        warnings.push({
          id: `dealer-type-concentration-${item.value}`,
          type: '形态集中',
          level: 'medium',
          title: `形态集中：${item.value}`,
          description: `${item.value} 临期费用占比 ${(item.share * 100).toFixed(1)}%。`,
          amount: item.amount,
          suggestion: `建议针对 ${item.value} 形态优化订货与库存管理策略。`,
        });
      }
    }

    for (const item of specificationRank) {
      if (item.share >= SPECIFICATION_SHARE_THRESHOLD) {
        warnings.push({
          id: `specification-concentration-${item.value}`,
          type: '规格集中',
          level: 'medium',
          title: `规格集中：${item.value}`,
          description: `${item.value} 临期费用占比 ${(item.share * 100).toFixed(1)}%。`,
          amount: item.amount,
          suggestion: `建议调整 ${item.value} 订货量或生产计划，减少未来临期风险。`,
        });
      }
    }

    return warnings.sort((a, b) => this.levelWeight(a.level) - this.levelWeight(b.level));
  }

  private levelWeight(level: ExpiryRiskLevel): number {
    return level === 'high' ? 0 : level === 'medium' ? 1 : 2;
  }

  private extractAvailableFilters(records: ParsedExpiryRecord[]) {
    const regions = new Set<string>();
    const tiers = new Set<string>();
    const dealerTypes = new Set<string>();
    const businesses = new Set<string>();
    const specifications = new Set<string>();
    const months = new Set<string>();
    for (const r of records) {
      if (r.region) regions.add(r.region);
      if (r.tier) tiers.add(r.tier);
      if (r.dealerType) dealerTypes.add(r.dealerType);
      if (r.business) businesses.add(r.business);
      if (r.specification) specifications.add(r.specification);
      if (r.month) months.add(r.month);
    }
    return {
      regions: Array.from(regions).sort(),
      tiers: Array.from(tiers).sort(),
      dealerTypes: Array.from(dealerTypes).sort(),
      businesses: Array.from(businesses).sort(),
      specifications: Array.from(specifications).sort(),
      months: Array.from(months).sort(),
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundPct(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
}
