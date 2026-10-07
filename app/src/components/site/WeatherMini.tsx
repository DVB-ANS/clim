import type { WeatherPoint } from "@/lib/series";
import { COLORS } from "@/lib/theme";

const W = 400, H = 170, TOP = 10, MID = 82, GAP = 14, BOTTOM = 154;

/**
 * The weather in two stacked panels on one time axis: σ (pink) above, the fee it sets on pool V
 * (blue area) against pool S's fixed fee (dashed gray) below. Step lines, like the hook. `peak`
 * rings the storm's highest σ in pink. Labels are HTML and strokes do not scale, so both keep their
 * size whatever the chart's width.
 */
export function WeatherMini({ points, staticFeeBp, className = "", labels = true, peak }: {
  points: WeatherPoint[];
  staticFeeBp: number;
  className?: string;
  labels?: boolean;
  peak?: { t: number; sigmaPct: number };
}) {
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
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Volatility and the fee it sets">
        <path d={`M0 ${MID - GAP / 2}H${W}M0 ${BOTTOM}H${W}`} stroke={COLORS.grid} strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={`${fee}V${BOTTOM}H0Z`} fill={COLORS.V} fillOpacity={0.1} />
        <path d={`M0 ${sY}H${W}`} stroke={COLORS.S} strokeWidth={1.2} strokeDasharray="5 4" fill="none" vectorEffect="non-scaling-stroke" />
        <path d={fee} stroke={COLORS.V} strokeWidth={1.8} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={sigma} stroke={COLORS.sigma} strokeWidth={1.8} fill="none" vectorEffect="non-scaling-stroke" />
        {peak ? <circle cx={X(peak.t)} cy={Ys(peak.sigmaPct)} r={7} fill="none" stroke={COLORS.pink} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
        <circle cx={W - 2} cy={Yf(last.feeVBp)} r={6} fill={COLORS.V} fillOpacity={0.18} />
        <circle cx={W - 2} cy={Yf(last.feeVBp)} r={3} fill={COLORS.V} />
      </svg>
      {labels ? (
        <>
          {/* on an opaque backing above the lines, so a fee spike never runs through its axis label */}
          <span aria-hidden className="absolute left-1 top-0 z-10 rounded-sm bg-surface px-0.5 text-xs text-fg-subtle">
            σ %/yr
          </span>
          <span aria-hidden className="absolute left-1 z-10 rounded-sm bg-surface px-0.5 text-xs text-fg-subtle" style={{ top: `${((MID + GAP / 2) / H) * 100}%` }}>
            fee bp
          </span>
        </>
      ) : null}
    </div>
  );
}
