import { useState, useEffect, useCallback } from 'react';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { customerApi } from '@client/src/api/index';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { CustomerProfile } from '@shared/api.interface';

interface CustomerListProps {
  refreshKey?: number;
  onRefresh?: () => void;
}

const CustomerList: React.FC<CustomerListProps> = ({ refreshKey, onRefresh }) => {
  const [items, setItems] = useState<CustomerProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearing, setClearing] = useState(false);
  const pageSize = 20;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customerApi.getCustomers({ page, pageSize, keyword: keyword || undefined });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast.error('获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  const handleSearch = () => {
    setPage(1);
    fetchList();
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await customerApi.removeAllCustomers();
      toast.success('已清空所有客户资料');
      setShowClearDialog(false);
      setKeyword('');
      setPage(1);
      onRefresh?.();
    } catch {
      toast.error('清空失败');
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          客户列表
          {total > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {total} 条
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="搜索编码/名称"
              value={keyword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleSearch();
              }}
              className="h-8 w-44 text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleSearch}>
              <span className="inline-flex items-center justify-center text-base leading-none" >🔍</span>
            </Button>
          </div>
          {total > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setShowClearDialog(true)}
            >
              <span className="inline-flex items-center justify-center text-base leading-none mr-1" >🗑️</span>
              清空
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🔍</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">
                {keyword ? '未找到匹配的客户' : '暂无客户数据'}
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                {keyword ? '请尝试更换搜索关键词' : '请上传客户资料'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-accent/30">
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    客户编码
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    客户名称
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    区域
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    层级
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: CustomerProfile, i: number) => (
                  <tr
                    key={`${item.customerCode}-${i}`}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-foreground">
                      {item.customerCode}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {item.customerName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground">
                      {item.region}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground">
                      {item.tier}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                第 {page} / {totalPages} 页
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p: number) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p: number) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center text-base leading-none text-destructive" >⚠️</span>
              确认清空客户资料
            </DialogTitle>
            <DialogDescription>
              此操作将删除所有客户资料数据，共 {total} 条。已上传的数据集不受影响，但客户维度分析将不可用。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={clearing}
            >
              {clearing ? '清空中...' : '确认清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerList;
