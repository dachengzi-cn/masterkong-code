import React, { useCallback, useState, useRef } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { customerApi } from '@client/src/api/index';
import type { CustomerProfile } from '@shared/api.interface';
// eslint-disable-next-line import/no-unresolved
import templateUrl from '../../assets/customer-template.xlsx?url';

interface CustomerUploadProps {
  onUploadSuccess: (fileName: string, rowCount: number) => void;
  onImportingChange?: (importing: boolean, progress: number, cancelFn: (() => void) | null) => void;
}

interface ParsedCustomerData {
  customers: CustomerProfile[];
  fileName: string;
}

const CORE_FIELDS = ['customer_code', 'customer_name', 'region', 'tier'];
const FIELD_ALIASES: Record<string, string> = {
  '客户编码': 'customer_code',
  '客户代码': 'customer_code',
  '编码': 'customer_code',
  '客户编号': 'customer_code',
  'code': 'customer_code',
  '客户名称': 'customer_name',
  '名称': 'customer_name',
  '客户名': 'customer_name',
  '经销商名称': 'customer_name',
  '经销商': 'customer_name',
  '门店名称': 'customer_name',
  '终端名称': 'customer_name',
  '区域': 'region',
  '大区': 'region',
  '地区': 'region',
  '营业所': 'region',
  '所': 'region',
  '城区所': 'region',
  '所别': 'region',
  '层级': 'tier',
  '阶层': 'tier',
  '级别': 'tier',
  '分级': 'tier',
  '客户分级': 'tier',
  '客户级别': 'tier',
};

function mapColumnHeader(header: string): string | null {
  const trimmed = header.trim();
  if (FIELD_ALIASES[trimmed]) return FIELD_ALIASES[trimmed];
  if (CORE_FIELDS.includes(trimmed.toLowerCase())) return trimmed.toLowerCase();
  return null;
}

/** 付费金额列名黑名单：此类列不再被导入，付费金额唯一来源为费用资料（ATP费用 sheet） */
const PAID_AMOUNT_COLUMN_NAMES = ['付费金额', '付费金额(元)', '付费金额（元）', '付费金额/元', '付费金额元'];

function isPaidAmountColumn(header: string): boolean {
  const trimmed = header.trim();
  return PAID_AMOUNT_COLUMN_NAMES.some(
    (name) => trimmed === name || trimmed.replace(/\s/g, '') === name.replace(/\s/g, ''),
  );
}

interface ParseCustomerResult {
  customers: CustomerProfile[];
  fileName: string;
  ignoredPaidAmountColumns: string[];
}

function parseCustomerExcel(
  file: File,
): Promise<ParseCustomerResult> {
  return import('xlsx-js-style').then((XLSX) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        let sheet: ReturnType<typeof XLSX.utils.sheet_to_json>[0] | null = null;
        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          if (ws && ws['!ref']) {
            sheet = ws;
            break;
          }
        }
        if (!sheet) {
          reject(new Error('文件内容为空'));
          return;
        }
        const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(
          sheet,
          { header: 1, defval: '' },
        );
        if (rows.length < 2) {
          reject(new Error('文件内容为空'));
          return;
        }
        const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
        const columnMap: Array<{ index: number; field: string }> = [];
        const extraColumns: Array<{ index: number; name: string }> = [];
        const ignoredPaidAmountColumns: string[] = [];

        rawHeaders.forEach((h: string, i: number) => {
          const mapped = mapColumnHeader(h);
          if (mapped) {
            columnMap.push({ index: i, field: mapped });
          } else if (isPaidAmountColumn(h)) {
            // 付费金额列不导入系统：过滤并记录，由调用方提示用户
            ignoredPaidAmountColumns.push(h.trim());
          } else if (h) {
            extraColumns.push({ index: i, name: h });
          }
        });

        const codeCol = columnMap.find((c: { field: string }) => c.field === 'customer_code');
        if (!codeCol) {
          reject(new Error('未找到客户编码列，请确保表头包含"客户编码"'));
          return;
        }

        const nameCol = columnMap.find((c: { field: string }) => c.field === 'customer_name');
        const regionCol = columnMap.find((c: { field: string }) => c.field === 'region');
        const tierCol = columnMap.find((c: { field: string }) => c.field === 'tier');

        const customers: CustomerProfile[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          if (row.every((v: unknown) => v === '' || v == null)) continue;
          const code = String(row[codeCol.index] ?? '').trim();
          if (!code) continue;

          const extras: Record<string, unknown> = {};
          for (const { index, name } of extraColumns) {
            extras[name] = row[index] ?? '';
          }

          customers.push({
            customerCode: code,
            customerName: String(row[nameCol?.index ?? -1] ?? '').trim(),
            region: String(row[regionCol?.index ?? -1] ?? '').trim(),
            tier: String(row[tierCol?.index ?? -1] ?? '').trim(),
            extras,
          });
        }

        if (customers.length === 0) {
          reject(new Error('未解析到有效的客户数据'));
          return;
        }
        resolve({ customers, fileName: file.name, ignoredPaidAmountColumns });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

export async function downloadTemplate() {
  try {
    const res = await fetch(templateUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '数据模板-客户资料.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    toast.error('下载模板失败，请重试');
  }
}

export const DownloadTemplateButton: React.FC<{ size?: 'sm' | 'default' }> = ({ size = 'sm' }) => (
  <Button variant="outline" size={size} onClick={downloadTemplate}>
    <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬇️</span>
    下载模板
  </Button>
);

const CustomerUpload = React.forwardRef<HTMLInputElement, CustomerUploadProps>(({ onUploadSuccess, onImportingChange }, externalRef) => {
  const [parsedData, setParsedData] = useState<ParsedCustomerData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const setRefs = useCallback((node: HTMLInputElement | null) => {
    (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }, [externalRef]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseCustomerExcel(file);
      setParsedData({ customers: result.customers, fileName: file.name });
      toast.success(`解析成功，共 ${result.customers.length} 条客户数据`);
      if (result.ignoredPaidAmountColumns.length > 0) {
        toast.warning(
          `已忽略「${result.ignoredPaidAmountColumns.join('、')}」列：付费金额不再从客户资料导入，统一以费用资料（ATP费用）为准`,
          { duration: 6000 },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件解析失败';
      toast.error(msg);
      setParsedData(null);
    }
    event.target.value = '';
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleImport = async () => {
    if (!parsedData) return;
    const dataToImport = parsedData;
    abortRef.current = false;
    setImporting(true);
    setImportProgress(0);
    setParsedData(null);
    onImportingChange?.(true, 0, handleCancel);
    try {
      const total = dataToImport.customers.length;
      await customerApi.removeAllCustomers();
      const result = await customerApi.uploadCustomers(
        { customers: dataToImport.customers },
        (done: number, _total: number) => {
          if (abortRef.current) return;
          const progress = Math.round((done / total) * 100);
          setImportProgress(progress);
          onImportingChange?.(true, progress, handleCancel);
        },
      );
      if (abortRef.current) {
        toast.info('已取消导入');
        return;
      }
      toast.success(
        `导入成功，已覆盖全部客户资料：共 ${result.total} 条`,
      );
      setImportProgress(0);
      onUploadSuccess(dataToImport.fileName, result.total);
    } catch (e) {
      if (abortRef.current) {
        toast.info('已取消导入');
        return;
      }
      let detail = e instanceof Error ? e.message : '导入失败，请重试';
      try {
        if (e && typeof e === 'object') {
          const eAny = e as any;
          if (eAny.response && eAny.response.data) {
            const data = eAny.response.data;
            if (typeof data === 'object' && data !== null) {
              detail = data.error?.message ?? detail;
            } else if (typeof data === 'string') {
              detail = data;
            }
          } else if (eAny.message) {
            detail = eAny.message;
          }
        }
      } catch {
        /* noop */
      }
      toast.error(`导入失败：${detail}`);
    } finally {
      setImporting(false);
      onImportingChange?.(false, 0, null);
    }
  };

  const previewRows = parsedData?.customers.slice(0, 5) ?? [];

  return (
    <>
      <input
        ref={setRefs}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Dialog open={!!parsedData} onOpenChange={(open) => !open && setParsedData(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center text-base leading-none text-success" >✅</span>
              确认导入客户数据（将覆盖原有资料）
            </DialogTitle>
          </DialogHeader>

          {parsedData && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {parsedData.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {parsedData.customers.length} 条客户数据
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        分级
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        所别
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        客户编码
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        经销商名称
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        经销商类型
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        客户经理
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        合作状态
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row: CustomerProfile, i: number) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {row.tier}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {row.region}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {row.customerCode}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {row.customerName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {String(row.extras?.['经销商类型'] ?? '')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {String(row.extras?.['客户经理'] ?? '')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {String(row.extras?.['合作状态'] ?? '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.customers.length > 5 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  仅展示前 5 条，共 {parsedData.customers.length} 条
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setParsedData(null)} disabled={importing}>
                  取消
                </Button>
                <Button size="sm" onClick={handleImport} disabled={importing}>
                  确认覆盖导入
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});

export default CustomerUpload;
