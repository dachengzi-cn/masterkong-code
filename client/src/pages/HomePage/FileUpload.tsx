import { useCallback, useState, useRef } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { datasetApi } from '@client/src/api/index';
import type { FieldConfig } from '@shared/api.interface';

interface FileUploadProps {
  onImportSuccess: () => void;
  onImportingChange?: (importing: boolean, progress: string, cancelFn: (() => void) | null) => void;
}

interface SheetSummary {
  name: string;
  rowCount: number;
}

interface ParsedData {
  fields: FieldConfig[];
  records: Record<string, unknown>[];
  fileName: string;
  sheetSummaries: SheetSummary[];
}

interface DateClassification {
  currentMonthCount: number;
  previousMonthCount: number;
  previousMonths: string[];
  allMonths: string[];
}

const COLUMN_NAME_MAP: Record<string, string> = {
  '时间-日期': '订单-订单日期',
  '客户-业务代表': '人员-业代',
  '客户-客户编码': '客户-通路客户编码',
  '产品-品牌': '品牌',
  '累计排单数量（+非领搭赠，自然箱，含上月排单未过账）': '订单数量-不含促销',
  '累计过账数量（+非领搭赠，自然箱）': '订单数量-不含促销',
  '回单数量-不含促销': '订单数量-不含促销',
};

function normalizeColumnName(name: string): string {
  return COLUMN_NAME_MAP[name] ?? name;
}

function inferFieldType(value: unknown): FieldConfig['type'] {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'text';
    const datePattern = /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/;
    if (datePattern.test(trimmed)) return 'date';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
  }
  return 'text';
}

function inferFieldTypeFromRows(rows: unknown[][], colIndex: number): FieldConfig['type'] {
  const datePattern = /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/;
  const numberPattern = /^-?\d+(\.\d+)?$/;
  const sampleLimit = Math.min(rows.length, 20);
  let hasDate = 0;
  let hasNumber = 0;
  let hasText = 0;
  for (let r = 1; r < sampleLimit; r++) {
    const val = rows[r]?.[colIndex];
    if (val === null || val === undefined || val === '') continue;
    const str = String(val).trim();
    if (!str) continue;
    if (datePattern.test(str)) { hasDate++; continue; }
    if (numberPattern.test(str)) { hasNumber++; continue; }
    hasText++;
  }
  if (hasDate > 0 && hasDate >= hasNumber && hasDate >= hasText) return 'date';
  if (hasNumber > 0 && hasNumber >= hasText) return 'number';
  return 'text';
}

function parseExcelFile(
  file: File
): Promise<{ fields: FieldConfig[]; records: Record<string, unknown>[]; sheetSummaries: SheetSummary[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const XLSX = await import('xlsx-js-style');
        const workbook = XLSX.read(data, { type: 'array' });
        const allRecords: Record<string, unknown>[] = [];
        const sheetSummaries: SheetSummary[] = [];
        let allFields: FieldConfig[] = [];

        for (const name of workbook.SheetNames) {
          if (name.startsWith('_')) continue;
          const ws = workbook.Sheets[name];
          if (!ws || !ws['!ref']) continue;
          const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(
            ws,
            { header: 1, defval: '' }
          );
          if (rows.length < 2) continue;
          const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
          const usedNames = new Set<string>();
          const headers = rawHeaders.map((h: string, i: number) => {
            let colName = normalizeColumnName(h) || `列${i + 1}`;
            if (usedNames.has(colName)) {
              colName = `${colName}_${i + 1}`;
            }
            usedNames.add(colName);
            return colName;
          });
          const validIndices = headers.map((h: string, i: number) => ({ h, i }));
          if (sheetSummaries.length === 0) {
            allFields = validIndices.map(({ h, i }: { h: string; i: number }) => ({
              name: h,
              type: inferFieldTypeFromRows(rows, i),
            }));
          }
          let sheetRowCount = 0;
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            if (row.every((v: unknown) => v === '' || v === null || v === undefined)) continue;
            const record: Record<string, unknown> = { _sheetType: name };
            for (const { h, i } of validIndices) {
              record[h] = row[i] ?? '';
            }
            allRecords.push(record);
            sheetRowCount++;
          }
          if (sheetRowCount > 0) {
            sheetSummaries.push({ name, rowCount: sheetRowCount });
          }
        }

        if (allRecords.length === 0) {
          reject(new Error('文件内容为空'));
          return;
        }
        resolve({ fields: allFields, records: allRecords, sheetSummaries });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function extractUploadMonths(
  records: Record<string, unknown>[],
  dateFieldName: string | undefined,
): string[] {
  const monthSet = new Set<string>();
  if (!dateFieldName) return [];
  for (const rec of records) {
    const raw = String(rec[dateFieldName] ?? '');
    if (!raw) continue;
    const normalized = raw.replace(/[./]/g, '-');
    const parts = normalized.split('-');
    if (parts.length >= 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m)) {
        monthSet.add(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
  }
  return Array.from(monthSet).sort();
}

function classifyRecordDates(
  records: Record<string, unknown>[],
  dateFieldName: string | undefined,
): DateClassification {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  let currentMonthCount = 0;
  let previousMonthCount = 0;
  const previousMonthSet = new Set<string>();
  const allMonthSet = new Set<string>();

  for (const rec of records) {
    if (!dateFieldName) { currentMonthCount++; continue; }
    const raw = String(rec[dateFieldName] ?? '');
    if (!raw) { currentMonthCount++; continue; }
    const normalized = raw.replace(/[./]/g, '-');
    const parts = normalized.split('-');
    if (parts.length < 2) { currentMonthCount++; continue; }
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(y) || isNaN(m)) { currentMonthCount++; continue; }
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    allMonthSet.add(ym);
    if (y < curYear || (y === curYear && m < curMonth)) {
      previousMonthCount++;
      previousMonthSet.add(ym);
    } else {
      currentMonthCount++;
    }
  }

  return {
    currentMonthCount,
    previousMonthCount,
    previousMonths: Array.from(previousMonthSet).sort(),
    allMonths: Array.from(allMonthSet).sort(),
  };
}

const FileUpload: React.FC<FileUploadProps> = ({ onImportSuccess, onImportingChange }) => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [dateClass, setDateClass] = useState<DateClassification | null>(null);
  const [uploadMonths, setUploadMonths] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseExcelFile(file);
      setParsedData({ ...result, fileName: file.name });

      const dateField = result.fields.find((f: FieldConfig) => f.type === 'date');
      const classification = classifyRecordDates(result.records, dateField?.name);
      setDateClass(classification);

      const months = extractUploadMonths(result.records, dateField?.name);
      setUploadMonths(months);

      toast.success(`解析成功，共 ${result.records.length} 行数据（${result.sheetSummaries.length} 个工作表）`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件解析失败，请检查格式';
      toast.error(msg);
      setParsedData(null);
    }
    event.target.value = '';
  }, []);

  const handleMonthToggle = (month: string) => {
    setUploadMonths(prev => {
      if (prev.includes(month)) {
        return prev.filter(m => m !== month);
      }
      return [...prev, month].sort();
    });
  };

  const handleSelectAllMonths = () => {
    if (dateClass) {
      setUploadMonths([...dateClass.allMonths]);
    }
  };

  const handleDeselectAllMonths = () => {
    setUploadMonths([]);
  };

  const handleCancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleImport = async () => {
    if (!parsedData) return;
    const dataToImport = parsedData;
    abortRef.current = false;
    setImporting(true);
    setImportProgress('');
    setParsedData(null);
    onImportingChange?.(true, '', handleCancel);
    const BATCH_SIZE = 500;
    try {
      // 根据选中的月份过滤数据
      const dateField = dataToImport.fields.find((f: FieldConfig) => f.type === 'date');
      let recordsToInsert = dataToImport.records;
      if (dateField && uploadMonths.length > 0 && uploadMonths.length < dateClass?.allMonths.length) {
        recordsToInsert = dataToImport.records.filter((rec) => {
          const raw = String(rec[dateField.name] ?? '');
          if (!raw) return false;
          const normalized = raw.replace(/[./]/g, '-');
          const parts = normalized.split('-');
          if (parts.length < 2) return false;
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          if (isNaN(y) || isNaN(m)) return false;
          const ym = `${y}-${String(m).padStart(2, '0')}`;
          return uploadMonths.includes(ym);
        });
      }

      const mergeRes = await datasetApi.mergeByMonths({
        name: dataToImport.fileName.replace(/\.xlsx$/i, ''),
        fields: dataToImport.fields,
        records: [],
        uploadMonths,
      });
      const datasetId = String(mergeRes.id ?? mergeRes);

      const totalBatches = Math.ceil(recordsToInsert.length / BATCH_SIZE);
      for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        if (abortRef.current) {
          toast.info('已取消导入');
          return;
        }
        const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const progress = `${batchNum}/${totalBatches}`;
        setImportProgress(progress);
        onImportingChange?.(true, progress, handleCancel);
        await datasetApi.appendRecords(datasetId, { records: batch });
      }

      toast.success(`数据导入成功，已按月份合并覆盖，新数据 ${recordsToInsert.length} 行`);
      setImportProgress('');
      setDateClass(null);
      setUploadMonths([]);
      onImportSuccess();
    } catch {
      if (!abortRef.current) {
        toast.error('数据导入失败，请重试');
      }
      setImportProgress('');
    } finally {
      setImporting(false);
      onImportingChange?.(false, '', null);
    }
  };

  const handleClose = () => {
    setParsedData(null);
    setDateClass(null);
    setUploadMonths([]);
  };

  const previewRows = parsedData?.records.slice(0, 5) ?? [];
  const fields = parsedData?.fields ?? [];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        size="sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬆️</span>
        上传数据
      </Button>

      <Dialog open={!!parsedData} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center text-base leading-none text-success" >✅</span>
              确认导入数据
            </DialogTitle>
          </DialogHeader>

          {parsedData && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {parsedData.fileName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {parsedData.records.length} 行数据
                </span>
              </div>

              {parsedData.sheetSummaries.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {parsedData.sheetSummaries.map((s: SheetSummary) => (
                    <span
                      key={s.name}
                      className="inline-flex items-center gap-1 rounded-sm bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                    >
                      {s.name}：{s.rowCount} 行
                    </span>
                  ))}
                </div>
              )}

              {dateClass && dateClass.allMonths.length > 0 && (
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
                      已选 {uploadMonths.length} / {dateClass.allMonths.length} 个月份
                    </p>
                    {dateClass.previousMonthCount > 0 && (
                      <p className="text-xs text-warning">
                        历史月份（{dateClass.previousMonths.join('、')}）共 {dateClass.previousMonthCount} 条数据将被覆盖
                      </p>
                    )}
                  </div>
                  <div className="ml-6 flex flex-wrap gap-2">
                    {dateClass.allMonths.map(month => (
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
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        数据源
                      </th>
                      {fields.map((f) => (
                        <th
                          key={f.name}
                          className="whitespace-nowrap px-3 py-2 font-medium text-foreground"
                        >
                          {f.name}
                          <span className="ml-1 text-muted-foreground">
                            ({f.type})
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-primary font-medium">
                          {String(row['_sheetType'] ?? '')}
                        </td>
                        {fields.map((f) => (
                          <td
                            key={f.name}
                            className="whitespace-nowrap px-3 py-2 text-foreground"
                          >
                            {String(row[f.name] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.records.length > 5 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  仅展示前 5 行，共 {parsedData.records.length} 行
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleClose} disabled={importing}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={importing || uploadMonths.length === 0}
                >
                  确认导入
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FileUpload;
