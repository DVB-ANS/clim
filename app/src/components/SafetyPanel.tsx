"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { utcClock, utcDay, utcSpan } from "@/lib/ledger";
import { blindEpisodes } from "@/lib/series";
import { formatAge, pipsToBp } from "@/lib/units";
import { type HeadingLevel, Panel, TxLink } from "./ui";

// each list shows its latest rows; the count above it stays the total, so it says when the list is cut
const LISTED = 5;
const cut = (n: number) => (n > LISTED ? ` (latest ${LISTED} listed)` : "");

export function SafetyPanel({ data, level }: { data: ClimData; level?: HeadingLevel }) {
  const episodes = useMemo(() => blindEpisodes(data.reports, params.tauKillSec, data.nowSec), [data.reports, data.nowSec]);
  const rejected = data.deliveries.filter((d) => !d.accepted);
  const accepted = data.deliveries.length - rejected.length;
  const pf = data.state?.protocolFees;
  return (
    <Panel id="safety" level={level} title="Safety evidence" subtitle="Everything below is read from logs: forwarder deliveries, desk silences, pool state.">
      <ul className="space-y-3 text-sm">
        <li>
          <span className="font-medium">Forged or invalid reports rejected: {rejected.length}{cut(rejected.length)}</span>
          <span className="text-fg-subtle"> (accepted deliveries: {accepted}). A rejected report emits ReportProcessed(…, false) and no RiskReported.</span>
          <ul className="mt-1 space-y-0.5">
            {rejected.slice(-LISTED).map((d) => (
              <li key={`${d.txHash}:${d.logIndex}`} className="text-xs">{utcDay(d.blockTimestamp)}, {utcClock(d.blockTimestamp)} UTC <TxLink hash={d.txHash} /></li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-medium">Blind episodes (desk silent over {params.tauKillSec} s, fee at least {pipsToBp(params.feeSafePips)} bp): {episodes.length}{cut(episodes.length)}</span>
          <ul className="mt-1 space-y-0.5">
            {episodes.slice(-LISTED).map((e) => (
              <li key={e.from} className="text-xs">
                {utcSpan(e.from, e.to, e.ongoing)} ({formatAge(e.to - e.from)}): last report <TxLink hash={e.lastTx} />
                {e.resumeTx ? <> , resumed <TxLink hash={e.resumeTx} /></> : null}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-medium">Protocol fee: </span>
          {pf ? (pf.V === 0 && pf.S === 0 ? "0 on V and S, so Swap.fee is the LP fee alone." : `NOT ZERO (V ${pf.V}, S ${pf.S}): Swap.fee includes a protocol share.`) : "…"}
        </li>
        <li className="text-fg-muted">
          No function sets σ, the fee or the hook parameters. In this build the owner key is also the live desk&apos;s simulation operator (the
          replay desk has its own), so until it disables simulation and renounces ownership it can post reports itself: through the mock
          forwarder while simulation is on, or through a forwarder it sets afterwards. Every report stays inside the same bounds: σ ×2 up or
          ×0.8 down per report, 10% to 1000% a year, and a fee clamped to {pipsToBp(params.feeMinPips)} to {pipsToBp(params.feeMaxPips)} bp.
          On a DON, only reports the nodes sign for clim&apos;s workflow ID would count, once the owner pins that ID, disables simulation and
          renounces ownership.
        </li>
      </ul>
    </Panel>
  );
}
