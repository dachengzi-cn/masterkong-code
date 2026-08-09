"use client"

import * as React from "react"
import { Download, Eye, Trash2, FileSpreadsheet, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  deleteAllReports,
  deleteReport,
  downloadReportFile,
  getReports,
  REPORT_LIST_CHANGED_EVENT,
} from "@/api/report"
import type { ReportRecord } from "@shared/api.interface"
import { ReportPreviewDialog } from "./report-preview-dialog"

const REPORT_TYPE_LABELS: Record<string, string> = {
  "service-analysis": "服务点数分析",
  "expiry-analysis": "临期费用分析",
  "expiry-ranking": "临期费用排行",
  "expiry-drilldown": "临期门店明细",
  overstock: "差异门店分析",
  unconverted: "未成交门店明细",
  atp: "ATP绩效",
  "sales-rep-heatmap": "业代成交率",
  "brand-spec": "品牌规格占比",
  general: "报表",
}

function getTypeLabel(type: string): string {
  return REPORT_TYPE_LABELS[type] ?? type
}

function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

export function ReportDownloadButton() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ReportRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deletingAll, setDeletingAll] = React.useState(false);
  const [previewReport, setPreviewReport] = React.useState<ReportRecord | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReports({ page: 1, pageSize: 20 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error("加载报表列表失败", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 报表列表变化（生成/删除）时刷新
  React.useEffect(() => {
    const handler = () => {
      if (open) refresh();
    };
    window.addEventListener(REPORT_LIST_CHANGED_EVENT, handler);
    return () => window.removeEventListener(REPORT_LIST_CHANGED_EVENT, handler);
  }, [open, refresh]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) refresh();
    },
    [refresh],
  );

  const handleDownload = React.useCallback(async (report: ReportRecord) => {
    setBusyId(report.id);
    try {
      await downloadReportFile(report);
      toast.success(`报表已下载：${report.title}`);
    } catch (err) {
      toast.error(`下载失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handlePreview = React.useCallback((report: ReportRecord) => {
    // 在线查看：打开解析后的弹窗预览（浏览器不支持 xlsx 内联渲染）
    setPreviewReport(report);
  }, []);

  const handleDelete = React.useCallback(
    async (report: ReportRecord) => {
      if (!window.confirm(`确定删除报表「${report.title}」吗？删除后不可恢复。`)) return;
      setBusyId(report.id);
      try {
        await deleteReport(report.id);
        toast.success("报表已删除");
        refresh();
      } catch (err) {
        toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handleDeleteAll = React.useCallback(async () => {
    if (!total) return;
    if (!window.confirm(`确定删除我的全部 ${total} 份报表吗？删除后不可恢复。`)) return;
    setDeletingAll(true);
    try {
      const res = await deleteAllReports();
      toast.success(`已删除 ${res.deletedCount} 份报表`);
      refresh();
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingAll(false);
    }
  }, [refresh, total]);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full relative"
          aria-label="报表下载"
          title="报表下载"
        >
          <Download className="size-4" />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[340px] p-0"
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="size-4 text-primary" />
            报表下载
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {total > 0 && (
              <span className="text-xs font-normal text-muted-foreground">共 {total} 份</span>
            )}
            {total > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDeleteAll}
                disabled={deletingAll || loading}
                title="删除全部报表"
              >
                {deletingAll ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span className="ml-1">删除我的</span>
              </Button>
            )}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[380px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              暂无生成的报表
              <div className="mt-1">点击页面上的导出按钮即可生成</div>
            </div>
          ) : (
            items.map((report) => (
              <div
                key={report.id}
                className="group flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="break-words whitespace-normal text-sm leading-snug text-foreground">
                    {report.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-accent px-1.5 py-px text-[11px]">
                      {getTypeLabel(report.type)}
                    </span>
                    <span>{formatTime(report.createdAt)}</span>
                    <span>{formatFileSize(report.fileSize)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 self-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handlePreview(report)}
                    disabled={busyId === report.id}
                    title="在线查看"
                    aria-label={`查看 ${report.title}`}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handleDownload(report)}
                    disabled={busyId === report.id}
                    title="下载"
                    aria-label={`下载 ${report.title}`}
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(report)}
                    disabled={busyId === report.id}
                    title="删除"
                    aria-label={`删除 ${report.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
      <ReportPreviewDialog
        report={previewReport}
        onClose={() => setPreviewReport(null)}
      />
    </DropdownMenu>
  );
}
