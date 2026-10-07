"use client";

import { type ReactNode, useEffect, useRef } from "react";

type Live = { seq?: number; sigmaPct?: number; dispBp?: number; sources?: number; feeVBp?: number; feeSBp?: number };

const VENUES = ["Coinbase", "Kraken", "Binance", "Hyperliquid"];
const VY = [22, 88, 154, 220];
// rails, in the order a report travels them: venues and DVOL, then the CRE workflow, RiskDesk, the hook, the pools
const RAILS = [
  ...VY.map((y) => `M152 ${y + 25} C 176 ${y + 25}, 176 186, 196 186`),
  "M152 311 C 176 311, 176 200, 196 196",
  "M356 186 L 392 186",
  "M516 186 L 548 186",
  "M652 176 C 668 160, 668 96, 684 92",
  "M652 196 C 668 212, 668 276, 684 280",
];
const STAGE = [0, 0, 0, 0, 0, 1, 2, 3, 3];

/** Icon strokes in the signal blue, drawn at the node's top-left corner (Ventriloc's line icons). */
function Icon({ kind, x, y }: { kind: "venue" | "don" | "desk" | "hook" | "pool"; x: number; y: number }) {
  const s = { fill: "none", stroke: "var(--clim-signal)", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const t = `translate(${x} ${y})`;
  if (kind === "venue") return <path transform={t} d="M2 14V9M7 14V4M12 14V7" {...s} />;
  if (kind === "don") return <path transform={t} d="M7 1l6 3.5v7L7 15l-6-3.5v-7z M7 5.5v5" {...s} />;
  if (kind === "desk") return <path transform={t} d="M1 3.5C1 2 13 2 13 3.5v9C13 14 1 14 1 12.5z M1 3.5C1 5 13 5 13 3.5 M1 8c0 1.5 12 1.5 12 0" {...s} />;
  if (kind === "hook") return <path transform={t} d="M9 1v8a4 4 0 0 1-8 0V7" {...s} />;
  return <path transform={t} d="M7 1C5 5 2 7 2 10a5 5 0 0 0 10 0c0-3-3-5-5-9z" {...s} />;
}

/** A connector of the stacked layout: a navy rail with an arrowhead, and a packet on every new report. */
function Rail({ seq, stage, dir }: { seq?: number; stage: number; dir: "down" | "right" }) {
  const down = dir === "down";
  return (
    <div aria-hidden className={down ? "relative mx-auto h-7 w-px bg-deep" : "relative h-px w-8 shrink-0 bg-deep"}>
      <span
        className={
          down
            ? "absolute -bottom-px left-1/2 -translate-x-1/2 border-x-4 border-t-[6px] border-x-transparent border-t-deep"
            : "absolute -right-px top-1/2 -translate-y-1/2 border-y-4 border-l-[6px] border-y-transparent border-l-deep"
        }
      />
      {seq !== undefined ? (
        <span
          key={seq}
          className={`absolute size-2 rounded-full bg-signal ${down ? "left-1/2 -ml-1 animate-[clim-packet-y_520ms_ease-in-out_both]" : "top-1/2 -mt-1 animate-[clim-packet-x_520ms_ease-in-out_both]"}`}
          style={{ animationDelay: `${stage * 420}ms` }}
        />
      ) : null}
    </div>
  );
}

/** A node of the stacked layout: a white card with the diagram's line icon, its name and its readings. */
function Node({ kind, name, children, className = "" }: { kind: "venue" | "desk" | "hook" | "pool"; name: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-sm border border-line bg-surface px-3 py-2 ${className}`}>
      <p className="flex items-center gap-2 text-[13px] text-fg">
        <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
          <Icon kind={kind} x={1} y={0} />
        </svg>
        {name}
      </p>
      {children ? <div className="mt-0.5 space-y-0.5 text-xs text-fg-subtle">{children}</div> : null}
    </div>
  );
}

/**
 * The risk desk's pipeline as a live architecture canvas: four venues feed a Chainlink CRE workflow
 * (Deribit's DVOL is logged alongside, dashed: it does not enter σ), which takes the median of each
 * field and writes one report to RiskDesk; ClimHook reads it inside each swap and prices pools V and S.
 * The workflow runs in CRE's one-node simulator (written for a DON, whose nodes would sign the report; not deployed on one).
 * A packet runs the rails on every new report. The drawing needs 770 px to keep its text at 12 px or
 * more, so a narrower box (phones, and the two-column panel on wide screens) gets the same pipeline as
 * stacked HTML cards instead (a container query on this component's own width).
 */
export function PipelineDiagram({ live, simulated = false }: { live: Live; simulated?: boolean }) {
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    if (live.seq === undefined || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      let running = false;
      RAILS.forEach((_, i) => {
        const path = paths.current[i], dot = dots.current[i];
        if (!path || !dot) return;
        const k = (now - t0 - STAGE[i] * 420) / 520;
        if (k < 0 || k > 1) {
          dot.setAttribute("opacity", "0");
          running ||= k < 0;
          return;
        }
        running = true;
        const p = path.getPointAtLength(path.getTotalLength() * k);
        dot.setAttribute("cx", p.x.toFixed(1));
        dot.setAttribute("cy", p.y.toFixed(1));
        dot.setAttribute("opacity", "1");
      });
      if (running) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live.seq]);

  const pct = (x?: number) => (x === undefined ? "…" : `${x.toFixed(1)}%`);
  const bp = (x?: number) => (x === undefined ? "…" : `${x.toFixed(2)} bp`);
  const label =
    "Four venues feed a Chainlink CRE workflow (Deribit DVOL is logged alongside), run today in CRE's one-node simulator; its median report goes to RiskDesk on Ethereum Sepolia, and ClimHook reads it to price pools V and S";
  return (
    <div className="@container relative rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-2.5 text-xs text-fg-subtle">clim · risk desk pipeline{simulated ? " · simulated" : ""}</div>

      {/* wide box: the drawing, at 1:1 or larger */}
      <svg viewBox="0 0 770 350" className="hidden h-auto w-full @min-[770px]:block" role="img" aria-label={label}>
        <defs>
          <marker id="clim-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0l8 4-8 4z" fill="var(--clim-deep)" />
          </marker>
        </defs>
        {RAILS.map((d, i) => (
          <path
            key={d}
            ref={(el) => { paths.current[i] = el; }}
            d={d}
            fill="none"
            stroke="var(--clim-deep)"
            strokeWidth={1.2}
            strokeDasharray={i === 4 || i === RAILS.length - 1 ? "5 4" : undefined}
            markerEnd="url(#clim-arrow)"
          />
        ))}
        <g fontFamily="var(--font-inter)" fontSize={13} fill="var(--clim-fg)">
          {VENUES.map((v, i) => (
            <g key={v}>
              <rect x={12} y={VY[i]} width={140} height={50} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
              <Icon kind="venue" x={22} y={VY[i] + 9} />
              <text x={42} y={VY[i] + 21}>{v}</text>
              <text x={42} y={VY[i] + 38} fontSize={12} fill="var(--clim-fg-subtle)">1-min ETH candles</text>
            </g>
          ))}
          <rect x={12} y={286} width={140} height={50} rx={6} fill="var(--clim-wash)" stroke="var(--clim-line)" />
          <Icon kind="venue" x={22} y={295} />
          <text x={42} y={307}>Deribit DVOL</text>
          <text x={42} y={324} fontSize={12} fill="var(--clim-fg-subtle)">logged, not in σ</text>

          <rect x={196} y={131} width={160} height={110} rx={8} fill="var(--clim-fg)" />
          <text x={210} y={157} fill="var(--clim-surface)">Chainlink CRE</text>
          <text x={210} y={175} fontSize={12} fill="var(--clim-muted)">simulator · 1 node</text>
          <text x={210} y={203} fill="var(--clim-surface)">σ {pct(live.sigmaPct)}</text>
          <text x={210} y={223} fontSize={12} fill="var(--clim-muted)">{live.dispBp ?? "…"} bp · {live.sources ?? "…"}/4 venues</text>

          <rect x={392} y={150} width={124} height={74} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
          <Icon kind="desk" x={402} y={160} />
          <text x={422} y={172}>RiskDesk</text>
          <text x={402} y={194} fontSize={12}>report #{live.seq ?? "…"}</text>
          <text x={402} y={212} fontSize={12} fill="var(--clim-fg-subtle)">Ethereum Sepolia</text>

          <rect x={548} y={150} width={104} height={74} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
          <Icon kind="hook" x={558} y={160} />
          <text x={576} y={172}>ClimHook</text>
          <text x={558} y={194} fontSize={12}>quoteFee()</text>
          <text x={558} y={212} fontSize={12} fill="var(--clim-signal)">{bp(live.feeVBp)}</text>

          <rect x={684} y={62} width={80} height={60} rx={6} fill="var(--clim-surface)" stroke="var(--clim-signal)" />
          <Icon kind="pool" x={692} y={70} />
          <text x={710} y={82}>Pool V</text>
          <text x={692} y={108} fontSize={12} fill="var(--clim-signal)">{bp(live.feeVBp)}</text>
          <rect x={684} y={250} width={80} height={60} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
          <Icon kind="pool" x={692} y={258} />
          <text x={710} y={270}>Pool S</text>
          <text x={692} y={296} fontSize={12}>{bp(live.feeSBp)}</text>
        </g>
        {RAILS.map((d, i) => (
          <circle key={`dot-${d}`} ref={(el) => { dots.current[i] = el; }} r={4} fill="var(--clim-signal)" opacity={0} />
        ))}
      </svg>

      {/* narrow box: the same pipeline, stacked, in real text */}
      <div className="p-3 @min-[770px]:hidden" role="group" aria-label="Risk desk pipeline">
        <div className="grid grid-cols-2 gap-2 @min-[520px]:grid-cols-4">
          {VENUES.map((v) => (
            <Node key={v} kind="venue" name={v}>
              <p>1-min ETH candles</p>
            </Node>
          ))}
          <Node kind="venue" name="Deribit DVOL" className="col-span-full border-dashed bg-wash">
            <p>logged alongside, not in σ</p>
          </Node>
        </div>
        <Rail seq={live.seq} stage={0} dir="down" />
        <div className="rounded-md bg-fg px-3 py-2.5 text-surface">
          <p className="flex items-center gap-2 text-[13px]">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
              <Icon kind="don" x={1} y={0} />
            </svg>
            Chainlink CRE
          </p>
          <p className="mt-0.5 text-xs text-muted">simulator · 1 node · median of each field</p>
          <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
            <span>σ {pct(live.sigmaPct)}</span>
            <span className="text-xs text-muted">{live.dispBp ?? "…"} bp apart · {live.sources ?? "…"}/4 venues</span>
          </p>
        </div>
        <Rail seq={live.seq} stage={1} dir="down" />
        <div className="flex flex-col @min-[520px]:flex-row">
          <Node kind="desk" name="RiskDesk" className="@min-[520px]:flex-1">
            <p className="text-fg">report #{live.seq ?? "…"}</p>
            <p>Ethereum Sepolia</p>
          </Node>
          <div className="@min-[520px]:hidden">
            <Rail seq={live.seq} stage={2} dir="down" />
          </div>
          <div className="hidden items-center @min-[520px]:flex">
            <Rail seq={live.seq} stage={2} dir="right" />
          </div>
          <Node kind="hook" name="ClimHook" className="@min-[520px]:flex-1">
            <p className="text-fg">quoteFee()</p>
            <p className="text-signal">{bp(live.feeVBp)}</p>
          </Node>
        </div>
        <Rail seq={live.seq} stage={3} dir="down" />
        <div className="grid grid-cols-2 gap-2">
          <Node kind="pool" name="Pool V" className="border-signal">
            <p className="text-signal">{bp(live.feeVBp)}</p>
          </Node>
          <Node kind="pool" name="Pool S">
            <p className="text-fg">{bp(live.feeSBp)}</p>
          </Node>
        </div>
      </div>
    </div>
  );
}
