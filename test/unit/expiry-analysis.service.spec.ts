/// <reference types="jest" />
import { ExpiryAnalysisService } from '../../server/modules/expense-profile/expiry-analysis.service';
import { ExpenseProfileService } from '../../server/modules/expense-profile/expense-profile.service';
import { CustomerProfileService } from '../../server/modules/customer-profile/customer-profile.service';
import type { ExpenseRecord, CustomerProfile } from '@shared/api.interface';

describe('ExpiryAnalysisService', () => {
  let expenseService: ExpenseProfileService;
  let customerService: CustomerProfileService;
  let analysisService: ExpiryAnalysisService;

  beforeEach(() => {
    expenseService = new ExpenseProfileService({} as never);
    customerService = new CustomerProfileService({} as never);
    // 强制使用内存存储，避免依赖数据库
    (expenseService as unknown as { useMemoryStorage: boolean }).useMemoryStorage = true;
    (customerService as unknown as { useMemoryStorage: boolean }).useMemoryStorage = true;
    analysisService = new ExpiryAnalysisService(expenseService, customerService);
  });

  function seedExpenses(records: ExpenseRecord[]) {
    return expenseService.upsertBatch(records, 'test-user', true);
  }

  function seedCustomers(customers: CustomerProfile[]) {
    return customerService.upsertBatch(customers, 'test-user');
  }

  it('应识别 sheetType 含临期的记录', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 1000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '客户销额',
        extras: { '日历年/月': '6月 2026', '回单金额': 500 },
      },
    ]);
    const result = await analysisService.analyze({});
    expect(result.kpis.totalAmount).toBe(1000);
  });

  it('应正确解析月份并聚合趋势', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '5月 2026',
          '临期处理费金额g': 1000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 2000,
        },
      },
    ]);
    const result = await analysisService.analyze({});
    expect(result.trend).toHaveLength(2);
    expect(result.trend[0].month).toBe('2026-05');
    expect(result.trend[1].month).toBe('2026-06');
    expect(result.kpis.monthOverMonthChange).toBe(100);
  });

  it('趋势图应保留全部月份并计算环比差额', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '5月 2026',
          '临期处理费金额g': 1000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 2000,
        },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-06', monthTo: '2026-06' });
    expect(result.trend).toHaveLength(2);
    expect(result.trend[0].momDifference).toBeUndefined();
    expect(result.trend[1].momDifference).toBe(1000);
    expect(result.kpis.involvedStoreCount).toBe(1);
  });

  it('KPI环比应基于筛选最新月份及其前月', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '4月 2026',
          '临期处理费金额g': 1000,
        },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '5月 2026',
          '临期处理费金额g': 1500,
        },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 3000,
        },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-06', monthTo: '2026-06' });
    expect(result.kpis.monthOverMonthChange).toBe(100);
    expect(result.kpis.totalAmount).toBe(3000);
  });

  it('区间环比应对比等长上一期总金额', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      // 3-4 月合计 407201
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '3月 2026', '临期处理费金额g': 200000 },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '4月 2026', '临期处理费金额g': 207201 },
      },
      // 5-6 月合计 364640.5
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '5月 2026', '临期处理费金额g': 150000 },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 214640.5 },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-05', monthTo: '2026-06' });
    expect(result.kpis.totalAmount).toBe(364640.5);
    expect(result.kpis.monthOverMonthChange).toBe(-10.5);
  });

  it('应返回当月与近3个月所别金额TOP3', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
      { customerCode: 'C003', customerName: '客户3', region: '青浦城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      // 4月
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '4月 2026', '临期处理费金额g': 1000 },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: { '日历年/月': '4月 2026', '临期处理费金额g': 2000 },
      },
      // 5月
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '5月 2026', '临期处理费金额g': 3000 },
      },
      {
        customerCode: 'C003',
        customerName: '客户3',
        sheetType: '临期所别',
        extras: { '日历年/月': '5月 2026', '临期处理费金额g': 5000 },
      },
      // 6月
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 4000 },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 2500 },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-06', monthTo: '2026-06' });

    // 当月 TOP3：宝山 4000、嘉定 2500、青浦 0（无记录）
    expect(result.topCurrentMonthOffices).toHaveLength(2);
    expect(result.topCurrentMonthOffices[0].office).toBe('宝山城区所');
    expect(result.topCurrentMonthOffices[0].amount).toBe(4000);

    // 近3个月 TOP3：宝山 8000、青浦 5000、嘉定 4500
    expect(result.topThreeMonthOffices).toHaveLength(3);
    expect(result.topThreeMonthOffices[0].office).toBe('宝山城区所');
    expect(result.topThreeMonthOffices[0].amount).toBe(8000);
    expect(result.topThreeMonthOffices[1].office).toBe('青浦城区所');
    expect(result.topThreeMonthOffices[1].amount).toBe(5000);
    expect(result.topThreeMonthOffices[2].office).toBe('嘉定城区所');
    expect(result.topThreeMonthOffices[2].amount).toBe(4500);
  });

  it('应按所别统计单店当月合计≥500元的门店数', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C003', customerName: '客户3', region: '嘉定城区所', tier: '一阶', extras: {} },
      { customerCode: 'C004', customerName: '客户4', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      // 宝山城区所：客户1 600达标，客户2 300不达标
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 600 },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 300 },
      },
      // 嘉定城区所：客户3 500达标，客户4 500达标
      {
        customerCode: 'C003',
        customerName: '客户3',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 500 },
      },
      {
        customerCode: 'C004',
        customerName: '客户4',
        sheetType: '临期所别',
        extras: { '日历年/月': '6月 2026', '临期处理费金额g': 500 },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-06', monthTo: '2026-06' });

    expect(result.kpis.storeOver500ByOffice).toHaveLength(2);
    expect(result.kpis.storeOver500ByOffice[0]).toEqual({ office: '嘉定城区所', count: 2 });
    expect(result.kpis.storeOver500ByOffice[1]).toEqual({ office: '宝山城区所', count: 1 });
  });

  it('应返回规格TOP5及金额占比', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期产品': '规格A',
          '临期处理费金额g': 4000,
        },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期产品': '规格B',
          '临期处理费金额g': 3000,
        },
      },
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期产品': '规格C',
          '临期处理费金额g': 3000,
        },
      },
    ]);
    const result = await analysisService.analyze({ monthFrom: '2026-06', monthTo: '2026-06' });

    expect(result.kpis.topSpecifications).toHaveLength(3);
    expect(result.kpis.topSpecifications[0]).toEqual({
      specification: '规格A',
      amount: 4000,
      share: 0.4,
    });
    expect(result.kpis.topSpecifications[1]).toEqual({
      specification: '规格B',
      amount: 3000,
      share: 0.3,
    });
    expect(result.kpis.topSpecifications[2]).toEqual({
      specification: '规格C',
      amount: 3000,
      share: 0.3,
    });
  });

  it('应按所别维度聚合排行', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 3000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 1000,
        },
      },
    ]);
    const result = await analysisService.analyze({});
    expect(result.regionRank).toHaveLength(2);
    expect(result.regionRank[0].value).toBe('宝山城区所');
    expect(result.regionRank[0].share).toBe(0.75);
  });

  it('应按筛选条件过滤数据', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 1000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 2000,
        },
      },
    ]);
    const result = await analysisService.analyze({ region: ['宝山城区所'] });
    expect(result.kpis.totalAmount).toBe(1000);
    expect(result.regionRank).toHaveLength(1);
  });

  it('应从客户资料中解析阶层、客户形态与业务', async () => {
    await seedCustomers([
      {
        customerCode: 'C001',
        customerName: '客户1',
        region: '宝山城区所',
        tier: '一阶',
        extras: { '经销商类型': 'CA1', '客户经理': '张三' },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        region: '嘉定城区所',
        tier: '二阶',
        extras: { '经销商类型': 'CB0', '客户经理': '李四' },
      },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 4000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 1000,
        },
      },
    ]);
    const result = await analysisService.analyze({});
    expect(result.tierRank).toHaveLength(2);
    expect(result.tierRank[0].value).toBe('一阶');
    expect(result.dealerTypeRank[0].value).toBe('CA');
    expect(result.businessRank).toHaveLength(2);
    expect(result.businessRank[0].value).toBe('张三');
  });

  it('应在总额超过阈值时生成高风险预警', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 60_000,
        },
      },
    ]);
    const result = await analysisService.analyze({});
    const high = result.warnings.find((w) => w.level === 'high');
    expect(high).toBeDefined();
    expect(high?.type).toBe('总额预警');
  });

  it('应在所别集中时生成中风险预警及建议', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
      { customerCode: 'C002', customerName: '客户2', region: '嘉定城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 8000,
        },
      },
      {
        customerCode: 'C002',
        customerName: '客户2',
        sheetType: '临期形态',
        extras: {
          '日历年/月': '6月 2026',
          '临期处理费金额g': 2000,
        },
      },
    ]);
    const result = await analysisService.analyze({});
    const regionWarning = result.warnings.find((w) => w.type === '区域集中');
    expect(regionWarning).toBeDefined();
    expect(regionWarning?.level).toBe('medium');
    expect(regionWarning?.suggestion).toContain('下沉');
  });

  it('空数据时应返回零值结果', async () => {
    await seedExpenses([]);
    const result = await analysisService.analyze({});
    expect(result.kpis.totalAmount).toBe(0);
    expect(result.kpis.involvedStoreCount).toBe(0);
    expect(result.kpis.storeOver500ByOffice).toHaveLength(0);
    expect(result.kpis.topSpecifications).toHaveLength(0);
    expect(result.trend).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('应容错处理缺失金额字段', async () => {
    await seedCustomers([
      { customerCode: 'C001', customerName: '客户1', region: '宝山城区所', tier: '一阶', extras: {} },
    ]);
    await seedExpenses([
      {
        customerCode: 'C001',
        customerName: '客户1',
        sheetType: '临期所别',
        extras: {
          '日历年/月': '6月 2026',
        },
      },
    ]);
    const result = await analysisService.analyze({});
    expect(result.kpis.totalAmount).toBe(0);
    expect(result.kpis.involvedStoreCount).toBe(1);
  });
});
