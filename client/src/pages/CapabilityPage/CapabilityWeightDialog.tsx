import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import type {
  CapabilityDimensionMeta,
  CapabilityDimensionUpdateRequest,
} from '@shared/api.interface';
import { CAPABILITY_WEIGHT_HINT } from './capability.constants';

interface CapabilityWeightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensions: CapabilityDimensionMeta[];
  onSave: (body: CapabilityDimensionUpdateRequest) => Promise<void>;
}

interface EditableRow {
  key: string;
  name: string;
  enabled: boolean;
  weight: number; // 0~1
  thresholdHigh: number;
  thresholdLow: number;
}

const CapabilityWeightDialog: React.FC<CapabilityWeightDialogProps> = ({
  open,
  onOpenChange,
  dimensions,
  onSave,
}) => {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(
        dimensions.map((d) => ({
          key: d.key,
          name: d.name,
          enabled: d.enabled,
          weight: d.weight,
          thresholdHigh: d.thresholdHigh,
          thresholdLow: d.thresholdLow,
        })),
      );
    }
  }, [open, dimensions]);

  const weightSum = useMemo(
    () => rows.reduce((sum, r) => sum + (r.enabled ? r.weight : 0), 0),
    [rows],
  );
  const weightSumPct = Math.round(weightSum * 10000) / 100;
  const weightValid = Math.abs(weightSum - 1) < 0.001;

  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    if (!weightValid) {
      toast.warning(`权重总和须为 100%，当前 ${weightSumPct}%`);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        dimensions: rows.map((r) => ({
          key: r.key,
          enabled: r.enabled,
          weight: r.weight,
          thresholdHigh: r.thresholdHigh,
          thresholdLow: r.thresholdLow,
        })),
      });
      toast.success('维度配置已保存');
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>评估维度与权重设置</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">{CAPABILITY_WEIGHT_HINT}</p>

        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-3 rounded-sm border border-border p-3"
            >
              <div className="flex items-center gap-2 w-32 shrink-0">
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => updateRow(r.key, { enabled: v })}
                />
                <span className={`text-sm ${r.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {r.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">权重</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!r.enabled}
                  value={Math.round(r.weight * 10000) / 100}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateRow(r.key, { weight: Number.isFinite(v) ? v / 100 : 0 });
                  }}
                  className="h-8 w-20 text-right font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">优势线</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={r.thresholdHigh}
                  onChange={(e) =>
                    updateRow(r.key, { thresholdHigh: Number(e.target.value) || 0 })
                  }
                  className="h-8 w-16 text-right font-mono tabular-nums"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground shrink-0">短板线</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={r.thresholdLow}
                  onChange={(e) =>
                    updateRow(r.key, { thresholdLow: Number(e.target.value) || 0 })
                  }
                  className="h-8 w-16 text-right font-mono tabular-nums"
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className={`flex items-center justify-between rounded-sm border p-3 text-sm ${
            weightValid ? 'border-border bg-accent/20' : 'border-[hsl(4,72%,52%)]/40 bg-[hsl(4,72%,52%)]/10'
          }`}
        >
          <span className="text-muted-foreground">启用维度权重合计</span>
          <span
            className={`font-mono tabular-nums font-semibold ${
              weightValid ? 'text-foreground' : 'text-[hsl(4,72%,52%)]'
            }`}
          >
            {weightSumPct}%
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || !weightValid}>
            {saving ? '保存中…' : '保存配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CapabilityWeightDialog;
