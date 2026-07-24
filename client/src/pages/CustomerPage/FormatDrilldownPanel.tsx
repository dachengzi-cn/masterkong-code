
import type { FormatDrilldownResponse } from '@shared/api.interface';

interface FormatDrilldownPanelProps {
  region: string;
  data: FormatDrilldownResponse | null;
  loading: boolean;
  onClose: () => void;
}

const FormatDrilldownPanel: React.FC<FormatDrilldownPanelProps> = ({
  region,
  data,
  loading,
  onClose,
}) => {
  return (
    <div className="mb-4 rounded-sm border border-primary/30 bg-accent/10">
      <div className="flex items-center justify-between px-4 py-2 border-b border-primary/20">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center text-base leading-none text-primary" >▶</span>
          <span className="text-xs font-medium text-foreground">{region}</span>
          <span className="text-xs text-muted-foreground">下钻详情</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <span className="inline-flex items-center justify-center text-base leading-none" >❌</span>
        </button>
      </div>

      {loading ? (
        <div className="flex h-[120px] items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data ? (
        <div className="p-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">人员别形态点数</p>
            <div className="max-h-[240px] overflow-auto rounded-sm border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-accent/50">
                    <th className="whitespace-nowrap px-3 py-1.5 font-medium text-foreground">业代</th>
                    {data.formatTypes.map((ft: string) => (
                      <th key={ft} className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-foreground">{ft}</th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-foreground">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {data.personnel.map((p) => (
                    <tr key={p.name} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out">
                      <td className="whitespace-nowrap px-3 py-1 text-foreground">{p.name || '-'}</td>
                      {data.formatTypes.map((ft: string) => (
                        <td key={ft} className="whitespace-nowrap px-3 py-1 text-right font-mono tabular-nums text-foreground">
                          {p.formats[ft] ?? 0}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-1 text-right font-mono tabular-nums font-semibold text-foreground">
                        {p.totalStores}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.monthlyRates.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">近6个月各形态成交率(%)</p>
              <div className="overflow-auto rounded-sm border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-accent/50">
                      <th className="whitespace-nowrap px-3 py-1.5 font-medium text-foreground">月份</th>
                      {data.formatTypes.map((ft: string) => (
                        <th key={ft} className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-foreground">{ft}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlyRates.map((mr) => (
                      <tr key={mr.month} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors duration-150 ease-out">
                        <td className="whitespace-nowrap px-3 py-1 text-foreground">{mr.month}</td>
                        {data.formatTypes.map((ft: string) => {
                          const val = mr.rates[ft] ?? 0;
                          return (
                            <td
                              key={ft}
                              className={`whitespace-nowrap px-3 py-1 text-right font-mono tabular-nums ${val > 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                            >
                              {val > 0 ? `${val}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default FormatDrilldownPanel;
