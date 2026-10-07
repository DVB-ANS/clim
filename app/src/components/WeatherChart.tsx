"use client";

import { type ReactNode, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { blindEpisodes, downsample, extent, swapFeeDots, weatherSeries } from "@/lib/series";
import { COLORS, utcTime } from "@/lib/theme";
import {
  type Bounds,
  clampRange,
  durationLabel,
  initialPreset,
  matchingPreset,
  MIN_WINDOW_SEC,
  panRange,
  PRESETS,
  presetEnabled,
  presetRange,
  type Range,
  sinceLabel,
  sliceSteps,
  spanOf,
  zoomRange,
} from "@/lib/timeWindow";
import { pipsToBp } from "@/lib/units";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";
import { RangeSelector } from "./RangeSelector";
import { Panel, Toggle } from "./ui";

// Points drawn per panel: the visible window is downsampled to this, so zooming in shows every report
// (more only slows the hover down: every move re-renders the chart). The range selector under the
// panels draws the whole history's σ at OVERVIEW_POINTS.
const MAX_POINTS = 600;
const MAX_DOTS = 300;
const OVERVIEW_POINTS = 300;
const Y_AXIS_W = 56;
const MARGIN_R = 16;
const axisTick = { fontSize: 12, fill: COLORS.muted };

/** The window shown: a preset (it follows new reports), or one the reader set (it follows them only when it ends at the latest). */
type View = { kind: "preset"; label: string } | { kind: "custom"; from: number; to: number; follow: boolean };

function resolve(view: View, b: Bounds): Range {
  if (view.kind === "preset") {
    const p = PRESETS.find((x) => x.label === view.label);
    return presetRange(p && presetEnabled(p, spanOf(b)) ? p : PRESETS[PRESETS.length - 1], b);
  }
  return view.follow ? clampRange([b[1] - (view.to - view.from), b[1]], b) : clampRange([view.from, view.to], b);
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-fg-muted focus-visible:outline-2 focus-visible:outline-accent enabled:hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}

/**
 * σ and the fee it sets, on one time axis, with a range selector under them: drag the window or its
 * edges (keyboard sliders too), use the buttons, Ctrl or ⌘ + wheel or a pinch to zoom around the
 * pointer, Shift + wheel or a sideways swipe to pan. Presets only offer windows that differ from the
 * whole history loaded (the frozen snapshot plus every block polled since).
 */
export function WeatherChart({ data, initialWindow = "1 h" }: { data: ClimData; initialWindow?: string }) {
  const syncId = useId();
  const box = useRef<HTMLDivElement>(null);
  const nowBucket = Math.floor(data.nowSec / 10) * 10;
  const full = useMemo(() => weatherSeries(data.reports, params, nowBucket), [data.reports, nowBucket]);
  const bounds: Bounds = full.length > 1 ? [full[0].t, full[full.length - 1].t] : [nowBucket - 60, nowBucket];
  const span = spanOf(bounds);
  // until the reader picks a window, the initial preset, re-decided as the history loads
  const [view, setView] = useState<View | null>(null);
  const range = resolve(view ?? { kind: "preset", label: initialPreset(initialWindow, span).label }, bounds);
  const [from, to] = range;
  const setRange = (r: Range) => setView({ kind: "custom", from: r[0], to: r[1], follow: r[1] >= bounds[1] - 1 });

  const { points, dots, blind } = useMemo(() => {
    const visible = downsample(sliceSteps(full, [from, to]), MAX_POINTS);
    const v = data.pair ? swapFeeDots(data.swaps, data.pair.V.poolId).filter((d) => d.t >= from && d.t <= to) : [];
    const episodes = blindEpisodes(data.reports, params.tauKillSec, nowBucket).filter((e) => e.to >= from && e.from <= to);
    return { points: visible, dots: downsample(v, MAX_DOTS), blind: episodes };
  }, [full, from, to, data.reports, data.swaps, data.pair, nowBucket]);
  const overview = useMemo(() => downsample(full, OVERVIEW_POINTS).map((p) => ({ t: p.t, v: p.sigmaPct })), [full]);

  // Ctrl/⌘ + wheel (a trackpad pinch sends the same) zooms around the pointer's time; Shift + wheel or a
  // sideways swipe pans; a plain vertical wheel keeps scrolling the page
  const onWheel = useEffectEvent((e: WheelEvent) => {
    const zoom = e.ctrlKey || e.metaKey;
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!zoom && !e.shiftKey && !sideways) return;
    const el = box.current;
    if (!el || span <= MIN_WINDOW_SEC) return;
    e.preventDefault();
    const rc = el.getBoundingClientRect();
    const plotW = Math.max(1, rc.width - Y_AXIS_W - MARGIN_R);
    if (zoom) {
      const k = Math.min(1, Math.max(0, (e.clientX - rc.left - Y_AXIS_W) / plotW));
      setRange(zoomRange(range, Math.exp(e.deltaY * 0.01), bounds, from + k * (to - from)));
    } else {
      const d = sideways ? e.deltaX : e.deltaY;
      setRange(panRange(range, (d / plotW) * (to - from), bounds));
    }
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  const staticFeeBp = data.pair ? pipsToBp(data.pair.S.key.fee) : 0;
  const since = full.length ? sinceLabel(bounds[0]) : "…";
  const active = matchingPreset(range, bounds)?.label;
  const width = to - from;
  const where = `${utcTime(from)} to ${utcTime(to)} UTC`;

  // the charts are pictures to assistive tech (no keyboard layer): these sentences are their text
  const last = points.at(-1);
  const sig = extent(points.map((p) => p.sigmaPct));
  const fee = extent(points.map((p) => p.feeVBp));
  const sigmaText = sig && last
    ? `σ applied by the desk, ${where}: ${sig[0].toFixed(1)}% to ${sig[1].toFixed(1)}% a year, ${last.sigmaPct.toFixed(1)}% at the end.`
    : "No desk report in this window.";
  const feeText = fee && last
    ? `Pool V's fee, ${where}: ${fee[0].toFixed(2)} to ${fee[1].toFixed(2)} bp, ${last.feeVBp.toFixed(2)} bp at the end; pool S fixed at ${staticFeeBp.toFixed(2)} bp; ${blind.length} blind episode${blind.length === 1 ? "" : "s"} shaded.`
    : "No fee data in this window.";

  return (
    <Panel
      title="Weather: volatility and the fee it sets"
      subtitle="Top: volatility published by the CRE desk. Bottom: the fee the hook charges on every swap (line), the fee actually paid by swaps on V (dots), and the static twin S. The fee is never sent by a transaction: Uniswap calls the hook's beforeSwap, which reads σ and returns the fee."
      className="col-span-full"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Toggle
          label="Time window"
          value={active}
          options={PRESETS.map((p) => {
            const on = presetEnabled(p, span);
            const all = !Number.isFinite(p.sec);
            return {
              value: p.label,
              label: all ? (
                <>
                  All<span className="max-sm:hidden"> (since {since})</span>
                </>
              ) : (
                p.label
              ),
              ariaLabel: all ? `All (since ${since})` : undefined,
              title: on ? undefined : `Not distinct from All: ${durationLabel(span)} loaded`,
              disabled: !on,
            };
          })}
          onChange={(label) => setView({ kind: "preset", label })}
        />
        <div className="flex gap-1" role="group" aria-label="Move or zoom the time window">
          <StepButton label="Earlier" disabled={from <= bounds[0]} onClick={() => setRange(panRange(range, -width / 2, bounds))}>
            ←
          </StepButton>
          <StepButton label="Later" disabled={to >= bounds[1]} onClick={() => setRange(panRange(range, width / 2, bounds))}>
            →
          </StepButton>
          <StepButton label="Zoom in" disabled={width <= MIN_WINDOW_SEC} onClick={() => setRange(zoomRange(range, 0.5, bounds))}>
            +
          </StepButton>
          <StepButton label="Zoom out" disabled={width >= span} onClick={() => setRange(zoomRange(range, 2, bounds))}>
            −
          </StepButton>
        </div>
      </div>
      <p className="mb-2 text-xs text-fg-subtle">
        {where}: {durationLabel(width)} of the {durationLabel(span)} loaded, since {since}.
      </p>
      <div ref={box}>
        <div className="h-48 w-full" role="img" aria-label={sigmaText}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart accessibilityLayer={false} syncId={syncId} data={points} margin={{ top: 4, right: MARGIN_R, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={[from, to]} allowDataOverflow tickFormatter={utcTime} tick={axisTick} hide />
              <YAxis unit="%" tick={axisTick} width={Y_AXIS_W} />
              <Tooltip
                {...TOOLTIP}
                content={<ChartTooltip only={["sigmaPct", "sigmaReportedPct", "dvolPct"]} labelFormat={(t) => `${utcTime(Number(t))} UTC`} valueFormat={(v) => `${v.toFixed(1)}%`} />}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="stepAfter" dataKey="sigmaPct" name="σ applied" stroke={COLORS.sigma} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="sigmaReportedPct" name="σ reported" stroke={COLORS.muted} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="dvolPct" name="DVOL" stroke={COLORS.muted} strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="h-48 w-full" role="img" aria-label={feeText}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart accessibilityLayer={false} syncId={syncId} data={points} margin={{ top: 4, right: MARGIN_R, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={[from, to]} allowDataOverflow tickFormatter={utcTime} tick={axisTick} />
              <YAxis unit=" bp" tick={axisTick} width={Y_AXIS_W} />
              <Tooltip {...TOOLTIP} content={<ChartTooltip only={["feeVBp"]} labelFormat={(t) => `${utcTime(Number(t))} UTC`} valueFormat={(v) => `${v.toFixed(2)} bp`} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {blind.map((e) => (
                <ReferenceArea key={e.from} x1={Math.max(e.from, from)} x2={Math.min(e.to, to)} fill={COLORS.blind} fillOpacity={0.08} />
              ))}
              <ReferenceLine y={staticFeeBp} stroke={COLORS.S} strokeWidth={2} strokeDasharray="6 3" label={{ value: "S static", position: "insideTopRight", fontSize: 12 }} />
              <Line type="stepAfter" dataKey="feeVBp" name="V fee (hook)" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Scatter data={dots} dataKey="feeBp" name="V swaps (fee paid)" fill={COLORS.V} isAnimationActive={false} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={2} fill={COLORS.V} fillOpacity={0.6} />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      {overview.length > 1 ? (
        <RangeSelector bounds={bounds} range={range} onChange={setRange} line={overview} className="mt-2 ml-14 mr-6" />
      ) : null}
      <p className="mt-1 text-xs text-fg-subtle">
        Under the charts, the whole history&apos;s σ: drag the window or its edges to move or resize it. On a computer, Ctrl or ⌘ + scroll (or a pinch) zooms, Shift + scroll pans.
        Times in UTC. Shaded: blind mode, the desk was silent for more than {params.tauKillSec} s, so the hook quoted at least {pipsToBp(params.feeSafePips)} bp. No transaction changes the fee: every swap reads the latest CRE report.
      </p>
    </Panel>
  );
}
