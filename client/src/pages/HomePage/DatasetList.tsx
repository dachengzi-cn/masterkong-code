import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Table, TableProps } from '@lark-apaas/client-toolkit/antd-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { datasetApi } from '@client/src/api/index';
import type { DatasetListItem } from '@shared/api.interface';
import { DownloadTemplateButton } from './TemplateDownload';
import FileUpload from './FileUpload';

interface DatasetListProps {
  refreshKey: number;
  onImportSuccess?: () => void;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' }
> = {
  parsed: { label: '已解析', variant: 'default' },
  pending: { label: '解析中', variant: 'secondary' },
  failed: { label: '解析失败', variant: 'destructive' },
};

const DatasetList: React.FC<DatasetListProps> = ({ refreshKey, onImportSuccess }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<DatasetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await datasetApi.getDatasets({ page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await datasetApi.deleteDataset(deleteId);
      setDeleteId(null);
      fetchData();
    } catch {
      /* error handled silently, user can retry */
    } finally {
      setDeleting(false);
    }
  };

  const handleImportingChange = useCallback((isImporting: boolean, progress: string, cancelFn: (() => void) | null) => {
    setImporting(isImporting);
    setImportProgress(progress);
    cancelRef.current = cancelFn;
  }, []);

  const handleCancelImport = useCallback(() => {
    cancelRef.current?.();
  }, []);

  const columns: TableProps<DatasetListItem>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'name',
      fixed: 'left',
      width: 200,
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => {
        if (!v) return '-';
        return new Date(v).toLocaleString('zh-CN');
      },
    },
    {
      title: '数据行数',
      dataIndex: 'rowCount',
      width: 120,
      render: (v: number) => (
        <span className="font-mono">{v?.toLocaleString() ?? '-'}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] ?? {
          label: s,
          variant: 'secondary' as const,
        };
        return (
          <Badge
            variant={cfg.variant}
            className="px-2 py-0.5 text-xs font-medium"
          >
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: (_: unknown, record: DatasetListItem) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-primary"
            onClick={() => navigate(`/dashboard/cumulative/${String(record.id)}`)}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >📊</span>
            查看分析
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive"
            onClick={() => setDeleteId(String(record.id))}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">生产力数据</h3>
        <div className="flex gap-2">
          {importing ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelImport}>
                取消
              </Button>
              <div className="relative min-w-[140px] h-8 rounded-md overflow-hidden bg-primary/20 flex items-center px-3">
                <div
                  className="absolute inset-0 bg-primary/40"
                  style={{
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    backgroundSize: '200% 100%',
                    backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  }}
                />
                <span className="relative text-xs font-medium text-primary-foreground">
                  导入中 {importProgress}
                </span>
              </div>
            </div>
          ) : (
            <>
              <DownloadTemplateButton size="sm" />
              {onImportSuccess && <FileUpload onImportSuccess={onImportSuccess} onImportingChange={handleImportingChange} />}
            </>
          )}
        </div>
      </div>
      {data.length === 0 && !loading ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="emoji">🗄️</EmptyMedia>
            <EmptyTitle>暂无数据集</EmptyTitle>
            <EmptyDescription>
              下载模板并上传数据后，数据集将显示在此处
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          scroll={{ x: 700, y: 500 }}
          pagination={false}
        />
      )}

      <Dialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后数据将无法恢复，确定要删除该数据集吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DatasetList;
