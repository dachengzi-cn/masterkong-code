import { useState, useEffect, useCallback, useRef } from 'react';
import { customerApi } from '@client/src/api/index';
import { toast } from 'sonner';
import type { CustomerSummary } from '@shared/api.interface';
import CustomerUpload from './CustomerUpload';
import CustomerClassification from './CustomerClassification';

const CustomerPage = () => {
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await customerApi.getCustomerSummary();
      setSummary(data);
    } catch {
      toast.error('获取客户统计失败');
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  const handleRefresh = (_fileName?: string, _rowCount?: number) => {
    setRefreshKey((k: number) => k + 1);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <CustomerUpload ref={fileInputRef} onUploadSuccess={handleRefresh} />
      <CustomerClassification />
    </div>
  );
};

export default CustomerPage;
