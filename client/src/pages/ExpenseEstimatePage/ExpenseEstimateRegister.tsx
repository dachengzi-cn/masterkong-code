import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import FilterBar from '@/components/business-ui/filter-bar';
import { expenseEstimateApi } from '@client/src/api/index';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  ExpenseEstimateOptions,
  ExpenseEstimateRecord,
  ExpenseEstimateListResponse,
} from '@shared/api.interface';
import { formatMoney, getCurrentMonth } from './expense-estimate.utils';

interface FormState {
  month: string;
  region: string;
  department: string;
  activityName: string;
  expenseSubject: string;
  estimatedAmount: string;
  actualAmount: string;
  remark: string;
}

const emptyForm: FormState = {
  month: getCurrentMonth(),
  region: '',
  department: '',
  activityName: '',
  expenseSubject: '',
  estimatedAmount: '',
  actualAmount: '',
  remark: '',
};

const PAGE_SIZE = 10;

const ExpenseEstimateRegister: React.FC = () => {
  const [options, setOptions] = useState<ExpenseEstimateOptions>({
    months: [],
    regions: [],
    departments: [],
    subjects: [],
    activities: [],
  });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // 记录列表
  const [listData, setListData] = useState<ExpenseEstimateListResponse | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listKeyword, setListKeyword] = useState('');
  const [listMonth, setListMonth] = useState<string>('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // 编辑 / 删除
  const [editing, setEditing] = useState<ExpenseEstimateRecord | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseEstimateRecord | null>(null);

  useEffect(() => {
    expenseEstimateApi
      .getExpenseEstimateOptions()
      .then((data: ExpenseEstimateOptions) => {
        setOptions(data);
        if (data.months.length > 0) {
          const cur = getCurrentMonth();
          const target = data.months.includes(cur) ? cur : data.months[data.months.length - 1];
          setForm((prev) => ({ ...prev, month: target }));
        }
      })
      .catch((err: unknown) =>
        logger.error('Failed to load expense estimate options:', err),
      );
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await expenseEstimateApi.getExpenseEstimateList({
        monthFrom: listMonth || undefined,
        monthTo: listMonth || undefined,
        keyword: listKeyword.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setListData(res);
    } catch (err: unknown) {
      logger.error('Failed to load expense estimate records:', err);
      setListData(null);
    } finally {
      setListLoading(false);
    }
  }, [listMonth, listKeyword, page]);

  useEffect(() => {
    loadList();
  }, [loadList, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [listMonth, listKeyword]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const required: Array<[keyof FormState, string]> = [
      ['month', '月份'],
      ['region', '所别'],
      ['department', '部别'],
      ['activityName', '促销活动'],
      ['expenseSubject', '费用科目'],
    ];
    for (const [key, label] of required) {
      if (!form[key].trim()) {
        toast.warning(`请填写「${label}」`);
        return;
      }
    }
    const estimated = Number(form.estimatedAmount) || 0;
    const actual = Number(form.actualAmount) || 0;
    if (estimated < 0 || actual < 0) {
      toast.warning('金额不能为负数');
      return;
    }

    setSubmitting(true);
    try {
      await expenseEstimateApi.createExpenseEstimate({
        month: form.month,
        region: form.region.trim(),
        department: form.department.trim(),
        activityName: form.activityName.trim(),
        expenseSubject: form.expenseSubject.trim(),
        estimatedAmount: estimated,
        actualAmount: actual,
        remark: form.remark.trim() || undefined,
      });
      toast.success('费用登记成功');
      setForm({ ...emptyForm, month: form.month });
      setRefreshKey((k) => k + 1);
      // 刷新筛选项（新录入的所别/部别/科目/活动）
      expenseEstimateApi
        .getExpenseEstimateOptions()
        .then((data: ExpenseEstimateOptions) => setOptions(data))
        .catch(() => undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`登记失败：${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (record: ExpenseEstimateRecord) => {
    setEditing(record);
    setEditForm({
      month: record.month,
      region: record.region,
      department: record.department,
      activityName: record.activityName,
      expenseSubject: record.expenseSubject,
      estimatedAmount: record.estimatedAmount > 0 ? String(record.estimatedAmount) : '',
      actualAmount: record.actualAmount > 0 ? String(record.actualAmount) : '',
      remark: record.remark ?? '',
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editing) return;
    const required: Array<[keyof FormState, string]> = [
      ['month', '月份'],
      ['region', '所别'],
      ['department', '部别'],
      ['activityName', '促销活动'],
      ['expenseSubject', '费用科目'],
    ];
    for (const [key, label] of required) {
      if (!editForm[key].trim()) {
        toast.warning(`请填写「${label}」`);
        return;
      }
    }
    const estimated = Number(editForm.estimatedAmount) || 0;
    const actual = Number(editForm.actualAmount) || 0;
    if (estimated < 0 || actual < 0) {
      toast.warning('金额不能为负数');
      return;
    }
    setSubmitting(true);
    try {
      await expenseEstimateApi.updateExpenseEstimate(editing.id, {
        month: editForm.month,
        region: editForm.region.trim(),
        department: editForm.department.trim(),
        activityName: editForm.activityName.trim(),
        expenseSubject: editForm.expenseSubject.trim(),
        estimatedAmount: estimated,
        actualAmount: actual,
        remark: editForm.remark.trim() || undefined,
      });
      toast.success('登记记录已更新');
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`更新失败：${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await expenseEstimateApi.deleteExpenseEstimate(deleting.id);
      toast.success('登记记录已删除');
      setDeleting(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`删除失败：${msg}`);
      setDeleting(null);
    }
  };

  const totalPages = listData ? Math.max(1, Math.ceil(listData.total / listData.pageSize)) : 1;

  const formFieldCls = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3';

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight">费用预估 · 费用登记</h1>
        <p className="text-xs text-muted-foreground mt-1">
          不同促销活动对应不同费用科目，登记后系统自动汇总计算预估使用状况
        </p>
      </div>

      {/* 登记表单 */}
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <span className="inline-flex items-center justify-center text-base leading-none">📝</span>
          登记费用
        </div>
        <div className={formFieldCls}>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">月份</Label>
            <Select value={form.month} onValueChange={(v) => setField('month', v)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.months.length > 0 ? (
                    options.months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value={getCurrentMonth()}>{getCurrentMonth()}</SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">所别</Label>
            <Input
              className="h-9"
              placeholder="如：华东一所"
              list="ee-region-suggest"
              value={form.region}
              onChange={(e) => setField('region', e.target.value)}
            />
            <datalist id="ee-region-suggest">
              {options.regions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">部别</Label>
            <Input
              className="h-9"
              placeholder="如：销售一部"
              list="ee-department-suggest"
              value={form.department}
              onChange={(e) => setField('department', e.target.value)}
            />
            <datalist id="ee-department-suggest">
              {options.departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">促销活动</Label>
            <Input
              className="h-9"
              placeholder="如：夏日冰爽大促"
              list="ee-activity-suggest"
              value={form.activityName}
              onChange={(e) => setField('activityName', e.target.value)}
            />
            <datalist id="ee-activity-suggest">
              {options.activities.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">费用科目</Label>
            <Input
              className="h-9"
              placeholder="如：陈列费"
              list="ee-subject-suggest"
              value={form.expenseSubject}
              onChange={(e) => setField('expenseSubject', e.target.value)}
            />
            <datalist id="ee-subject-suggest">
              {options.subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">预估金额（元）</Label>
            <Input
              className="h-9 font-mono tabular-nums"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={form.estimatedAmount}
              onChange={(e) => setField('estimatedAmount', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">登记金额（元）</Label>
            <Input
              className="h-9 font-mono tabular-nums"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={form.actualAmount}
              onChange={(e) => setField('actualAmount', e.target.value)}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
            <Label className="text-xs text-muted-foreground">备注</Label>
            <Textarea
              className="min-h-[40px] resize-none"
              rows={1}
              placeholder="选填：登记说明 / 活动备注"
              value={form.remark}
              onChange={(e) => setField('remark', e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setForm({ ...emptyForm, month: form.month })}
          >
            清空
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '提交中…' : '提交登记'}
          </Button>
        </div>
      </div>

      {/* 已登记记录 */}
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="text-sm font-bold text-foreground mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            已登记记录
            {listData && listData.total > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                共 {listData.total} 条
              </span>
            )}
          </span>
        </div>

        <FilterBar className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">月份</span>
              <Select
                value={listMonth}
                onValueChange={(v) => setListMonth(v === listMonth ? '' : v)}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="全部月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">关键词</span>
              <Input
                className="h-8 w-[200px]"
                placeholder="活动 / 科目 / 所别 / 部别"
                value={listKeyword}
                onChange={(e) => setListKeyword(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setListMonth('');
                setListKeyword('');
              }}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1">❌</span>
              重置
            </Button>
          </div>
        </FilterBar>

        {listLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : !listData || listData.items.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center">
            <Empty className="border-none py-0">
              <EmptyHeader>
                <EmptyMedia variant="emoji">📋</EmptyMedia>
                <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无登记记录</EmptyTitle>
                <EmptyDescription className="text-xs">
                  通过上方表单登记费用后，记录将展示在这里
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-accent/50">
                    <th className="px-2 py-2.5 text-left font-medium">月份</th>
                    <th className="px-2 py-2.5 text-left font-medium">所别</th>
                    <th className="px-2 py-2.5 text-left font-medium">部别</th>
                    <th className="px-2 py-2.5 text-left font-medium">促销活动</th>
                    <th className="px-2 py-2.5 text-left font-medium">费用科目</th>
                    <th className="px-2 py-2.5 text-right font-medium">预估金额</th>
                    <th className="px-2 py-2.5 text-right font-medium">登记金额</th>
                    <th className="px-2 py-2.5 text-left font-medium">备注</th>
                    <th className="px-2 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                    >
                      <td className="px-2 py-2 font-mono tabular-nums text-muted-foreground">{row.month}</td>
                      <td className="px-2 py-2 text-foreground truncate max-w-[100px]" title={row.region}>{row.region}</td>
                      <td className="px-2 py-2 text-foreground truncate max-w-[100px]" title={row.department}>{row.department}</td>
                      <td className="px-2 py-2 text-foreground truncate max-w-[140px]" title={row.activityName}>{row.activityName}</td>
                      <td className="px-2 py-2 text-foreground truncate max-w-[120px]" title={row.expenseSubject}>{row.expenseSubject}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{formatMoney(row.estimatedAmount)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">{formatMoney(row.actualAmount)}</td>
                      <td className="px-2 py-2 text-muted-foreground truncate max-w-[140px]" title={row.remark ?? ''}>
                        {row.remark || '—'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleEdit(row)}
                          >
                            ✏️ 编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-[hsl(4,72%,52%)] hover:text-[hsl(4,72%,52%)]"
                            onClick={() => setDeleting(row)}
                          >
                            🗑️ 删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  第 {page} / {totalPages} 页
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={page <= 1 || listLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={page >= totalPages || listLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 编辑对话框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">编辑登记记录</DialogTitle>
            <DialogDescription className="text-xs">
              修改费用登记信息，保存后预估使用状况将自动重新汇总
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">月份</Label>
              <Select
                value={editForm.month}
                onValueChange={(v) => setEditForm((prev) => ({ ...prev, month: v }))}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="选择月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">所别</Label>
              <Input
                className="h-9"
                value={editForm.region}
                onChange={(e) => setEditForm((prev) => ({ ...prev, region: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">部别</Label>
              <Input
                className="h-9"
                value={editForm.department}
                onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">促销活动</Label>
              <Input
                className="h-9"
                value={editForm.activityName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, activityName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">费用科目</Label>
              <Input
                className="h-9"
                value={editForm.expenseSubject}
                onChange={(e) => setEditForm((prev) => ({ ...prev, expenseSubject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">预估金额（元）</Label>
              <Input
                className="h-9 font-mono tabular-nums"
                type="number"
                min={0}
                step="0.01"
                value={editForm.estimatedAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, estimatedAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">登记金额（元）</Label>
              <Input
                className="h-9 font-mono tabular-nums"
                type="number"
                min={0}
                step="0.01"
                value={editForm.actualAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, actualAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-muted-foreground">备注</Label>
              <Textarea
                className="min-h-[40px] resize-none"
                rows={1}
                value={editForm.remark}
                onChange={(e) => setEditForm((prev) => ({ ...prev, remark: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleEditSubmit} disabled={submitting}>
              {submitting ? '保存中…' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">确认删除</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              删除后将不可恢复，预估使用状况将同步重新汇总。确定删除「
              {deleting?.activityName}」的这条登记记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[hsl(4,72%,52%)] text-white hover:bg-[hsl(4,72%,45%)]"
              onClick={handleDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpenseEstimateRegister;
