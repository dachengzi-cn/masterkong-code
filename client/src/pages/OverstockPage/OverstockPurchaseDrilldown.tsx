import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { OverstockPurchaseDrilldown as DrilldownData } from '@shared/api.interface';
import { formatCurrency, formatPercent } from '../ExpensePage/expense-overview.utils';

interface OverstockPurchaseDrilldownProps {
  data: DrilldownData | null;
  onClose: () => void;
}

const MAX_ROWS = 200;

/**
 * 「总进货金额」下钻面板。
 *
 * 下钻口径：筛选月（临期发生月 M）的临期品项，在往前偏移 4 / 5 个月
 * （即 M-4、M-5）的进货金额明细。
 * 例：筛选 7 月 → 分别展示这些临期品项在 3 月与 2 月的进货金额明细。
 */
const OverstockPurchaseDrilldown: React.FC<OverstockPurchaseDrilldownProps> = ({
  data,
  onClose,
}) => {
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const groupKey = (g: (typeof groups)[number]) =>
    `${g.expiryMonth}\t${g.purchaseMonth}\t${g.offset}`;

  const activeGroup = useMemo(() => {
    if (!groups.length) return null;
    const found = groups.find((g) => groupKey(g) === activeKey);
    return found ?? groups[0];
  }, [groups, activeKey]);

  const total = data?.totalPurchaseAmount ?? 0;

  return (
    <div className="bg-card border border-border rounded-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-foreground">总进货金额 · 数据下钻</div>
          <div className="text-xs text-muted-foreground mt-1">
            筛选月临期品项在往前偏移 4 / 5 个月的进货金额明细
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onClose}>
          收起
        </Button>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">合计</span>
        <span className="text-xl font-medium font-['Roboto_Mono',monospace] tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          当前筛选条件下无进货明细数据
        </div>
      ) : (
        <>
          {/* 按「临期月 → 进货月」分组汇总 */}
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-accent/30 border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">临期月</th>
                  <th className="px-2 py-2 text-left font-medium">进货月</th>
                  <th className="px-2 py-2 text-left font-medium">偏移</th>
                  <th className="px-2 py-2 text-right font-medium">门店数</th>
                  <th className="px-2 py-2 text-right font-medium">明细条数</th>
                  <th className="px-2 py-2 text-right font-medium">进货金额</th>
                  <th className="px-2 py-2 text-right font-medium">进货数量</th>
                  <th className="px-2 py-2 text-right font-medium">临期金额</th>
                  <th className="px-2 py-2 text-right font-medium">转化率</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const key = groupKey(g);
                  const isActive = activeGroup ? groupKey(activeGroup) === key : false;
                  const rate = g.purchaseAmount > 0 ? g.expiryAmount / g.purchaseAmount : 0;
                  return (
                    <tr
                      key={key}
                      onClick={() => setActiveKey(key)}
                      className={`border-b border-border last:border-0 cursor-pointer transition-colors duration-150 ease-out ${
                        isActive ? 'bg-accent/40' : 'hover:bg-accent/20'
                      }`}
                    >
                      <td className="px-2 py-2 font-mono tabular-nums">{g.expiryMonth}</td>
                      <td className="px-2 py-2 font-mono tabular-nums">{g.purchaseMonth}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground">
                          -{g.offset} 个月
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{g.storeCount}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{g.itemCount}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(g.purchaseAmount)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {g.purchaseQuantity.toLocaleString('zh-CN')}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                        {formatCurrency(g.expiryAmount)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatPercent(rate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/60">
                  <td className="px-2 py-2 font-medium" colSpan={5}>
                    合计
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(total)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                    {data?.totalPurchaseQuantity.toLocaleString('zh-CN') ?? '0'}
                  </td>
                  <td className="px-2 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 选中分组的门店 / 规格级明细 */}
          {activeGroup && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                {activeGroup.expiryMonth} 临期品项 · 在 {activeGroup.purchaseMonth}（-
                {activeGroup.offset} 个月）的进货明细
                {activeGroup.items.length > MAX_ROWS
                  ? `（共 ${activeGroup.items.length} 条，按金额展示前 ${MAX_ROWS} 条）`
                  : `（共 ${activeGroup.items.length} 条）`}
              </div>
              <div className="overflow-x-auto rounded-sm border border-border max-h-[360px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="bg-accent/30 border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">门店编码</th>
                      <th className="px-2 py-2 text-left font-medium">门店名称</th>
                      <th className="px-2 py-2 text-left font-medium">所别</th>
                      <th className="px-2 py-2 text-left font-medium">业代</th>
                      <th className="px-2 py-2 text-left font-medium">规格</th>
                      <th className="px-2 py-2 text-left font-medium">进货月</th>
                      <th className="px-2 py-2 text-right font-medium">进货金额</th>
                      <th className="px-2 py-2 text-right font-medium">进货数量</th>
                      <th className="px-2 py-2 text-right font-medium">临期金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup.items.slice(0, MAX_ROWS).map((row, idx) => (
                      <tr
                        key={`${row.customerCode}-${row.specification}-${row.purchaseMonth}-${idx}`}
                        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                      >
                        <td className="px-2 py-2 font-mono tabular-nums">{row.customerCode}</td>
                        <td className="px-2 py-2 truncate max-w-[140px]" title={row.customerName}>
                          {row.customerName}
                        </td>
                        <td className="px-2 py-2">{row.region}</td>
                        <td className="px-2 py-2">{row.salesRep}</td>
                        <td className="px-2 py-2 truncate max-w-[200px]" title={row.specification}>
                          {row.specification}
                        </td>
                        <td className="px-2 py-2 font-mono tabular-nums">{row.purchaseMonth}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(row.purchaseAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {row.purchaseQuantity.toLocaleString('zh-CN')}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-[hsl(217,85%,52%)]">
                          {formatCurrency(row.expiryAmount)}
                        </td>
                      </tr>
                    ))}
                    {activeGroup.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-2 py-8 text-center text-xs text-muted-foreground"
                        >
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OverstockPurchaseDrilldown;
