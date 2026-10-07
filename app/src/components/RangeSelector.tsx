"use client";

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { COLORS, utcTime } from "@/lib/theme";
import { type Bounds, moveEdge, panRange, type Range, spanOf } from "@/lib/timeWindow";

type Mode = "pan" | "from" | "to";

/**
 * A range selector under a time chart: the whole history's line, the shown window as a frame to drag,
 * and a handle on each edge to resize it. Every part is a keyboard slider (arrows, Page keys, Home and
 * End) with its time as text. Written here rather than Recharts' Brush, whose controlled range resets
 * to the full history whenever the data updates, which the live chart does every few seconds.
 */
export function RangeSelector({ bounds, range, onChange, line, className = "" }: {
  bounds: Bounds;
  range: Range;
  onChange: (r: Range) => void;
  line: { t: number; v: number }[];
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; x0: number; r0: Range } | null>(null);
  const span = Math.max(1, spanOf(bounds));
  const at = (t: number) => Math.min(1, Math.max(0, (t - bounds[0]) / span));
  const a = at(range[0]);
  const b = at(range[1]);
  const width = range[1] - range[0];
  const text = (t: number) => `${utcTime(t)} UTC`;

  const vMax = Math.max(1e-9, ...line.map((p) => p.v));
  const d = line.map((p, i) => `${i ? "L" : "M"}${(at(p.t) * 1000).toFixed(1)} ${(38 - (p.v / vMax) * 34).toFixed(1)}`).join("");

  const apply = (mode: Mode, r0: Range, dt: number) => onChange(mode === "pan" ? panRange(r0, dt, bounds) : moveEdge(r0, mode, dt, bounds));
  // one handler for the three parts, which say what they move in data-mode
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const mode = e.currentTarget.dataset.mode as Mode;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { mode, x0: e.clientX, r0: range };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    const w = track.current?.clientWidth;
    if (!g || !w) return;
    apply(g.mode, g.r0, ((e.clientX - g.x0) / w) * span);
  };
  const up = () => {
    drag.current = null;
  };
  // a press on the track outside the frame centres the window there
  const jump = (e: PointerEvent<HTMLDivElement>) => {
    const el = track.current;
    if (!el || e.target !== el) return;
    const rc = el.getBoundingClientRect();
    const t = bounds[0] + ((e.clientX - rc.left) / rc.width) * span;
    onChange(panRange(range, t - (range[0] + width / 2), bounds));
  };
  const keys = (mode: Mode) => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = mode === "pan" ? Math.max(60, width / 10) : Math.max(60, span / 50);
    const big = mode === "pan" ? width : span / 5;
    const delta: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -big, PageUp: big, Home: -span, End: span };
    if (!(e.key in delta)) return;
    e.preventDefault();
    apply(mode, range, delta[e.key]);
  };

  const slider = "absolute touch-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
  return (
    <div ref={track} className={`relative h-11 select-none rounded-sm bg-surface-2 ${className}`} onPointerDown={jump}>
      <svg viewBox="0 0 1000 40" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path d={d} fill="none" stroke={COLORS.sigma} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the frame (at least 24 px wide, so it stays a target) with its two handles just outside it */}
      <div className="pointer-events-none absolute inset-y-0 min-w-6" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Time window: drag or use the arrow keys to move it"
          aria-valuemin={bounds[0]}
          aria-valuemax={Math.max(bounds[0], bounds[1] - width)}
          aria-valuenow={Math.round(range[0])}
          aria-valuetext={`${text(range[0])} to ${text(range[1])}`}
          className={`${slider} pointer-events-auto inset-0 cursor-grab rounded-sm border-2 border-deep bg-surface/30 active:cursor-grabbing`}
          data-mode="pan"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={keys("pan")}
        />
        {(["from", "to"] as const).map((edge) => (
          <div
            key={edge}
            role="slider"
            tabIndex={0}
            aria-label={edge === "from" ? "Start of the time window" : "End of the time window"}
            aria-valuemin={bounds[0]}
            aria-valuemax={bounds[1]}
            aria-valuenow={Math.round(edge === "from" ? range[0] : range[1])}
            aria-valuetext={text(edge === "from" ? range[0] : range[1])}
            className={`${slider} pointer-events-auto inset-y-0 grid w-6 cursor-ew-resize place-items-center rounded-sm ${edge === "from" ? "-left-6 justify-items-end" : "-right-6 justify-items-start"}`}
            data-mode={edge}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={keys(edge)}
          >
            <span aria-hidden className="h-6 w-1.5 rounded-full bg-deep" />
          </div>
        ))}
      </div>
    </div>
  );
}
