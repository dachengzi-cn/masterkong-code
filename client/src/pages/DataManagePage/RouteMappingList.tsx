import { useState, useEffect, useCallback } from 'react';

import { routeMappingApi } from '@client/src/api/index';
import { toast } from 'sonner';
import type { RouteMappingItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

interface RouteMappingListProps {
  refreshKey: number;
}

const RouteMappingList: React.FC<RouteMappingListProps> = ({ refreshKey }) => {
  const [items, setItems] = useState<RouteMappingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await routeMappingApi.getRouteMappings({ page, pageSize });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      toast.error('获取线路映射失败');
    } finally {
      setLoading(false);
    }
  }, [page, refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await routeMappingApi.deleteRouteMapping(id);
      toast.success('删除成功');
      fetchData();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="rounded-sm border border-border bg-card p-5">

      {loading ? (
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="emoji">🗺️</EmptyMedia>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">暂无线路映射数据</EmptyTitle>
              <EmptyDescription className="text-xs">请下载模板并上传</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="mb-3 text-xs text-muted-foreground">
            共 {total} 条记录
          </div>
          <div className="max-h-[400px] overflow-auto rounded-sm border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-accent/50">
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">门店编码</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">线路编码</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">线路名称</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-foreground">创建时间</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-foreground">{item.customerCode}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-foreground">{item.routeCode}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{item.routeName || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-muted-foreground hover:text-error"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                      >
                        <span className="inline-flex items-center justify-center text-base leading-none" >🗑️</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>第 {page} / {totalPages} 页</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RouteMappingList;
