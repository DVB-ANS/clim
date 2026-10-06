"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { blindEpisodes, downsample, swapFeeDots, weatherSeries } from "@/lib/series";
import { COLORS, utcTime } from "@/lib/theme";
import { pipsToBp } from "@/lib/units";
import { Panel } from "./ui";

const WINDOWS = [
  { label: "1 h", sec: 3_600 },
  { label: "6 h", sec: 21_600 },
  { label: "24 h", sec: 86_400 },
  { label: "All", sec: Number.POSITIVE_INFINITY },
];
const MAX_POINTS = 1_500;
const axisTick = { fontSize: 11, fill: COLORS.muted };

export function WeatherChart({ data }: { data: ClimData }) {
  const [win, setWin] = useState(WINDOWS[1]);
  const nowBucket = Math.floor(data.nowSec / 10) * 10;
  const { points, dots, blind } = useMemo(() => {
    const from = nowBucket - win.sec;
    const all = weatherSeries(data.reports, params, nowBucket).filter((p) => p.t >= from);
    const v = data.pair ? swapFeeDots(data.swaps, data.pair.V.poolId).filter((d) => d.t >= from) : [];
    const episodes = blindEpisodes(data.reports, params.tauKillSec, nowBucket).filter((e) => e.to >= from);
    return { points: downsample(all, MAX_POINTS), dots: downsample(v, MAX_POINTS), blind: episodes };
  }, [data.reports, data.swaps, data.pair, nowBucket, win]);
  const staticFeeBp = data.pair ? pipsToBp(data.pair.S.key.fee) : 0;
  const domain: [number, number] = points.length ? [points[0].t, points[points.length - 1].t] : [0, 1];

  return (
    <Panel
      title="Weather: volatility and the fee it sets"
      subtitle="Top: volatility published by the CRE desk. Bottom: the fee the hook charges on every swap (line), the fee actually paid by swaps on V (dots), and the static twin S. The fee is never sent by a transaction: Uniswap calls the hook's beforeSwap, which reads σ and returns the fee."
      className="col-span-full"
    >
      <div className="mb-2 flex gap-1">
        {WINDOWS.map((w) => (
          <button
            key={w.label}
            type="button"
            onClick={() => setWin(w)}
            className={`rounded-full px-2.5 py-1 text-xs ${w === win ? "bg-fg text-surface" : "bg-surface-2 text-fg-muted hover:text-fg"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} syncId="weather" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="t" type="number" domain={domain} tickFormatter={utcTime} tick={axisTick} hide />
            <YAxis unit="%" tick={axisTick} width={56} />
            <Tooltip labelFormatter={(t) => `${utcTime(Number(t))} UTC`} formatter={(v) => `${Number(v).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="stepAfter" dataKey="sigmaPct" name="σ applied" stroke={COLORS.sigma} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="sigmaReportedPct" name="σ reported" stroke={COLORS.muted} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="dvolPct" name="DVOL" stroke={COLORS.muted} strokeWidth={1} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} syncId="weather" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="t" type="number" domain={domain} tickFormatter={utcTime} tick={axisTick} />
            <YAxis unit=" bp" tick={axisTick} width={56} />
            <Tooltip labelFormatter={(t) => `${utcTime(Number(t))} UTC`} formatter={(v) => `${Number(v).toFixed(2)} bp`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {blind.map((e) => (
              <ReferenceArea key={e.from} x1={Math.max(e.from, domain[0])} x2={Math.min(e.to, domain[1])} fill={COLORS.blind} fillOpacity={0.08} />
            ))}
            <ReferenceLine y={staticFeeBp} stroke={COLORS.S} strokeWidth={2} strokeDasharray="6 3" label={{ value: "S static", position: "insideTopRight", fontSize: 11 }} />
            <Line type="stepAfter" dataKey="feeVBp" name="V fee (hook)" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter data={dots} dataKey="feeBp" name="V swaps (fee paid)" fill={COLORS.V} isAnimationActive={false} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={2} fill={COLORS.V} fillOpacity={0.6} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">Times in UTC. Shaded: blind mode, the desk was silent for more than {params.tauKillSec} s, so the hook quoted at least {pipsToBp(params.feeSafePips)} bp. No transaction changes the fee: every swap reads the latest CRE report.</p>
    </Panel>
  );
}
