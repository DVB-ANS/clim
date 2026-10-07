"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { recentSwapRows } from "@/lib/pnl";
import { COLORS, utcTime } from "@/lib/theme";
import { Panel, TxLink } from "./ui";

export function RecentSwapsPanel({ data }: { data: ClimData }) {
  const rows = useMemo(
    () => (data.pair ? recentSwapRows({ swaps: data.swaps, pair: data.pair, arbRouter: data.arbRouter, limit: 12 }) : []),
    [data.swaps, data.pair, data.arbRouter],
  );
  return (
    <Panel title="Recent swaps" subtitle="Fee read from each Swap event: on V it is whatever the hook returned at that moment." className="col-span-full">
      <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Recent swaps" tabIndex={0}>
        <table className="text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th className="pr-6">Time (UTC)</th><th className="pr-6">Pool</th><th className="pr-6">Side</th><th className="pr-6">Size</th><th className="pr-6">Fee paid</th><th className="pr-6">Kind</th><th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="pr-6">{utcTime(r.t)}</td>
                <td className="pr-6 font-medium" style={{ color: r.pool === "V" ? COLORS.V : COLORS.S }}>{r.pool}</td>
                <td className="pr-6">{r.side}</td>
                <td className="pr-6">{r.ethAmount.toFixed(4)} tETH</td>
                <td className="pr-6">{r.feeBp.toFixed(2)} bp</td>
                <td className="pr-6">{r.kind}</td>
                <td><TxLink hash={r.txHash} live={data.source === "sepolia"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
