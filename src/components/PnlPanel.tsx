"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { pnlExplain } from "@/lib/pnl";
import { timeAverageFeeBp, weatherSeries } from "@/lib/series";
import { COLORS } from "@/lib/theme";
import { formatBp, formatUsd, pipsToBp } from "@/lib/units";
import { Panel } from "./ui";

export function PnlPanel({ data }: { data: ClimData }) {
  const rows = useMemo(() => {
    if (!data.pair) return [];
    return (["V", "S"] as const).map((name) => ({
      name,
      ...pnlExplain({ swaps: data.swaps, reports: data.reports, poolId: data.pair![name].poolId, token0IsEth: data.pair!.token0IsEth, arbRouter: data.arbRouter }),
    }));
  }, [data.pair, data.swaps, data.reports, data.arbRouter]);
  const feeCheck = useMemo(() => {
    if (!data.pair || data.reports.length === 0) return null;
    const v = timeAverageFeeBp(weatherSeries(data.reports, params, data.nowSec), data.nowSec);
    const s = pipsToBp(data.pair.S.key.fee);
    return { v, s, equal: Math.abs(v - s) <= 0.1 * s };
  }, [data.pair, data.reports, data.nowSec]);
  if (rows.length === 0) return null;
  const [v, s] = rows;
  const arbChange = s.arbUsd !== 0 ? (v.arbUsd / s.arbUsd - 1) * 100 : 0;
  const cols: { key: keyof (typeof rows)[number]; label: string; usd?: boolean }[] = [
    { key: "swaps", label: "Swaps" },
    { key: "arbSwaps", label: "of which arb" },
    { key: "volumeUsd", label: "Volume", usd: true },
    { key: "feeRetailUsd", label: "FEE retail", usd: true },
    { key: "feeArbUsd", label: "FEE arb", usd: true },
    { key: "arbUsd", label: "ARB (LP loss to arb, net)", usd: true },
    { key: "lvrUsd", label: "LVR", usd: true },
    { key: "netUsd", label: "Hedged LP P&L = FEE retail − ARB", usd: true },
  ];
  return (
    <Panel
      title="LP P&L explain (from logs only)"
      subtitle="Milionis-Moallemi-Roughgarden: a delta-hedged LP earns FEE_retail − ARB, and LVR ≈ ARB + FEE_arb. Arbitrage valued at the bot's own price (recovered from the post-swap price); retail fees and LVR at the desk's refTick."
      className="col-span-full"
    >
      <div className="overflow-x-auto">
        <table className="text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th className="pr-6">Pool</th>
              {cols.map((c) => <th key={c.key} className="pr-6">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="pr-6 font-medium" style={{ color: r.name === "V" ? COLORS.V : COLORS.S }}>{r.name}</td>
                {cols.map((c) => <td key={c.key} className="pr-6">{c.usd ? formatUsd(r[c.key] as number) : String(r[c.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {feeCheck ? (
        <p className="mt-2 text-sm">
          Time-average fee: V {formatBp(feeCheck.v, 2)}, S {formatBp(feeCheck.s, 2)}.{" "}
          {feeCheck.equal ? "Equal within 10%: a fair comparison." : <span className="font-semibold">Not at equal fee: the lab&apos;s comparison is the reference.</span>}
        </p>
      ) : null}
      <p className="mt-2 text-sm">
        ARB on V vs S: <span className="font-semibold">{arbChange >= 0 ? "+" : ""}{arbChange.toFixed(1)}%</span>
        {data.arbRouter ? null : <span className="text-fg-subtle"> (arbitrage router unknown: every swap counted as retail)</span>}
      </p>
    </Panel>
  );
}
