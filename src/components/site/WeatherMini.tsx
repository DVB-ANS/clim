import type { WeatherPoint } from "@/lib/series";
import { COLORS } from "@/lib/theme";

const W = 400, H = 170, TOP = 10, MID = 82, GAP = 14, BOTTOM = 154;

/**
 * The weather in two stacked panels on one time axis: σ (Brass) above, the fee it sets on pool V
 * (Ember area) against pool S's fixed fee (dashed Graphite) below. Step lines, like the hook.
 */
export function WeatherMini({ points, staticFeeBp, className = "", labels = true }: { points: WeatherPoint[]; staticFeeBp: number; className?: string; labels?: boolean }) {
  if (points.length < 2) return <div className={`grid place-items-center text-xs text-fg-subtle ${className}`}>Waiting for reports…</div>;
  const t0 = points[0].t, t1 = points.at(-1)!.t || t0 + 1;
  const sMax = Math.max(60, ...points.map((p) => p.sigmaPct)) * 1.12;
  const fMax = Math.max(14, staticFeeBp, ...points.map((p) => p.feeVBp)) * 1.15;
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const Ys = (v: number) => MID - GAP / 2 - (v / sMax) * (MID - GAP / 2 - TOP);
  const Yf = (v: number) => BOTTOM - (v / fMax) * (BOTTOM - (MID + GAP / 2));
  const step = (y: (p: WeatherPoint) => number) =>
    points.map((p, i) => (i === 0 ? `M0 ${y(p).toFixed(1)}` : `H${X(p.t).toFixed(1)}V${y(p).toFixed(1)}`)).join("") + `H${W}`;
  const sigma = step((p) => Ys(p.sigmaPct));
  const fee = step((p) => Yf(p.feeVBp));
  const sY = Yf(staticFeeBp).toFixed(1);
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Volatility and the fee it sets">
      <path d={`M0 ${MID - GAP / 2}H${W}M0 ${BOTTOM}H${W}`} stroke={COLORS.grid} strokeWidth={1} fill="none" />
      <path d={`${fee}V${BOTTOM}H0Z`} fill={COLORS.V} fillOpacity={0.1} />
      <path d={`M0 ${sY}H${W}`} stroke={COLORS.S} strokeWidth={1.2} strokeDasharray="5 4" fill="none" />
      <path d={fee} stroke={COLORS.V} strokeWidth={1.8} fill="none" />
      <path d={sigma} stroke={COLORS.sigma} strokeWidth={1.8} fill="none" />
      <circle cx={W - 2} cy={Yf(last.feeVBp)} r={6} fill={COLORS.V} fillOpacity={0.18} />
      <circle cx={W - 2} cy={Yf(last.feeVBp)} r={3} fill={COLORS.V} />
      {labels ? (
        <g fontSize={10} fill="var(--clim-fg-subtle)">
          <text x={4} y={TOP + 9}>σ %/yr</text>
          <text x={4} y={MID + GAP / 2 + 11}>fee bp</text>
        </g>
      ) : null}
    </svg>
  );
}
