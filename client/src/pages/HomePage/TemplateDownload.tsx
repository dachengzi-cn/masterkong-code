
import { Button } from '@/components/ui/button';
import type { SheetType } from '@shared/api.interface';
import { SHEET_TYPES } from '@shared/api.interface';

const TEMPLATE_FIELDS = [
  { name: '订单-订单日期', type: 'date' as const },
  { name: '组织-营业所', type: 'text' as const },
  { name: '人员-业代', type: 'text' as const },
  { name: '客户-通路客户编码', type: 'text' as const },
  { name: '客户-客户形态', type: 'text' as const },
  { name: '品牌', type: 'text' as const },
  { name: '产品-规格', type: 'text' as const },
  { name: '订单数量-不含促销', type: 'number' as const },
];

const SAMPLE_DATA: Record<SheetType, Array<Array<string | number>>> = {
  '一阶订单': [
    ['2026.06.13', '宝山城区所', '曹杨杨23418509', 'KH127305360A', 'CA', '非西南泡椒', 'BIG桶', 2],
    ['2026.06.13', '徐汇城区所', '陈杰10442087', '1201/1170632', '批市士多批', '红烧品牌', '经典袋', 5],
  ],
  '二阶订单': [
    ['2026.06.13', '普静城区所', '周浩10432574', '1201/1167324001', '单点士多批', '酸菜品牌', 'BIG桶', 3],
    ['2026.06.13', '松江城区所', '燕筱景10426560', 'KH0P311020418', 'MA4', '红烧品牌', '5连包', 8],
  ],
  '一阶回单': [
    ['2026.06.13', '宝山城区所', '曹杨杨23418509', 'KH127305360A', 'CA', '红烧品牌', 'BIG桶', 4],
    ['2026.06.13', '徐汇城区所', '陈杰10442087', '1201/1170632', '批市士多批', '非西南泡椒', '经典袋', 6],
  ],
  '二阶回单': [
    ['2026.06.13', '普静城区所', '周浩10432574', '1201/1167324001', '单点士多批', '红烧品牌', 'BIG桶', 2],
    ['2026.06.13', '嘉定城区所', '韩东奎10437090', 'KH0P46982545', 'CB2', '酸菜品牌', '经典袋', 7],
  ],
};

const COL_WIDTHS = [
  { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 20 },
  { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 18 },
];

export async function downloadTemplate() {
  const XLSX = await import('xlsx-js-style');
  const headers = TEMPLATE_FIELDS.map((f) => f.name);
  const wb = XLSX.utils.book_new();

  for (const sheetName of SHEET_TYPES) {
    const rows = SAMPLE_DATA[sheetName];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, '销售订单数据模板.xlsx');
}

export const DownloadTemplateButton: React.FC<{ size?: 'sm' | 'default' }> = ({ size = 'sm' }) => (
  <Button variant="outline" size={size} onClick={downloadTemplate}>
    <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬇️</span>
    下载模板
  </Button>
);

const TemplateDownload: React.FC = () => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-sm bg-accent">
          <span className="inline-flex items-center justify-center text-base leading-none text-primary" >📑</span>
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">
            销售订单数据上传模板
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {TEMPLATE_FIELDS.length} 个字段 · {SHEET_TYPES.length} 个工作表
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-sm bg-accent/50 p-3">
        <p className="text-xs text-muted-foreground">
          填写说明：模板包含 {SHEET_TYPES.join('、')} 四个工作表。
          订单日期格式为 YYYY.MM.DD，组织/人员/客户/品牌/规格为文本，订单数量为数值。
          首行为表头，请勿修改。
        </p>
      </div>
    </div>
  );
};

export default TemplateDownload;
