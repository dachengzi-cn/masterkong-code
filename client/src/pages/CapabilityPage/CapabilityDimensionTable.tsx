import React from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { CapabilityScoreResult } from '@shared/api.interface';
import {
  CAPABILITY_SCORE_LEVEL_COLORS,
  CAPABILITY_SCORE_LEVEL_LABELS,
} from './capability.constants';
import {
  formatDelta,
  formatRawValue,
  formatScore,
  levelBadgeClass,
  levelColor,
} from './capability.utils';

interface CapabilityDimensionTableProps {
  score: CapabilityScoreResult | null;
  loading?: boolean;
}

const CapabilityDimensionTable: React.FC<CapabilityDimensionTableProps> = ({
  score,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const rows = score?.scores ?? [];

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4">维度得分明细</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[24%]">维度</TableHead>
            <TableHead className="text-right">得分</TableHead>
            <TableHead className="text-center">能力等级</TableHead>
            <TableHead className="text-right">原始值</TableHead>
            <TableHead className="text-right">权重</TableHead>
            <TableHead className="text-right">环比</TableHead>
            <TableHead className="text-right">同比</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                暂无评估数据，请确认筛选条件后重新评估
              </TableCell>
            </TableRow>
          )}
          {rows.map((s) => {
            const color = levelColor(s.level);
            const mom = s.compare?.mom;
            const yoy = s.compare?.yoy;
            return (
              <TableRow key={s.key}>
                <TableCell className="font-medium text-foreground">
                  {s.name}
                </TableCell>
                <TableCell
                  className="text-right font-mono tabular-nums"
                  style={{ color }}
                >
                  {formatScore(s.score)}
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={`${levelBadgeClass(s.level)} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium`}
                    style={{ color }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ backgroundColor: color }}
                    />
                    {CAPABILITY_SCORE_LEVEL_LABELS[s.level]}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatRawValue(s)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {(s.weight * 100).toFixed(0)}%
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${
                    mom != null && mom > 0
                      ? 'text-[hsl(152,60%,42%)]'
                      : mom != null && mom < 0
                        ? 'text-[hsl(4,72%,52%)]'
                        : 'text-muted-foreground'
                  }`}
                >
                  {mom != null ? (mom === 0 ? '0.0' : formatDelta(mom)) : '—'}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${
                    yoy != null && yoy > 0
                      ? 'text-[hsl(152,60%,42%)]'
                      : yoy != null && yoy < 0
                        ? 'text-[hsl(4,72%,52%)]'
                        : 'text-muted-foreground'
                  }`}
                >
                  {yoy != null ? (yoy === 0 ? '0.0' : formatDelta(yoy)) : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default CapabilityDimensionTable;
