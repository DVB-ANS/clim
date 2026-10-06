"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";
import { params } from "@/lib/config";
import { feePips } from "@/lib/feeMath";
import { COLORS } from "@/lib/theme";
import { annualPctToSigmaE9, pipsToBp } from "@/lib/units";

const SIGMAS = Array.from({ length: 51 }, (_, i) => i * 5); // 0..250 %/yr

export function feeCurve() {
  return SIGMAS.map((s) => ({
    sigmaPct: s,
    feeBp: pipsToBp(feePips(annualPctToSigmaE9(s), params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips)),
  }));
}

export function FeeCurveChart({ sigmaNowPct, feeNowBp, staticFeeBp }: { sigmaNowPct?: number; feeNowBp?: number; staticFeeBp: number }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={feeCurve()} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="sigmaPct" type="number" domain={[0, 250]} ticks={[0, 50, 100, 150, 200, 250]} unit="%" tick={{ fontSize: 11, fill: COLORS.muted }} label={{ value: "σ (annualised)", position: "insideBottom", offset: -8, fontSize: 11 }} />
          <YAxis unit=" bp" tick={{ fontSize: 11, fill: COLORS.muted }} width={56} />
          <Tooltip {...TOOLTIP} content={<ChartTooltip only={["feeBp"]} labelFormat={(l) => `σ ${l}%/yr`} valueFormat={(v) => `${v.toFixed(1)} bp`} />} />
          <ReferenceLine y={staticFeeBp} stroke={COLORS.S} strokeDasharray="4 4" label={{ value: "S (static)", position: "right", fontSize: 11 }} />
          <ReferenceLine y={pipsToBp(params.feeSafePips)} stroke={COLORS.muted} strokeDasharray="2 4" label={{ value: "blind / degraded floor", position: "insideTopLeft", fontSize: 10 }} />
          <Line type="monotone" dataKey="feeBp" name="V (clim)" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
          {sigmaNowPct !== undefined && feeNowBp !== undefined ? (
            <ReferenceDot x={Math.min(250, sigmaNowPct)} y={feeNowBp} r={5} fill={COLORS.V} stroke={COLORS.surface} strokeWidth={2} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
