import React, { useCallback, useRef, useState } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { customerApi, routeApi, expenseApi, datasetApi } from '@client/src/api/index';
import type { FieldConfig } from '@shared/api.interface';

type ModuleType = 'productivity' | 'customer' | 'route' | 'expense';

interface ModuleMeta {
  key: ModuleType;
  name: string;
  color: string;
}

const MODULES: ModuleMeta[] = [
  { key: 'productivity', name: '生产力数据', color: 'bg-blue-500' },
  { key: 'customer', name: '客户资料', color: 'bg-emerald-500' },
  { key: 'route', name: '线路资料', color: 'bg-amber-500' },
  { key: 'expense', name: '费用资料', color: 'bg-rose-500' },
];

const PREFIX_RULES: { prefix: string; module: ModuleType }[] = [
  { prefix: '数据模板-生产力数据', module: 'productivity' },
  { prefix: '数据模板-客户资料', module: 'customer' },
  { prefix: '数据模板-线路资料', module: 'route' },
  { prefix: '数据模板-费用资料', module: 'expense' },
];

function detectModule(fileName: string): ModuleType | null {
  const base = fileName.replace(/\.xlsx$/i, '').trim();
  for (const rule of PREFIX_RULES) {
    if (base === rule.prefix || base.startsWith(rule.prefix)) return rule.module;
  }
  return null;
}

/** 从请求异常中提取服务端返回的具体错误信息（优先 response.data.error.message） */
function extractApiError(e: unknown): string {
  const err = e as { response?: { data?: unknown }; message?: string };
  const data = err?.response?.data as
    | { error?: { message?: string }; message?: string }
    | undefined;
  if (data?.error?.message) return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  if (err?.message) return err.message;
  return '未知错误，请查看服务端日志';
}

interface ParsedFile {
  file: File;
  module: ModuleType;
  fileName: string;
  rows: unknown[];
  fields?: FieldConfig[];
  dateFieldName?: string;
  months: string[];
  /** 解析中被过滤的付费金额列（不导入系统） */
  ignoredPaidAmountColumns?: string[];
}

interface ModuleGroup {
  module: ModuleType;
  files: ParsedFile[];
  months: string[];
  selectedMonths: string[];
  rowCount: number;
}

// ==================== 生产力数据解析 ====================
const PRODUCTIVITY_COLUMN_MAP: Record<string, string> = {
  '时间-日期': '订单-订单日期',
  '客户-业务代表': '人员-业代',
  '客户-客户编码': '客户-通路客户编码',
  '产品-品牌': '品牌',
  '累计排单数量（+非领搭赠，自然箱，含上月排单未过账）': '订单数量-不含促销',
  '累计过账数量（+非领搭赠，自然箱）': '订单数量-不含促销',
  '回单数量-不含促销': '订单数量-不含促销',
};

function normalizeProductivityColumn(name: string): string {
  return PRODUCTIVITY_COLUMN_MAP[name] ?? name;
}

function inferFieldTypeFromRows(rows: unknown[][], colIndex: number): FieldConfig['type'] {
  const datePattern = /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/;
  const numberPattern = /^-?\d+(\.\d+)?$/;
  const sampleLimit = Math.min(rows.length, 20);
  let hasDate = 0;
  let hasNumber = 0;
  let hasText = 0;
  for (let r = 1; r < sampleLimit; r++) {
    const val = (rows[r] as unknown[] | undefined)?.[colIndex];
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

function parseProductivityFile(file: File): Promise<ParsedFile> {
  return import('xlsx-js-style').then((XLSX) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const allRecords: Record<string, unknown>[] = [];
        let allFields: FieldConfig[] = [];
        for (const name of workbook.SheetNames) {
          if (name.startsWith('_')) continue;
          const ws = workbook.Sheets[name];
          if (!ws || !ws['!ref']) continue;
          const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          if (rows.length < 2) continue;
          const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
          const usedNames = new Set<string>();
          const headers = rawHeaders.map((h: string, i: number) => {
            let colName = normalizeProductivityColumn(h) || `列${i + 1}`;
            if (usedNames.has(colName)) colName = `${colName}_${i + 1}`;
            usedNames.add(colName);
            return colName;
          });
          const validIndices = headers.map((h: string, i: number) => ({ h, i }));
          if (allFields.length === 0) {
            allFields = validIndices.map(({ h, i }) => ({ name: h, type: inferFieldTypeFromRows(rows, i) }));
          }
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            if (row.every((v: unknown) => v === '' || v == null || v === undefined)) continue;
            const record: Record<string, unknown> = { _sheetType: name };
            for (const { h, i } of validIndices) record[h] = row[i] ?? '';
            allRecords.push(record);
          }
        }
        if (allRecords.length === 0) {
          reject(new Error('未解析到有效数据'));
          return;
        }
        const dateField = allFields.find((f) => f.type === 'date');
        const months = extractDateMonths(allRecords, dateField?.name);
        resolve({
          file,
          module: 'productivity',
          fileName: file.name,
          rows: allRecords,
          fields: allFields,
          dateFieldName: dateField?.name,
          months,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

function extractDateMonths(records: Record<string, unknown>[], dateFieldName?: string): string[] {
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
      if (!isNaN(y) && !isNaN(m)) monthSet.add(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return Array.from(monthSet).sort();
}

// ==================== 客户资料解析 ====================
const CUSTOMER_ALIASES: Record<string, string> = {
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

/** 付费金额列名黑名单：此类列不再被导入，付费金额唯一来源为费用资料（ATP费用 sheet） */
const PAID_AMOUNT_COLUMN_NAMES = ['付费金额', '付费金额(元)', '付费金额（元）', '付费金额/元', '付费金额元'];

function isPaidAmountColumn(header: string): boolean {
  const trimmed = header.trim();
  return PAID_AMOUNT_COLUMN_NAMES.some(
    (name) => trimmed === name || trimmed.replace(/\s/g, '') === name.replace(/\s/g, ''),
  );
}

function parseCustomerFile(file: File): Promise<ParsedFile> {
  return import('xlsx-js-style').then((XLSX) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        let sheet: any = null;
        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          if (ws && ws['!ref']) { sheet = ws; break; }
        }
        if (!sheet) { reject(new Error('文件内容为空')); return; }
        const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        if (rows.length < 2) { reject(new Error('文件内容为空')); return; }
        const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
        const columnMap: Array<{ index: number; field: string }> = [];
        const extraColumns: Array<{ index: number; name: string }> = [];
        const ignoredPaidAmountColumns: string[] = [];
        rawHeaders.forEach((h: string, i: number) => {
          const mapped = CUSTOMER_ALIASES[h];
          if (mapped) columnMap.push({ index: i, field: mapped });
          else if (isPaidAmountColumn(h)) ignoredPaidAmountColumns.push(h.trim());
          else if (h) extraColumns.push({ index: i, name: h });
        });
        const codeCol = columnMap.find((c) => c.field === 'customer_code');
        if (!codeCol) { reject(new Error('未找到客户编码列')); return; }
        const nameCol = columnMap.find((c) => c.field === 'customer_name');
        const regionCol = columnMap.find((c) => c.field === 'region');
        const tierCol = columnMap.find((c) => c.field === 'tier');
        const customers = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          if (row.every((v) => v === '' || v == null)) continue;
          const code = String(row[codeCol.index] ?? '').trim();
          if (!code) continue;
          const extras: Record<string, unknown> = {};
          for (const { index, name } of extraColumns) extras[name] = row[index] ?? '';
          customers.push({
            customerCode: code,
            customerName: String(row[nameCol?.index ?? -1] ?? '').trim(),
            region: String(row[regionCol?.index ?? -1] ?? '').trim(),
            tier: String(row[tierCol?.index ?? -1] ?? '').trim(),
            extras,
          });
        }
        if (customers.length === 0) { reject(new Error('未解析到有效的客户数据')); return; }
        resolve({ file, module: 'customer', fileName: file.name, rows: customers, months: [], ignoredPaidAmountColumns });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

// ==================== 线路资料解析 ====================
const ROUTE_ALIASES: Record<string, string> = {
  '客户编码': 'customer_code',
  '客户代码': 'customer_code',
  '编码': 'customer_code',
  '客户编号': 'customer_code',
  '所属线路': 'route_name',
  '线路名称': 'route_name',
  '路线名称': 'route_name',
};

function parseRouteFile(file: File): Promise<ParsedFile> {
  return import('xlsx-js-style').then((XLSX) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        let sheet: any = null;
        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          if (ws && ws['!ref']) { sheet = ws; break; }
        }
        if (!sheet) { reject(new Error('文件内容为空')); return; }
        const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        if (rows.length < 2) { reject(new Error('文件内容为空')); return; }
        const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
        const columnMap: Array<{ index: number; field: string }> = [];
        const extraColumns: Array<{ index: number; name: string }> = [];
        rawHeaders.forEach((h: string, i: number) => {
          const mapped = ROUTE_ALIASES[h];
          if (mapped) columnMap.push({ index: i, field: mapped });
          else if (h) extraColumns.push({ index: i, name: h });
        });
        const codeCol = columnMap.find((c) => c.field === 'customer_code');
        if (!codeCol) { reject(new Error('未找到客户编码列')); return; }
        const nameCol = columnMap.find((c) => c.field === 'route_name');
        const routes = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          if (row.every((v) => v === '' || v == null)) continue;
          const code = String(row[codeCol.index] ?? '').trim();
          if (!code) continue;
          const extras: Record<string, unknown> = {};
          for (const { index, name } of extraColumns) extras[name] = row[index] ?? '';
          routes.push({
            customerCode: code,
            routeName: String(row[nameCol?.index ?? -1] ?? '').trim(),
            extras,
          });
        }
        if (routes.length === 0) { reject(new Error('未解析到有效的线路数据')); return; }
        resolve({ file, module: 'route', fileName: file.name, rows: routes, months: [] });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

// ==================== 费用资料解析 ====================
const EXPENSE_ALIASES: Record<string, string> = {
  '客户编码': 'customer_code',
  '客户代码': 'customer_code',
  '编码': 'customer_code',
  '客户编号': 'customer_code',
  '客户-通路客户编码': 'customer_code',
  '通路客户编码': 'customer_code',
  '客户名称': 'customer_name',
  '客户名': 'customer_name',
  '名称': 'customer_name',
};

function normalizeExpenseCustomerCode(code: string): string {
  const trimmed = String(code ?? '').trim();
  if (/^1201\//i.test(trimmed)) return trimmed;
  if (/^KH\d+/i.test(trimmed)) return trimmed;
  const m = trimmed.match(/^0+(\d+)$/);
  if (m) return `1201/${m[1]}`;
  return trimmed;
}

function parseExpenseFile(file: File): Promise<ParsedFile> {
  return import('xlsx-js-style').then((XLSX) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const allItems: Record<string, unknown>[] = [];
        for (const sheetName of workbook.SheetNames) {
          if (sheetName.startsWith('_')) continue;
          const ws = workbook.Sheets[sheetName];
          if (!ws || !ws['!ref']) continue;
          const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          if (rows.length < 2) continue;
          const rawHeaders = rows[0].map((v: unknown) => String(v ?? '').trim());
          const columnMap: Array<{ index: number; field: string }> = [];
          const extraColumns: Array<{ index: number; name: string }> = [];
          rawHeaders.forEach((h: string, i: number) => {
            const mapped = EXPENSE_ALIASES[h];
            if (mapped) columnMap.push({ index: i, field: mapped });
            else if (h) extraColumns.push({ index: i, name: h });
          });
          const codeCol = columnMap.find((c) => c.field === 'customer_code');
          if (!codeCol) continue;
          const nameCol = columnMap.find((c) => c.field === 'customer_name');
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            if (row.every((v) => v === '' || v == null)) continue;
            const code = String(row[codeCol.index] ?? '').trim();
            if (!code) continue;
            const extras: Record<string, unknown> = {};
            for (const { index, name } of extraColumns) extras[name] = row[index] ?? '';
            allItems.push({
              customerCode: normalizeExpenseCustomerCode(code),
              customerName: nameCol ? String(row[nameCol.index] ?? '').trim() : '',
              sheetType: sheetName,
              extras,
            });
          }
        }
        if (allItems.length === 0) { reject(new Error('未解析到有效的费用数据')); return; }
        const months = extractExpenseMonths(allItems);
        resolve({ file, module: 'expense', fileName: file.name, rows: allItems, months });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

function extractExpenseMonths(records: Record<string, unknown>[]): string[] {
  const monthSet = new Set<string>();
  for (const rec of records) {
    const raw = String(Object.values(rec.extras as Record<string, unknown> ?? {}).find((v) => /\d+月\s+\d{4}/.test(String(v))) ?? '');
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

// ==================== 文件解析入口 ====================
function parseFile(file: File, module: ModuleType): Promise<ParsedFile> {
  switch (module) {
    case 'productivity': return parseProductivityFile(file);
    case 'customer': return parseCustomerFile(file);
    case 'route': return parseRouteFile(file);
    case 'expense': return parseExpenseFile(file);
  }
}

// ==================== 上传执行 ====================
async function uploadProductivity(
  parsed: ParsedFile,
  selectedMonths: string[],
  onProgress?: (progress: number) => void,
): Promise<number> {
  const records = parsed.rows as Record<string, unknown>[];
  const dateField = parsed.dateFieldName;
  let toInsert = records;
  if (dateField && selectedMonths.length > 0 && selectedMonths.length < (parsed.months.length || 1)) {
    toInsert = records.filter((rec) => {
      const raw = String(rec[dateField] ?? '');
      if (!raw) return false;
      const normalized = raw.replace(/[./]/g, '-');
      const parts = normalized.split('-');
      if (parts.length < 2) return false;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(m)) return false;
      return selectedMonths.includes(`${y}-${String(m).padStart(2, '0')}`);
    });
  }
  // 先按月份清空旧数据，再分批追加，避免请求体过大
  const mergeRes = await datasetApi.mergeByMonths({
    name: parsed.fileName.replace(/\.xlsx$/i, ''),
    fields: parsed.fields ?? [],
    records: [],
    uploadMonths: selectedMonths,
  });
  const datasetId = String(mergeRes.id ?? mergeRes);
  const BATCH_SIZE = 500;
  const totalBatches = Math.ceil(toInsert.length / BATCH_SIZE);
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await datasetApi.appendRecords(datasetId, { records: batch });
    onProgress?.(Math.round(((Math.floor(i / BATCH_SIZE) + 1) / totalBatches) * 100));
  }
  return toInsert.length;
}

async function uploadCustomer(
  parsed: ParsedFile,
  onProgress?: (progress: number) => void,
): Promise<number> {
  const customers = parsed.rows as { customerCode: string; customerName: string; region: string; tier: string; extras: Record<string, unknown> }[];
  await customerApi.removeAllCustomers();
  await customerApi.uploadCustomers(
    { customers },
    (done, total) => onProgress?.(Math.round((done / total) * 100)),
  );
  return customers.length;
}

async function uploadRoute(
  parsed: ParsedFile,
  onProgress?: (progress: number) => void,
): Promise<number> {
  const routes = parsed.rows as { customerCode: string; routeName: string; extras: Record<string, unknown> }[];
  await routeApi.removeAllRoutes();
  await routeApi.uploadRoutes(
    { routes },
    (done, total) => onProgress?.(Math.round((done / total) * 100)),
  );
  return routes.length;
}

async function uploadExpense(
  parsed: ParsedFile,
  selectedMonths: string[],
  onProgress?: (progress: number) => void,
): Promise<number> {
  let records = parsed.rows as { customerCode: string; customerName: string; sheetType: string; extras: Record<string, unknown> }[];
  if (selectedMonths.length > 0 && selectedMonths.length < (parsed.months.length || 1)) {
    records = records.filter((rec) => {
      const raw = String(Object.values(rec.extras).find((v) => /\d+月\s+\d{4}/.test(String(v))) ?? '');
      if (!raw) return false;
      const match = raw.match(/(\d+)月\s+(\d{4})/);
      if (!match) return false;
      const m = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      return selectedMonths.includes(`${y}-${String(m).padStart(2, '0')}`);
    });
  }
  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);
  let totalProcessed = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const isFirst = i === 0;
    const result = isFirst
      ? await expenseApi.overwriteExpenses(batch, selectedMonths)
      : await expenseApi.uploadExpenses(batch, selectedMonths);
    totalProcessed += result.inserted + result.updated;
    onProgress?.(Math.round(((Math.floor(i / BATCH_SIZE) + 1) / totalBatches) * 100));
  }
  return totalProcessed;
}

// ==================== 组件 ====================
interface QuickUploadProps {
  onUploadComplete?: () => void;
}

const QuickUpload: React.FC<QuickUploadProps> = ({ onUploadComplete }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groups, setGroups] = useState<ModuleGroup[]>([]);
  const [importing, setImporting] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorFiles, setErrorFiles] = useState<string[]>([]);
  const [isUploadHover, setIsUploadHover] = useState(false);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      const datasets = await datasetApi.getDatasets({ page: 1, pageSize: 1000 });
      await Promise.all(
        datasets.items.map(async (ds) => {
          try {
            await datasetApi.deleteDataset(ds.id);
          } catch (e: any) {
            if (e?.response?.status !== 404) throw e;
          }
        }),
      );
      await Promise.all([
        customerApi.removeAllCustomers(),
        routeApi.removeAllRoutes(),
        expenseApi.removeAllExpenses(),
      ]);
      toast.success('所有上传数据已清空');
      onUploadComplete?.();
    } catch (err) {
      const detail = err instanceof Error ? err.message : '清空失败，请重试';
      toast.error(`清空数据失败：${detail}`);
    } finally {
      setClearing(false);
    }
  }, [onUploadComplete]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const parsedFiles: ParsedFile[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const module = detectModule(file.name);
      if (!module) {
        errors.push(`${file.name}：文件名不符合规则`);
        continue;
      }
      try {
        const parsed = await parseFile(file, module);
        parsedFiles.push(parsed);
      } catch (e) {
        errors.push(`${file.name}：${e instanceof Error ? e.message : '解析失败'}`);
      }
    }

    if (parsedFiles.length === 0) {
      toast.error(errors.join('\n'));
      event.target.value = '';
      return;
    }

    const grouped = new Map<ModuleType, ModuleGroup>();
    for (const parsed of parsedFiles) {
      const existing = grouped.get(parsed.module);
      if (existing) {
        existing.files.push(parsed);
        existing.rowCount += parsed.rows.length;
        for (const m of parsed.months) {
          if (!existing.months.includes(m)) existing.months.push(m);
        }
      } else {
        grouped.set(parsed.module, {
          module: parsed.module,
          files: [parsed],
          months: [...parsed.months],
          selectedMonths: [...parsed.months],
          rowCount: parsed.rows.length,
        });
      }
    }

    // 每个模块默认全选月份
    for (const g of grouped.values()) {
      g.months.sort();
      g.selectedMonths = [...g.months];
    }

    setGroups(Array.from(grouped.values()));
    setErrorFiles(errors);
    setDialogOpen(true);
    event.target.value = '';

    // 付费金额列校验：被过滤的列需明确告知用户，付费金额统一以费用资料（ATP费用）为准
    const paidAmountFiles = parsedFiles.filter(
      (p) => (p.ignoredPaidAmountColumns?.length ?? 0) > 0,
    );
    if (paidAmountFiles.length > 0) {
      const names = paidAmountFiles
        .flatMap((p) => p.ignoredPaidAmountColumns ?? [])
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join('、');
      toast.warning(
        `已忽略「${names}」列：付费金额不再从客户资料导入，统一以费用资料（ATP费用）为准`,
        { duration: 6000 },
      );
    }
  }, []);

  const toggleMonth = (moduleIndex: number, month: string) => {
    setGroups((prev) => {
      const next = [...prev];
      const g = next[moduleIndex];
      if (g.selectedMonths.includes(month)) {
        g.selectedMonths = g.selectedMonths.filter((m) => m !== month);
      } else {
        g.selectedMonths = [...g.selectedMonths, month].sort();
      }
      return next;
    });
  };

  const selectAllMonths = (moduleIndex: number) => {
    setGroups((prev) => {
      const next = [...prev];
      next[moduleIndex].selectedMonths = [...next[moduleIndex].months];
      return next;
    });
  };

  const clearMonths = (moduleIndex: number) => {
    setGroups((prev) => {
      const next = [...prev];
      next[moduleIndex].selectedMonths = [];
      return next;
    });
  };

  const handleImport = async () => {
    if (groups.length === 0) return;
    if (groups.some((g) => g.months.length > 0 && g.selectedMonths.length === 0)) {
      toast.error('请为每个模块至少选择一个月份');
      return;
    }
    setImporting(true);
    setOverallProgress(0);
    try {
      const totalGroups = groups.length;
      let totalRows = 0;
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const meta = MODULES.find((m) => m.key === group.module)!;
        let rows = 0;
        const totalFiles = group.files.length;
        for (let fi = 0; fi < group.files.length; fi++) {
          const file = group.files[fi];
          const progressCb = (p: number) => {
            const groupBase = gi / totalGroups;
            const fileShare = (fi + p / 100) / totalFiles;
            const groupShare = fileShare * (1 / totalGroups);
            setOverallProgress(Math.round((groupBase + groupShare) * 100));
          };
          if (group.module === 'productivity') {
            rows += await uploadProductivity(file, group.selectedMonths, progressCb);
          } else if (group.module === 'customer') {
            rows += await uploadCustomer(file, progressCb);
          } else if (group.module === 'route') {
            rows += await uploadRoute(file, progressCb);
          } else if (group.module === 'expense') {
            rows += await uploadExpense(file, group.selectedMonths, progressCb);
          }
        }
        totalRows += rows;
        toast.success(`${meta.name} 导入完成：${rows.toLocaleString()} 条`);
      }
      setOverallProgress(100);
      toast.success(`全部导入完成，共 ${totalRows.toLocaleString()} 条`);
      setDialogOpen(false);
      setGroups([]);
      onUploadComplete?.();
    } catch (e) {
      const detail = extractApiError(e);
      toast.error(`导入失败：${detail}`, { duration: 8000 });
    } finally {
      setImporting(false);
      setOverallProgress(0);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center text-base leading-none text-primary" >⚡</span>
            <h3 className="text-sm font-medium text-foreground">快捷上传</h3>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="hover:!bg-destructive hover:!text-destructive-foreground hover:!border-destructive"
              onClick={handleClearAll}
              disabled={clearing}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >🗑️</span>
              {clearing ? '清空中...' : '清空数据'}
            </Button>
            <Button
              size="sm"
              className="hover:!bg-success hover:!text-success-foreground hover:!border-success"
              onMouseEnter={() => setIsUploadHover(true)}
              onMouseLeave={() => setIsUploadHover(false)}
              onClick={() => inputRef.current?.click()}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬆️</span>
              批量上传
            </Button>
          </div>
        </div>
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 text-xs transition-all duration-150 ease-out',
            isUploadHover
              ? 'scale-[1.02] text-destructive'
              : 'text-foreground',
          )}
        >
          <span className="inline-flex items-center justify-center text-base leading-none" >ℹ️</span>
          <span>
            支持同时上传多个文件，文件名需以“数据模板-生产力数据/客户资料/线路资料/费用资料”开头
          </span>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !importing && setDialogOpen(open)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center text-base leading-none text-success" >✅</span>
              确认批量导入（将覆盖原有资料）
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {groups.map((group, gi) => {
              const meta = MODULES.find((m) => m.key === group.module)!;
              return (
                <div key={group.module} className="rounded-sm border border-border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className={`size-2 rounded-full ${meta.color}`} />
                    <span className="text-sm font-medium text-foreground">{meta.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.files.length} 个文件 · {group.rowCount.toLocaleString()} 条数据
                    </span>
                  </div>
                  <div className="mb-2 space-y-1">
                    {group.files.map((f) => (
                      <div key={f.fileName} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="inline-flex items-center justify-center text-base leading-none text-muted-foreground" >📑</span>
                        <span>{f.fileName}</span>
                        {f.months.length > 0 && (
                          <span className="text-muted-foreground">
                            （检测到 {f.months.length} 个月份）
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {group.months.length > 0 && (
                    <div className="rounded-sm bg-accent/30 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">选择上传月份</span>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => selectAllMonths(gi)}>
                            全选
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => clearMonths(gi)}>
                            清空
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.months.map((month) => (
                          <label
                            key={month}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs cursor-pointer hover-elevate"
                          >
                            <input
                              type="checkbox"
                              checked={group.selectedMonths.includes(month)}
                              onChange={() => toggleMonth(gi, month)}
                              className="rounded-sm border-border"
                            />
                            <span className="font-mono">{month}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {errorFiles.length > 0 && (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <p className="mb-1 font-medium">以下文件未识别：</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {errorFiles.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {importing && (
              <div className="relative h-8 w-full overflow-hidden rounded-md bg-primary/20">
                <div
                  className="absolute inset-0 bg-primary/40"
                  style={{
                    width: `${overallProgress}%`,
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    backgroundSize: '200% 100%',
                    backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  }}
                />
                <span className="relative flex h-full items-center justify-center text-xs font-medium text-primary-foreground">
                  导入中 {overallProgress}%
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={importing}>
                取消
              </Button>
              <Button size="sm" onClick={handleImport} disabled={importing}>
                确认覆盖导入
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuickUpload;
