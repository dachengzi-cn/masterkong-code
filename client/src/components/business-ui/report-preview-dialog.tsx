"use client"

import * as React from "react"
import { FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchReportWorkbook,
  type ReportWorkbookPreview,
} from "@/api/report"
import type { ReportRecord } from "@shared/api.interface"

interface ReportPreviewDialogProps {
  report: ReportRecord | null;
  onClose: () => void;
}

/**
 * 报表在线预览弹窗。
 *
 * 报表文件为 xlsx，浏览器不支持直接内联渲染，因此由 fetchReportWorkbook
 * 在前端解析为 HTML 表格后展示，支持多 Sheet 切换。
 */
export function ReportPreviewDialog({ report, onClose }: ReportPreviewDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<ReportWorkbookPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activeSheet, setActiveSheet] = React.useState(0);

  React.useEffect(() => {
    if (!report) return;
    setLoading(true);
    setError(null);
    setData(null);
    setActiveSheet(0);
    fetchReportWorkbook(report)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [report]);

  const sheets = data?.sheets ?? [];
  const html = sheets[activeSheet]?.html ?? '';

  return (
    <Dialog
      open={!!report}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-3 p-4 overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="size-4 shrink-0 text-primary" />
            <span className="truncate">{report?.title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {report?.fileName}
            {data && ` · 共 ${sheets.length} 个 Sheet`}
          </DialogDescription>
        </DialogHeader>

        {data && sheets.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {sheets.map((sheet, idx) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => setActiveSheet(idx)}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors duration-150 ${
                  idx === activeSheet
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:bg-accent/70'
                }`}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[240px] flex-1 overflow-auto rounded-sm border border-border bg-card">
          {loading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在解析报表…
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <TriangleAlert className="size-5 text-error" />
              <div className="text-sm text-foreground">报表预览失败</div>
              <div className="max-w-full break-words text-xs text-muted-foreground">{error}</div>
            </div>
          ) : html ? (
            <div
              className="report-preview-table"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center text-xs text-muted-foreground">
              该 Sheet 无内容
            </div>
          )}
        </div>

        {data && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={onClose}
            >
              关闭
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
