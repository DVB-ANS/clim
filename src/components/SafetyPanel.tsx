"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { blindEpisodes } from "@/lib/series";
import { utcTime } from "@/lib/theme";
import { formatAge, pipsToBp } from "@/lib/units";
import { Panel, TxLink } from "./ui";

export function SafetyPanel({ data }: { data: ClimData }) {
  const live = data.source === "sepolia";
  const episodes = useMemo(() => blindEpisodes(data.reports, params.tauKillSec, data.nowSec), [data.reports, data.nowSec]);
  const rejected = data.deliveries.filter((d) => !d.accepted);
  const accepted = data.deliveries.length - rejected.length;
  const pf = data.state?.protocolFees;
  return (
    <Panel title="Safety evidence" subtitle="Everything below is read from logs: forwarder deliveries, desk silences, pool state.">
      <ul className="space-y-3 text-sm">
        <li>
          <span className="font-medium">Forged or invalid reports rejected: {rejected.length}</span>
          <span className="text-fg-subtle"> (accepted deliveries: {accepted}). A rejected report emits ReportProcessed(…, false) and no RiskReported.</span>
          <ul className="mt-1 space-y-0.5">
            {rejected.slice(-5).map((d) => (
              <li key={`${d.txHash}:${d.logIndex}`} className="text-xs">{utcTime(d.blockTimestamp)} UTC <TxLink hash={d.txHash} live={live} /></li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-medium">Blind episodes (desk silent over {params.tauKillSec} s, fee at least {pipsToBp(params.feeSafePips)} bp): {episodes.length}</span>
          <ul className="mt-1 space-y-0.5">
            {episodes.slice(-5).map((e) => (
              <li key={e.from} className="text-xs">
                {utcTime(e.from)} to {e.ongoing ? "now" : `${utcTime(e.to)} UTC`} ({formatAge(e.to - e.from)}): last report <TxLink hash={e.lastTx} live={live} />
                {e.resumeTx ? <> , resumed <TxLink hash={e.resumeTx} live={live} /></> : null}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-medium">Protocol fee: </span>
          {pf ? (pf.V === 0 && pf.S === 0 ? "0 on V and S, so Swap.fee is the LP fee alone." : `NOT ZERO (V ${pf.V}, S ${pf.S}): Swap.fee includes a protocol share.`) : "…"}
        </li>
        <li className="text-fg-muted">The desk owner can rotate the forwarder; nobody can set σ, the fee or the hook parameters.</li>
      </ul>
    </Panel>
  );
}
