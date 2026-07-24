import React, { useCallback, useState, useRef } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { expenseApi } from '@client/src/api/index';

interface ExpenseRecord {
  customerCode: string;
  customerName: string;
  sheetType: string;
  extras: Record<string, unknown>;
}

interface SheetSummary {
  name: string;
  rowCount: number;
}

interface ParsedExpenseData {
  items: ExpenseRecord[];
  fileName: string;
  sheetSummaries: SheetSummary[];
  fields: string[];
}

interface ExpenseUploadProps {
  onUploadSuccess: (fileName: string, rowCount: number) => void;
  onImportingChange?: (importing: boolean, progress: number, cancelFn: (() => void) | null) => void;
}

const FIELD_ALIASES: Record<string, string> = {
  客户编码: 'customer_code',
  客户代码: 'customer_code',
  编码: 'customer_code',
  客户编号: 'customer_code',
  '客户-通路客户编码': 'customer_code',
  通路客户编码: 'customer_code',
  客户名称: 'customer_name',
  客户名: 'customer_name',
  名称: 'customer_name',
};

function mapColumnHeader(header: string): string | null {
  const trimmed = header.trim();
  if (FIELD_ALIASES[trimmed]) return FIELD_ALIASES[trimmed];
  const lower = trimmed.toLowerCase();
  if (lower === 'customer_code' || lower === 'customer_name') return lower;
  return null;
}

/** 转换二阶客户编码：000XXXXXX -> 1201/XXXXXX */
function normalizeCustomerCode(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (/^1201\//i.test(trimmed)) return trimmed;
  if (/^KH\d+/i.test(trimmed)) return trimmed;
  const m = trimmed.match(/^0+(\d+)$/);
  if (m) {
    return `1201/${m[1]}`;
  }
  return trimmed;
}

function parseExpenseExcel(
  file: File,
): Promise<{ items: ExpenseRecord[]; fileName: string; sheetSummaries: SheetSummary[]; fields: string[] }> {
  return import('xlsx-js-style').then(
    (XLSX) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target!.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const allItems: ExpenseRecord[] = [];
            const sheetSummaries: SheetSummary[] = [];
            let allFields: string[] = [];

            for (const sheetName of workbook.SheetNames) {
              if (sheetName.startsWith('_')) continue;
              const ws = workbook.Sheets[sheetName];
              if (!ws || !ws['!ref']) continue;

              const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(
                ws,
                { header: 1, defval: '' },
              );
              if (rows.length < 2) continue;

              const rawHeaders = rows[0].map((v: unknown) =>
                String(v ?? '').trim(),
              );
              const columnMap: Array<{ index: number; field: string }> = [];
              const extraColumns: Array<{ index: number; name: string }> = [];

              rawHeaders.forEach((h: string, i: number) => {
                const mapped = mapColumnHeader(h);
                if (mapped) {
                  columnMap.push({ index: i, field: mapped });
                } else if (h) {
                  extraColumns.push({ index: i, name: h });
                }
              });

              const codeCol = columnMap.find(
                (c: { field: string }) => c.field === 'customer_code',
              );
              if (!codeCol) continue;

              const nameCol = columnMap.find(
                (c: { field: string }) => c.field === 'customer_name',
              );

              if (allFields.length === 0) {
                allFields = ['数据源', ...rawHeaders.filter((h) => !!h)];
              }

              let sheetRowCount = 0;
              for (let r = 1; r < rows.length; r++) {
                const row = rows[r] as unknown[];
                if (row.every((v: unknown) => v === '' || v == null)) continue;
                const code = String(row[codeCol.index] ?? '').trim();
                if (!code) continue;

                const extras: Record<string, unknown> = {};
                for (const { index, name } of extraColumns) {
                  extras[name] = row[index] ?? '';
                }

                allItems.push({
                  customerCode: normalizeCustomerCode(code),
                  customerName: nameCol
                    ? String(row[nameCol.index] ?? '').trim()
                    : '',
                  sheetType: sheetName,
                  extras,
                });
                sheetRowCount++;
              }

              if (sheetRowCount > 0) {
                sheetSummaries.push({ name: sheetName, rowCount: sheetRowCount });
              }
            }

            if (allItems.length === 0) {
              reject(new Error('未解析到有效的费用数据，请确保至少一个工作表包含"客户-通路客户编码"列'));
              return;
            }
            resolve({ items: allItems, fileName: file.name, sheetSummaries, fields: allFields });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
      }),
  );
}

function extractUploadMonths(records: ExpenseRecord[]): string[] {
  const monthSet = new Set<string>();
  for (const rec of records) {
    const raw = String(Object.values(rec.extras).find((v) => /\d+月\s+\d{4}/.test(String(v))) ?? '');
    if (!raw) continue;
    const match = raw.match(/(\d+)月\s+(\d{4})/);
    if (match) {
      const m = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      monthSet.add(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return Array.from(monthSet).sort();
}

export async function downloadExpenseTemplate() {
  try {
    const response = await fetch('/templates/数据模板-费用资料.xlsx');
    if (!response.ok) throw new Error('下载失败');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '数据模板-费用资料.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch {
    toast.error('下载模板失败，请重试');
  }
}

export const DownloadExpenseTemplateButton: React.FC<{
  size?: 'sm' | 'default';
}> = ({ size = 'sm' }) => (
  <Button variant="outline" size={size} onClick={downloadExpenseTemplate}>
    <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬇️</span>
    下载模板
  </Button>
);

const ExpenseUpload = React.forwardRef<HTMLInputElement, ExpenseUploadProps>(
  ({ onUploadSuccess, onImportingChange }, externalRef) => {
    const [parsedData, setParsedData] = useState<ParsedExpenseData | null>(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [activeSheet, setActiveSheet] = useState<string>('all');
    const [uploadMonths, setUploadMonths] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef(false);

    const setRefs = useCallback((node: HTMLInputElement | null) => {
      (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current =
        node;
      if (typeof externalRef === 'function') externalRef(node);
      else if (externalRef)
        (externalRef as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
    }, [externalRef]);

    const handleFileSelect = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const result = await parseExpenseExcel(file);
          setParsedData({
            items: result.items,
            fileName: result.fileName,
            sheetSummaries: result.sheetSummaries,
            fields: result.fields,
          });
          const months = extractUploadMonths(result.items);
          setUploadMonths(months);
          setActiveSheet('all');
          toast.success(`解析成功，共 ${result.items.length} 条费用数据（${result.sheetSummaries.length} 个工作表）`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '文件解析失败';
          toast.error(msg);
          setParsedData(null);
        }
        event.target.value = '';
      },
      [],
    );

    const handleMonthToggle = (month: string) => {
      setUploadMonths((prev) => {
        if (prev.includes(month)) {
          return prev.filter((m) => m !== month);
        }
        return [...prev, month].sort();
      });
    };

    const handleSelectAllMonths = () => {
      const all = extractUploadMonths(parsedData?.items ?? []);
      setUploadMonths(all);
    };

    const handleDeselectAllMonths = () => {
      setUploadMonths([]);
    };

    const handleCancel = useCallback(() => {
      abortRef.current = true;
    }, []);

    const handleClose = () => {
      setParsedData(null);
      setUploadMonths([]);
      setActiveSheet('all');
    };

    const handleImport = async () => {
      if (!parsedData) return;
      const dataToImport = parsedData;
      abortRef.current = false;
      setImporting(true);
      setImportProgress(0);
      setParsedData(null);
      onImportingChange?.(true, 0, handleCancel);
      try {
        // 按月份过滤
        let recordsToInsert = dataToImport.items;
        if (uploadMonths.length > 0 && uploadMonths.length < allMonths.length) {
          recordsToInsert = recordsToInsert.filter((rec) => {
            const raw = String(Object.values(rec.extras).find((v) => /\d+月\s+\d{4}/.test(String(v))) ?? '');
            if (!raw) return false;
            const match = raw.match(/(\d+)月\s+(\d{4})/);
            if (!match) return false;
            const m = parseInt(match[1], 10);
            const y = parseInt(match[2], 10);
            const ym = `${y}-${String(m).padStart(2, '0')}`;
            return uploadMonths.includes(ym);
          });
        }

        // 分批上传，避免请求体过大
        const BATCH_SIZE = 1000;
        const totalBatches = Math.ceil(recordsToInsert.length / BATCH_SIZE);
        let totalProcessed = 0;

        // 第一批使用 overwrite 接口清空旧数据并插入
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
          if (abortRef.current) {
            toast.info('已取消导入');
            return;
          }
          const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const isFirstBatch = i === 0;
          const result = isFirstBatch
            ? await expenseApi.overwriteExpenses(batch, uploadMonths)
            : await expenseApi.uploadExpenses(batch, uploadMonths);
          totalProcessed += result.inserted + result.updated;
          const progress = Math.round((batchNum / totalBatches) * 100);
          setImportProgress(progress);
          onImportingChange?.(true, progress, handleCancel);
        }

        toast.success(`导入成功，已覆盖全部费用资料：共 ${totalProcessed} 条`);
        setImportProgress(100);
        onImportingChange?.(true, 100, handleCancel);
        onUploadSuccess(dataToImport.fileName, totalProcessed);
      } catch (e) {
        if (abortRef.current) {
          toast.info('已取消导入');
          return;
        }
        const detail = e instanceof Error ? e.message : '导入失败，请重试';
        toast.error(`导入失败：${detail}`);
      } finally {
        setImporting(false);
        onImportingChange?.(false, 0, null);
      }
    };

    const filteredItems =
      activeSheet === 'all'
        ? parsedData?.items ?? []
        : (parsedData?.items ?? []).filter((item) => item.sheetType === activeSheet);

    const previewRows = filteredItems.slice(0, 5);
    const fields = parsedData?.fields ?? [];
    const allMonths = extractUploadMonths(parsedData?.items ?? []);

    return (
      <>
        <input
          ref={setRefs}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Dialog
          open={!!parsedData}
          onOpenChange={(open) => !open && handleClose()}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center text-base leading-none text-success" >✅</span>
                确认导入费用数据（将覆盖原有资料）
              </DialogTitle>
            </DialogHeader>

            {parsedData && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {parsedData.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {parsedData.items.length} 条费用数据
                  </span>
                </div>

                {parsedData.sheetSummaries.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveSheet('all')}
                      className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs ${
                        activeSheet === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-accent-foreground'
                      }`}
                    >
                      全部
                    </button>
                    {parsedData.sheetSummaries.map((s: SheetSummary) => (
                      <button
                        key={s.name}
                        onClick={() => setActiveSheet(s.name)}
                        className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs ${
                          activeSheet === s.name
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-accent text-accent-foreground'
                        }`}
                      >
                        {s.name}：{s.rowCount} 行
                      </button>
                    ))}
                  </div>
                )}

                {allMonths.length > 0 && (
                  <div className="mb-3 rounded-sm border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center justify-center text-base leading-none text-primary" >ℹ️</span>
                      <span className="text-sm font-medium text-foreground">
                        选择上传月份
                      </span>
                      <div className="ml-auto flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={handleSelectAllMonths}
                        >
                          全选
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={handleDeselectAllMonths}
                        >
                          清空
                        </Button>
                      </div>
                    </div>
                    <div className="ml-6 space-y-1 mb-2">
                      <p className="text-xs text-muted-foreground">
                        已选 {uploadMonths.length} / {allMonths.length} 个月份
                      </p>
                    </div>
                    <div className="ml-6 flex flex-wrap gap-2">
                      {allMonths.map((month) => (
                        <label
                          key={month}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs cursor-pointer hover-elevate"
                        >
                          <input
                            type="checkbox"
                            checked={uploadMonths.includes(month)}
                            onChange={() => handleMonthToggle(month)}
                            className="rounded-sm border-border"
                          />
                          <span className="font-mono">{month}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-sm border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-accent/30">
                        {fields.map((f: string) => (
                          <th
                            key={f}
                            className="whitespace-nowrap px-3 py-2 font-medium text-foreground"
                          >
                            {f}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row: ExpenseRecord, i: number) => (
                        <tr
                          key={i}
                          className="border-b border-border last:border-0"
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-primary font-medium">
                            {row.sheetType}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-foreground">
                            {row.customerCode}
                          </td>
                          {Object.entries(row.extras).map(([k, v]) => (
                            <td
                              key={k}
                              className="whitespace-nowrap px-3 py-2 text-foreground"
                            >
                              {String(v ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredItems.length > 5 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    仅展示前 5 条，共 {filteredItems.length} 条
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    disabled={importing}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={importing || uploadMonths.length === 0}
                  >
                    确认覆盖导入
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

export default ExpenseUpload;
