"use client";

import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { FLAG_DEGRADED, FLAG_REPLAY, quoteFee } from "@/lib/feeMath";
import { dvolE2ToPct, formatAge, formatPct, sigmaE9ToAnnualPct } from "@/lib/units";
import { ModeBadge, Panel, Stat, TxLink } from "./ui";

// RiskReported.zone (spec §3.4): the model-control traffic light, 0 in the hackathon build.
const ZONES = ["not evaluated", "green", "yellow", "red"];

export function DeskPanel({ data }: { data: ClimData }) {
  const last = data.reports.at(-1);
  const desk = data.state?.desk;
  if (!last || !desk) return <Panel title="Risk desk (Chainlink CRE)">No report yet.</Panel>;
  const mode = quoteFee(desk, data.nowSec, params).mode;
  const latencies = data.reports.slice(-20).map((r) => r.latencySec).sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)];
  const flags = [desk.flags & FLAG_DEGRADED ? "DEGRADED" : null, desk.flags & FLAG_REPLAY ? "REPLAY" : null].filter(Boolean);
  return (
    <Panel title="Risk desk (Chainlink CRE)" subtitle="4 venues, quorum 3, DON median, signed report to RiskDesk.onReport every 30 s">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="σ applied (hook input)" value={formatPct(sigmaE9ToAnnualPct(desk.sigmaE9))} hint={`reported ${formatPct(sigmaE9ToAnnualPct(last.sigmaReported))}`} />
        <Stat label="RV15" value={formatPct(sigmaE9ToAnnualPct(last.rv15E9))} />
        <Stat label="DVOL (Deribit)" value={last.dvolE2 === 0 ? "n/a" : formatPct(dvolE2ToPct(last.dvolE2))} />
        <Stat label="Venue dispersion" value={`${last.dispBp} bp`} hint={last.dispBp > 25 ? "above 25 bp: degraded" : "limit 25 bp"} />
        <Stat label="Sources" value={`${last.nSources} / 4`} hint={`model zone: ${ZONES[last.zone] ?? last.zone}`} />
        <Stat label="Age τ" value={formatAge(data.nowSec - desk.tObs)} hint={`blind after ${params.tauKillSec} s`} />
        <Stat label="Hook mode" value={<ModeBadge mode={mode} />} hint={flags.length ? flags.join(", ") : undefined} />
        <Stat label="Report latency" value={formatAge(medianLatency)} hint="median of last 20, tObs to inclusion" />
      </div>
      <div className="mt-4">
        <div className="text-xs text-fg-subtle">Last CRE reports (seq, onReport tx)</div>
        <ul className="mt-1 space-y-0.5">
          {data.reports.slice(-5).reverse().map((r) => (
            <li key={`${r.txHash}:${r.logIndex}`} className="font-mono text-xs">
              #{r.seq} <TxLink hash={r.txHash} live={data.source === "sepolia"} />
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
