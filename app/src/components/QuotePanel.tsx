"use client";

import Link from "next/link";
import type { ClimData } from "@/hooks/useClimData";
import { deployments } from "@/lib/config";
import { formatBp, pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";
import { AnimatedCounter } from "./AnimatedCounter";
import { FeeCurveChart } from "./FeeCurveChart";
import { ModeBadge, Panel, Stat } from "./ui";

export function QuotePanel({ data }: { data: ClimData }) {
  const q = data.state?.quote;
  const desk = data.state?.desk;
  const staticFeeBp = data.pair ? pipsToBp(data.pair.S.key.fee) : 0;
  // S's fee is V's exact average only on the replay pair; on the live pair it is the lab's forecast of it
  const replay = !!deployments.pairs.replay && data.pair?.V.poolId === deployments.pairs.replay.V.poolId;
  return (
    <Panel
      title="Quote: fee now"
      subtitle={
        <>
          The fee pool V charges right now, set by the hook from the desk&apos;s σ. The formula, step by step:{" "}
          <Link className="text-link underline" href="/how#premium">How it works</Link>.
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pool V now" value={q ? <AnimatedCounter value={pipsToBp(q.feePips)} decimals={2} suffix=" bp" className="-my-[0.25em]" /> : "…"} hint={q ? <ModeBadge mode={q.mode} /> : undefined} />
        <Stat label="Pool S, fixed" value={formatBp(staticFeeBp, 2)} hint={replay ? "V's average fee" : "forecast of V's average"} />
        <Stat label="σ applied" value={desk ? `${sigmaE9ToAnnualPct(desk.sigmaE9).toFixed(1)}%` : "…"} hint={desk ? `k = ${(desk.kE4 / 1e4).toFixed(2)}` : undefined} />
      </div>
      <FeeCurveChart
        className="h-56 lg:h-[19rem]"
        sigmaNowPct={desk ? sigmaE9ToAnnualPct(desk.sigmaE9) : undefined}
        feeNowBp={q ? pipsToBp(q.feePips) : undefined}
        staticFeeBp={staticFeeBp}
      />
    </Panel>
  );
}
