import React, { useCallback, useState, useRef } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { routeMappingApi } from '@client/src/api/index';
import type { RouteMappingItem } from '@shared/api.interface';

async function downloadRouteMappingTemplate() {
  const XLSX = await import('xlsx-js-style');
  const headers = ['门店编码', '线路编码', '线路名称'];
  const sampleData = [
    ['0001172488', 'R-SH-001', '松江城区线路A'],
    ['0001172377', 'R-SH-002', '徐汇城区线路B'],
    ['0001172060', 'R-SH-003', '杨浦城区线路C'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '线路映射');
  XLSX.writeFile(wb, '线路映射模板.xlsx');
}

export const DownloadRouteTemplateButton: React.FC<{ size?: 'sm' | 'default' }> = ({ size = 'sm' }) => (
  <Button variant="outline" size={size} onClick={downloadRouteMappingTemplate}>
    <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬇️</span>
    下载模板
  </Button>
);

const FIELD_ALIASES: Record<string, string> = {
  '门店编码': 'customerCode',
  '客户编码': 'customerCode',
  '客户代码': 'customerCode',
  '编码': 'customerCode',
  '客户编号': 'customerCode',
  '线路编码': 'routeCode',
  '路线编码': 'routeCode',
  '拜访线路编码': 'routeCode',
  '线路名称': 'routeName',
  '路线名称': 'routeName',
  '拜访线路名称': 'routeName',
};

function mapColumnHeader(header: string): string | null {
  const trimmed = header.trim();
  if (FIELD_ALIASES[trimmed]) return FIELD_ALIASES[trimmed];
  return null;
}

function parseRouteExcel(
  file: File,
): Promise<Array<{ customerCode: string; routeCode: string; routeName?: string }>> {
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
        const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        if (rows.length < 2) {
          reject(new Error('文件内容为空'));
          return;
        }
        const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
        const columnMap: Array<{ index: number; field: string }> = [];

        rawHeaders.forEach((h: string, i: number) => {
          const mapped = mapColumnHeader(h);
          if (mapped) columnMap.push({ index: i, field: mapped });
        });

        const codeCol = columnMap.find((c) => c.field === 'customerCode');
        const routeCol = columnMap.find((c) => c.field === 'routeCode');
        if (!codeCol || !routeCol) {
          reject(new Error('未找到门店编码或线路编码列，请确保表头包含"门店编码"和"线路编码"'));
          return;
        }
        const nameCol = columnMap.find((c) => c.field === 'routeName');

        const mappings: Array<{ customerCode: string; routeCode: string; routeName?: string }> = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          if (row.every((v: unknown) => v === '' || v == null)) continue;
          const customerCode = String(row[codeCol.index] ?? '').trim();
          const routeCode = String(row[routeCol.index] ?? '').trim();
          if (!customerCode || !routeCode) continue;
          mappings.push({
            customerCode,
            routeCode,
            routeName: nameCol ? String(row[nameCol.index] ?? '').trim() || undefined : undefined,
          });
        }

        if (mappings.length === 0) {
          reject(new Error('未解析到有效的线路映射数据'));
          return;
        }
        resolve(mappings);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

interface RouteMappingUploadProps {
  onUploadSuccess: () => void;
}

const RouteMappingUpload = React.forwardRef<HTMLInputElement, RouteMappingUploadProps>(({ onUploadSuccess }, externalRef) => {
  const [parsedData, setParsedData] = useState<Array<{ customerCode: string; routeCode: string; routeName?: string }> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setRefs = useCallback((node: HTMLInputElement | null) => {
    (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }, [externalRef]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseRouteExcel(file);
      setParsedData(result);
      toast.success(`解析成功，共 ${result.length} 条线路映射`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件解析失败';
      toast.error(msg);
      setParsedData(null);
    }
    event.target.value = '';
  }, []);

  const handleImport = async () => {
    if (!parsedData) return;
    setImporting(true);
    try {
      const result = await routeMappingApi.uploadRouteMappings(
        { mappings: parsedData },
        (done: number, total: number) => {
          setImportProgress(Math.round((done / total) * 100));
        },
      );
      toast.success(`导入成功：新增 ${result.inserted} 条，更新 ${result.updated} 条`);
      setParsedData(null);
      setImportProgress(0);
      onUploadSuccess();
    } catch {
      toast.error('导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  const previewRows = parsedData?.slice(0, 5) ?? [];

  return (
    <>
      <input ref={setRefs} type="file" accept=".xlsx" className="hidden" onChange={handleFileSelect} />

      <Dialog open={!!parsedData} onOpenChange={(open) => !open && setParsedData(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center text-base leading-none text-success" >✅</span>
              确认导入线路映射数据
            </DialogTitle>
          </DialogHeader>
          {parsedData && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{parsedData.length} 条线路映射</span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">门店编码</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">线路编码</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">线路名称</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">{row.customerCode}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">{row.routeCode}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">{row.routeName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setParsedData(null)} disabled={importing}>
                  取消
                </Button>
                <Button size="sm" onClick={handleImport} disabled={importing}>
                  {importing ? `导入中 ${importProgress}%` : '确认导入'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});

RouteMappingUpload.displayName = 'RouteMappingUpload';

export default RouteMappingUpload;
