"use client";

import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { formatBp, pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";
import { FeeCurveChart } from "./FeeCurveChart";
import { ModeBadge, Panel, Stat } from "./ui";

export function QuotePanel({ data }: { data: ClimData }) {
  const q = data.state?.quote;
  const desk = data.state?.desk;
  const staticFeeBp = data.pair ? pipsToBp(data.pair.S.key.fee) : 0;
  const eta = params.etaE4 / 1e4;
  return (
    <Panel
      title="Quote: fee now"
      subtitle={`fee = clamp(η · σ · √(Δt/2) · k, ${formatBp(pipsToBp(params.feeMinPips), 0)}, ${formatBp(pipsToBp(params.feeMaxPips), 0)}), η = 1/P* − 0.824 = ${eta.toFixed(3)} (P* = ${(params.pStar * 100).toFixed(0)}%), Δt = 12 s`}
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="V: clim pool (hook)" value={q ? formatBp(pipsToBp(q.feePips), 2) : "…"} hint={q ? <ModeBadge mode={q.mode} /> : undefined} />
        <Stat label="S: static twin" value={formatBp(staticFeeBp, 2)} hint="same average fee" />
        <Stat label="σ applied" value={desk ? `${sigmaE9ToAnnualPct(desk.sigmaE9).toFixed(1)}%` : "…"} hint={desk ? `k = ${(desk.kE4 / 1e4).toFixed(2)}` : undefined} />
      </div>
      <FeeCurveChart
        sigmaNowPct={desk ? sigmaE9ToAnnualPct(desk.sigmaE9) : undefined}
        feeNowBp={q ? pipsToBp(q.feePips) : undefined}
        staticFeeBp={staticFeeBp}
      />
    </Panel>
  );
}
