import type { LabSummary } from "@/lib/lab";

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

export function BacktestTable({ summary }: { summary: LabSummary }) {
  const periods = [...new Set([...summary.comparisons.equalAvgFee, ...summary.comparisons.equalTraderCost, ...summary.pTrade].map((x) => x.period))];
  const find = <T extends { period: string }>(xs: T[], p: string) => xs.find((x) => x.period === p);
  return (
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Backtest summary" tabIndex={0}>
      <table className="min-w-[640px] text-sm tabular-nums">
        <thead>
          <tr className="text-left align-bottom text-xs text-fg-subtle">
            <th className="pb-1.5 pr-6 font-normal">Period</th>
            <th className="pb-1.5 pr-6 font-normal">ARB change, equal time-average fee</th>
            <th className="pb-1.5 pr-6 font-normal">ARB change, equal cost to traders</th>
            <th className="pb-1.5 pr-6 font-normal">P_trade predicted / observed</th>
            <th className="pb-1.5 font-normal">Blocks</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => {
            const a = find(summary.comparisons.equalAvgFee, p);
            const c = find(summary.comparisons.equalTraderCost, p);
            const t = find(summary.pTrade, p);
            return (
              <tr key={p} className="border-t border-line align-top">
                <td className="py-1.5 pr-6">{p}</td>
                <td className="py-1.5 pr-6 font-semibold">{a ? sgn(a.arbChangePct) : "n/a"}</td>
                <td className="py-1.5 pr-6 font-semibold">{c ? sgn(c.arbChangePct) : "n/a"}</td>
                <td className="py-1.5 pr-6">{t ? `${t.predicted.toFixed(3)} / ${t.observed.toFixed(3)}` : "n/a"}</td>
                <td className="py-1.5">{t ? t.blocks.toLocaleString("en-US") : "n/a"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
