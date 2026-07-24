import { useState, useRef, useEffect, useCallback } from 'react';
import DatasetList from '../HomePage/DatasetList';
import RouteMappingList from './RouteMappingList';
import RouteMappingUpload, { DownloadRouteTemplateButton } from './RouteMappingUpload';
import CustomerUpload, { DownloadTemplateButton } from '../CustomerPage/CustomerUpload';
import RouteUpload, { DownloadRouteTemplateButton as DownloadRouteProfileTemplateButton } from './RouteUpload';
import ExpenseUpload, { DownloadExpenseTemplateButton } from './ExpenseUpload';
import QuickCustom from './QuickCustom';
import QuickUpload from './QuickUpload';

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
import { toast } from 'sonner';
import { customerApi, routeApi, expenseApi } from '@client/src/api/index';
import { useNavigate } from 'react-router-dom';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

interface UploadRecord {
  id: string;
  fileName: string;
  uploadTime: string;
  rowCount: number;
}

const EmptyState: React.FC = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="emoji">📊</EmptyMedia>
      <EmptyTitle>暂无数据集</EmptyTitle>
      <EmptyDescription>请先在数据管理页上传并解析数据集</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const DataManagePage = () => {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);
  const [customerRefreshKey, setCustomerRefreshKey] = useState(0);
  const [uploadRecord, setUploadRecord] = useState<UploadRecord | null>(null);

  useEffect(() => {
    customerApi.getLatestUploadRecord().then((record) => {
      if (record) {
        setUploadRecord({
          id: 'current',
          fileName: record.fileName,
          uploadTime: record.uploadTime,
          rowCount: record.rowCount,
        });
      }
    });
  }, [customerRefreshKey]);
  const routeFileInputRef = useRef<HTMLInputElement>(null);
  const customerFileInputRef = useRef<HTMLInputElement>(null);

  const refreshSystemStatus = () => {
    window.dispatchEvent(new CustomEvent('system-status-refresh'));
  };

  const handleImportSuccess = () => {
    setRefreshKey((prev) => prev + 1);
    refreshSystemStatus();
  };

  const handleRouteUploadSuccess = () => {
    setRouteRefreshKey((prev) => prev + 1);
    refreshSystemStatus();
  };

  const handleCustomerUploadSuccess = (fileName: string, rowCount: number) => {
    setCustomerRefreshKey((prev) => prev + 1);
    setUploadRecord({
      id: Date.now().toString(),
      fileName,
      uploadTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      rowCount,
    });
    refreshSystemStatus();
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [routeUploadRecord, setRouteUploadRecord] = useState<UploadRecord | null>(null);
  const [routeDeleteConfirmOpen, setRouteDeleteConfirmOpen] = useState(false);
  const [routeDeleting, setRouteDeleting] = useState(false);
  const routeProfileFileInputRef = useRef<HTMLInputElement>(null);

  // Importing state for customer module
  const [customerImporting, setCustomerImporting] = useState(false);
  const [customerImportProgress, setCustomerImportProgress] = useState(0);
  const customerCancelRef = useRef<(() => void) | null>(null);

  // Importing state for route module
  const [routeImporting, setRouteImporting] = useState(false);
  const [routeImportProgress, setRouteImportProgress] = useState(0);
  const routeCancelRef = useRef<(() => void) | null>(null);

  // 费用资料模块状态
  const [expenseUploadRecord, setExpenseUploadRecord] = useState<UploadRecord | null>(null);
  const [expenseDeleteConfirmOpen, setExpenseDeleteConfirmOpen] = useState(false);
  const [expenseDeleting, setExpenseDeleting] = useState(false);
  const expenseFileInputRef = useRef<HTMLInputElement>(null);
  const [expenseImporting, setExpenseImporting] = useState(false);
  const [expenseImportProgress, setExpenseImportProgress] = useState(0);
  const expenseCancelRef = useRef<(() => void) | null>(null);

  const handleCustomerImportingChange = useCallback((importing: boolean, progress: number, cancelFn: (() => void) | null) => {
    setCustomerImporting(importing);
    setCustomerImportProgress(progress);
    customerCancelRef.current = cancelFn;
  }, []);

  const handleRouteImportingChange = useCallback((importing: boolean, progress: number, cancelFn: (() => void) | null) => {
    setRouteImporting(importing);
    setRouteImportProgress(progress);
    routeCancelRef.current = cancelFn;
  }, []);

  const handleCancelCustomerImport = useCallback(() => {
    customerCancelRef.current?.();
  }, []);

  const handleCancelRouteImport = useCallback(() => {
    routeCancelRef.current?.();
  }, []);

  const handleExpenseImportingChange = useCallback((importing: boolean, progress: number, cancelFn: (() => void) | null) => {
    setExpenseImporting(importing);
    setExpenseImportProgress(progress);
    expenseCancelRef.current = cancelFn;
  }, []);

  const handleCancelExpenseImport = useCallback(() => {
    expenseCancelRef.current?.();
  }, []);

  const loadAllRecords = useCallback(() => {
    routeApi.getLatestUploadRecord().then((record) => {
      if (record) {
        setRouteUploadRecord({
          id: 'current',
          fileName: record.fileName,
          uploadTime: record.uploadTime,
          rowCount: record.rowCount,
        });
      }
    });

    expenseApi.getExpenseUploadRecord().then((record) => {
      if (record) {
        setExpenseUploadRecord({
          id: 'current',
          fileName: record.fileName,
          uploadTime: record.uploadTime,
          rowCount: record.rowCount,
        });
      }
    });
  }, []);

  useEffect(() => {
    loadAllRecords();
  }, [loadAllRecords]);

  const handleDeleteRecord = async () => {
    setDeleting(true);
    try {
      await customerApi.removeAllCustomers();
      setUploadRecord(null);
      setCustomerRefreshKey((prev) => prev + 1);
      toast.success('客户资料已清空');
    } catch {
      toast.error('清空失败，请重试');
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleRouteProfileUploadSuccess = (fileName: string, rowCount: number) => {
    setRouteUploadRecord({
      id: Date.now().toString(),
      fileName,
      uploadTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      rowCount,
    });
    refreshSystemStatus();
  };

  const handleDeleteRouteRecord = async () => {
    setRouteDeleting(true);
    try {
      await routeApi.removeAllRoutes();
      setRouteUploadRecord(null);
      toast.success('线路资料已清空');
    } catch {
      toast.error('清空失败，请重试');
    } finally {
      setRouteDeleting(false);
      setRouteDeleteConfirmOpen(false);
    }
  };

  const handleExpenseUploadSuccess = (fileName: string, rowCount: number) => {
    setExpenseUploadRecord({
      id: Date.now().toString(),
      fileName,
      uploadTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      rowCount,
    });
    refreshSystemStatus();
  };

  const handleDeleteExpenseRecord = async () => {
    setExpenseDeleting(true);
    try {
      await expenseApi.removeAllExpenses();
      setExpenseUploadRecord(null);
      toast.success('费用资料已清空');
    } catch {
      toast.error('清空失败，请重试');
    } finally {
      setExpenseDeleting(false);
      setExpenseDeleteConfirmOpen(false);
    }
  };

  const customerColumns: TableProps<UploadRecord>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      fixed: 'left',
      width: 200,
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      width: 180,
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
      width: 100,
      render: () => (
        <Badge className="px-2 py-0.5 text-xs font-medium">已解析</Badge>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: () => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-primary"
            onClick={() => navigate('/customers')}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >📊</span>
            查看分析
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
            删除
          </Button>
        </div>
      ),
    },
  ];

  const isValidUploadRecord = (record: UploadRecord | null) =>
    !!record && !!record.fileName && record.rowCount > 0;

  const customerData = isValidUploadRecord(uploadRecord) ? [uploadRecord!] : [];
  const routeData = isValidUploadRecord(routeUploadRecord) ? [routeUploadRecord!] : [];
  const expenseData = isValidUploadRecord(expenseUploadRecord) ? [expenseUploadRecord!] : [];

  const expenseColumns: TableProps<UploadRecord>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      fixed: 'left',
      width: 200,
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      width: 180,
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
      width: 100,
      render: () => (
        <Badge className="px-2 py-0.5 text-xs font-medium">已解析</Badge>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: () => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive"
            onClick={() => setExpenseDeleteConfirmOpen(true)}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
            删除
          </Button>
        </div>
      ),
    },
  ];

  const routeColumns: TableProps<UploadRecord>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      fixed: 'left',
      width: 200,
      ellipsis: true,
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      width: 180,
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
      width: 100,
      render: () => (
        <Badge className="px-2 py-0.5 text-xs font-medium">已解析</Badge>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: () => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive"
            onClick={() => setRouteDeleteConfirmOpen(true)}
          >
            <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
            删除
          </Button>
        </div>
      ),
    },
  ];

  const handleQuickUploadComplete = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    loadAllRecords();
    window.location.reload();
  }, [loadAllRecords]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <QuickUpload onUploadComplete={handleQuickUploadComplete} />

      <DatasetList refreshKey={refreshKey} onImportSuccess={handleImportSuccess} />

      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">客户资料</h3>
          <div className="flex gap-2">
            {customerImporting ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancelCustomerImport}>
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
                    导入中 {customerImportProgress}%
                  </span>
                </div>
              </div>
            ) : (
              <>
                <DownloadTemplateButton size="sm" />
                <Button
                  size="sm"
                  onClick={() => customerFileInputRef.current?.click()}
                >
                  <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬆️</span>
                  上传资料
                </Button>
              </>
            )}
          </div>
        </div>

        <CustomerUpload
          ref={customerFileInputRef}
          onUploadSuccess={handleCustomerUploadSuccess}
          onImportingChange={handleCustomerImportingChange}
        />

        {customerData.length === 0 ? (
          <EmptyState />
        ) : (
          <Table
            columns={customerColumns}
            dataSource={customerData}
            rowKey="id"
            scroll={{ x: 700, y: 500 }}
            pagination={false}
          />
        )}

        <Dialog
          open={deleteConfirmOpen}
          onOpenChange={(open: boolean) => {
            if (!open) setDeleteConfirmOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                删除后数据将无法恢复，确定要删除该客户资料吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteRecord}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">线路资料</h3>
          <div className="flex gap-2">
            {routeImporting ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancelRouteImport}>
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
                    导入中 {routeImportProgress}%
                  </span>
                </div>
              </div>
            ) : (
              <>
                <DownloadRouteProfileTemplateButton size="sm" />
                <Button
                  size="sm"
                  onClick={() => routeProfileFileInputRef.current?.click()}
                >
                  <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬆️</span>
                  上传资料
                </Button>
              </>
            )}
          </div>
        </div>

        <RouteUpload
          ref={routeProfileFileInputRef}
          onUploadSuccess={handleRouteProfileUploadSuccess}
          onImportingChange={handleRouteImportingChange}
        />

        {routeData.length === 0 ? (
          <EmptyState />
        ) : (
          <Table
            columns={routeColumns}
            dataSource={routeData}
            rowKey="id"
            scroll={{ x: 700, y: 500 }}
            pagination={false}
          />
        )}

        <Dialog
          open={routeDeleteConfirmOpen}
          onOpenChange={(open: boolean) => {
            if (!open) setRouteDeleteConfirmOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                删除后数据将无法恢复，确定要删除该线路资料吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRouteDeleteConfirmOpen(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteRouteRecord}
                disabled={routeDeleting}
              >
                {routeDeleting ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 费用资料模块 */}
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">费用资料</h3>
          <div className="flex gap-2">
            {expenseImporting ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancelExpenseImport}>
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
                    导入中 {expenseImportProgress}%
                  </span>
                </div>
              </div>
            ) : (
              <>
                <DownloadExpenseTemplateButton size="sm" />
                <Button
                  size="sm"
                  onClick={() => expenseFileInputRef.current?.click()}
                >
                  <span className="inline-flex items-center justify-center text-base leading-none mr-1" >⬆️</span>
                  上传资料
                </Button>
              </>
            )}
          </div>
        </div>

        <ExpenseUpload
          ref={expenseFileInputRef}
          onUploadSuccess={handleExpenseUploadSuccess}
          onImportingChange={handleExpenseImportingChange}
        />

        {expenseData.length === 0 ? (
          <EmptyState />
        ) : (
          <Table
            columns={expenseColumns}
            dataSource={expenseData}
            rowKey="id"
            scroll={{ x: 700, y: 500 }}
            pagination={false}
          />
        )}

        <Dialog
          open={expenseDeleteConfirmOpen}
          onOpenChange={(open: boolean) => {
            if (!open) setExpenseDeleteConfirmOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                删除后数据将无法恢复，确定要删除该费用资料吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpenseDeleteConfirmOpen(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteExpenseRecord}
                disabled={expenseDeleting}
              >
                {expenseDeleting ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 快捷自定义模块 */}
      <QuickCustom />

      {/* 线路映射模块暂时隐藏 */}
      {/* <div className="space-y-4">
        <div className="rounded-sm border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">线路映射</h3>
            <div className="flex items-center gap-2">
              <DownloadRouteTemplateButton size="sm" />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground border border-primary-border hover-elevate active-elevate-2 min-h-8"
                onClick={() => routeFileInputRef.current?.click()}
              >
                <span className="inline-flex items-center justify-center text-base leading-none" >⬆️</span>
                上传线路数据
              </button>
            </div>
          </div>
          <RouteMappingList refreshKey={routeRefreshKey} />
        </div>
        <RouteMappingUpload ref={routeFileInputRef} onUploadSuccess={handleRouteUploadSuccess} />
      </div> */}
    </div>
  );
};

export default DataManagePage;
