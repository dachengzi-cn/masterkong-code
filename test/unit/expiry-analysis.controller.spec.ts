/// <reference types="jest" />
import { ExpenseProfileController } from '../../server/modules/expense-profile/expense-profile.controller';
import type { ExpiryAnalysisService } from '../../server/modules/expense-profile/expiry-analysis.service';
import type { ExpenseProfileService } from '../../server/modules/expense-profile/expense-profile.service';
import type { ExpiryAnalysisResult, ExpiryDrilldownResult, ExpiryRankingExportResult } from '@shared/api.interface';

describe('ExpenseProfileController.getExpiryAnalysis (integration)', () => {
  const baseResult: ExpiryAnalysisResult = {
    kpis: {
      totalAmount: 5000,
      monthOverMonthChange: 10,
      involvedStoreCount: 1,
      storeOver500ByOffice: [],
      topSpecifications: [],
      officeStoreMom: [],
      officeAmountMom: [],
    },
    trend: [],
    regionRank: [],
    tierRank: [],
    dealerTypeRank: [],
    businessRank: [],
    specificationRank: [],
    warnings: [],
    topCurrentMonthOffices: [],
    topThreeMonthOffices: [],
    availableFilters: {
      regions: [],
      tiers: [],
      dealerTypes: [],
      businesses: [],
      specifications: [],
      months: [],
    },
  };

  it('应将查询参数正确转换为筛选条件并调用分析服务', async () => {
    const analyzeMock = jest.fn().mockResolvedValue(baseResult);
    const expiryService = { analyze: analyzeMock } as unknown as ExpiryAnalysisService;
    const expenseService = {} as ExpenseProfileService;
    const controller = new ExpenseProfileController(expenseService, expiryService);

    const result = await controller.getExpiryAnalysis(
      '2026-06',
      '2026-07',
      '宝山城区所,嘉定城区所',
      '一阶',
      'CA',
      '张三',
      'BIG桶',
    );

    expect(analyzeMock).toHaveBeenCalledWith({
      monthFrom: '2026-06',
      monthTo: '2026-07',
      region: ['宝山城区所', '嘉定城区所'],
      tier: ['一阶'],
      dealerType: ['CA'],
      business: ['张三'],
      specification: ['BIG桶'],
    });
    expect(result.kpis.totalAmount).toBe(5000);
  });

  it('空查询参数时应传入空筛选条件', async () => {
    const analyzeMock = jest.fn().mockResolvedValue({
      ...baseResult,
      kpis: {
        totalAmount: 0,
        monthOverMonthChange: 0,
        involvedStoreCount: 0,
        storeOver500ByOffice: [],
        topSpecifications: [],
        officeStoreMom: [],
        officeAmountMom: [],
      },
    } as ExpiryAnalysisResult);

    const expiryService = { analyze: analyzeMock } as unknown as ExpiryAnalysisService;
    const expenseService = {} as ExpenseProfileService;
    const controller = new ExpenseProfileController(expenseService, expiryService);

    await controller.getExpiryAnalysis();
    expect(analyzeMock).toHaveBeenCalledWith({
      monthFrom: undefined,
      monthTo: undefined,
      region: undefined,
      tier: undefined,
      dealerType: undefined,
      business: undefined,
      specification: undefined,
    });
  });
});

describe('ExpenseProfileController.getExpiryDrilldown (integration)', () => {
  const drilldownResult: ExpiryDrilldownResult = {
    months: ['2026-06', '2026-05'],
    storeOver500Monthly: [],
    over500StoreSpecShare: [],
    officeMonthlySpecShare: [],
  };

  it('应将查询参数正确转换为筛选条件并调用下钻服务', async () => {
    const getDrilldownMock = jest.fn().mockResolvedValue(drilldownResult);
    const expiryService = { getDrilldown: getDrilldownMock } as unknown as ExpiryAnalysisService;
    const expenseService = {} as ExpenseProfileService;
    const controller = new ExpenseProfileController(expenseService, expiryService);

    const result = await controller.getExpiryDrilldown(
      '2026-05',
      '2026-06',
      '宝山城区所',
      '一阶',
      'CA',
      '张三',
      'BIG桶',
    );

    expect(getDrilldownMock).toHaveBeenCalledWith({
      monthFrom: '2026-05',
      monthTo: '2026-06',
      region: ['宝山城区所'],
      tier: ['一阶'],
      dealerType: ['CA'],
      business: ['张三'],
      specification: ['BIG桶'],
    });
    expect(result.months).toEqual(['2026-06', '2026-05']);
  });
});

describe('ExpenseProfileController.getExpiryRankingExport (integration)', () => {
  const exportResult: ExpiryRankingExportResult = {
    region: { sheetName: '所别', rowHeader: '所别', offices: [], rows: [] },
    tier: { sheetName: '阶层', rowHeader: '阶层', offices: ['宝山城区所'], rows: [] },
    dealerType: { sheetName: '形态', rowHeader: '形态', offices: [], rows: [] },
    business: { sheetName: '业务', rowHeader: '业务', offices: [], rows: [] },
    specification: { sheetName: '规格', rowHeader: '规格', offices: [], rows: [] },
  };

  it('应将查询参数正确转换为筛选条件并调用排行导出服务', async () => {
    const getRankingExportMock = jest.fn().mockResolvedValue(exportResult);
    const expiryService = { getRankingExport: getRankingExportMock } as unknown as ExpiryAnalysisService;
    const expenseService = {} as ExpenseProfileService;
    const controller = new ExpenseProfileController(expenseService, expiryService);

    const result = await controller.getExpiryRankingExport(
      '2026-05',
      '2026-06',
      '宝山城区所',
      '一阶',
      'CA',
      '张三',
      'BIG桶',
    );

    expect(getRankingExportMock).toHaveBeenCalledWith({
      monthFrom: '2026-05',
      monthTo: '2026-06',
      region: ['宝山城区所'],
      tier: ['一阶'],
      dealerType: ['CA'],
      business: ['张三'],
      specification: ['BIG桶'],
    });
    expect(result.tier.offices).toEqual(['宝山城区所']);
  });
});
