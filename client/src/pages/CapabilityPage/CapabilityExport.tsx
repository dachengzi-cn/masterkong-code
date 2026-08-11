import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { exportCapabilityReport } from '@/api/capability';
import type { CapabilityExportParams } from '@shared/api.interface';

interface CapabilityExportProps {
  params: CapabilityExportParams;
  disabled?: boolean;
}

const CapabilityExport: React.FC<CapabilityExportProps> = ({
  params,
  disabled = false,
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCapabilityReport(params);
      toast.success('评估报告已导出');
    } catch (err: unknown) {
      toast.error(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || exporting}
      className="h-8"
    >
      {exporting ? '导出中…' : '导出报告'}
    </Button>
  );
};

export default CapabilityExport;
