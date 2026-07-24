export const DEALER_TYPE_TO_COMPOSITE: Record<string, string> = {
  'CA': 'CA',
  'CB': 'CB',
  'MA': 'MA',
  '餐饮': '特通',
  '厂矿': '特通',
  '大学校园': '特通',
  '电竞酒店': '特通',
  '火车站': '特通',
  '机构': '特通',
  '经济酒店': '特通',
  '景点': '特通',
  '零食': '特通',
  '棋牌室': '特通',
  '汽车站': '特通',
  '前置仓': '特通',
  '网吧': '特通',
  '休闲/运动': '特通',
  '医院': '特通',
  '桌球厅': '特通',
  '自售': '自售',
  '机构办公批': '特通批',
  '餐饮批': '特通批',
  '工地批': '特通批',
  '核心城区TT特通': '特通批',
  '即时零售批': '特通批',
  '综合特通批': '特通批',
  '厂矿批': '特通批',
  '休闲娱乐批': '特通批',
  '交通站点批': '特通批',
  '学校批': '特通批',
  '景点乐园批': '特通批',
  '酒店批': '特通批',
  '批市士多批': '批市批',
  'VM批': 'VM批',
  '单点士多批': '单点批',
  'E批发': 'E批发',
};

export const ALL_COMPOSITE_FORMATS = ['CA', 'CB', 'MA', '特通', '自售', '特通批', '批市批', 'VM批', '单点批', 'E批发'];

export function getCompositeFormatsForDealerTypes(dealerTypes: string[]): string[] {
  const set = new Set<string>();
  for (const dt of dealerTypes) {
    const cf = DEALER_TYPE_TO_COMPOSITE[dt];
    if (cf) set.add(cf);
  }
  return ALL_COMPOSITE_FORMATS.filter((f: string) => set.has(f));
}

export function getDealerTypesForCompositeFormats(compositeFormats: string[]): string[] {
  const result: string[] = [];
  const cfSet = new Set(compositeFormats);
  for (const [dt, cf] of Object.entries(DEALER_TYPE_TO_COMPOSITE)) {
    if (cfSet.has(cf)) result.push(dt);
  }
  return result;
}
