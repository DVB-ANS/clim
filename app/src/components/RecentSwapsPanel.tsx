"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { recentSwapRows } from "@/lib/pnl";
import { COLORS, utcTime } from "@/lib/theme";
import { dataTable, type HeadingLevel, Panel, TxLink } from "./ui";

export function RecentSwapsPanel({ data, level }: { data: ClimData; level?: HeadingLevel }) {
  const rows = useMemo(
    () => (data.pair ? recentSwapRows({ swaps: data.swaps, pair: data.pair, arbRouter: data.arbRouter, limit: 12 }) : []),
    [data.swaps, data.pair, data.arbRouter],
  );
  return (
    <Panel id="recent-swaps" level={level} title="Recent swaps" subtitle="The fee each swap paid, read from its Swap event. On pool V it is the premium the hook returned at that moment; on pool S it never changes." className="col-span-full">
      <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Recent swaps" tabIndex={0}>
        <table className={`${dataTable} whitespace-nowrap`}>
          <thead>
            <tr>
              <th className="pr-6 text-left">Time (UTC)</th><th className="pr-6 text-left">Pool</th><th className="pr-6 text-left">Side</th><th className="num pr-6">Size</th><th className="num pr-6">Fee paid</th><th className="pr-6 text-left">Kind</th><th className="text-left">Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="pr-6">{utcTime(r.t)}</td>
                <td className="pr-6 font-medium" style={{ color: r.pool === "V" ? COLORS.V : COLORS.S }}>Pool {r.pool}</td>
                <td className="pr-6">{r.side}</td>
                <td className="num pr-6">{r.ethAmount.toFixed(4)} tETH</td>
                <td className="num pr-6">{r.feeBp.toFixed(2)} bp</td>
                <td className="pr-6">{r.kind}</td>
                <td className="py-1!"><TxLink hash={r.txHash} live={data.source === "sepolia"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
