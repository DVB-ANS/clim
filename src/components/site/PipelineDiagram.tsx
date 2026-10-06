"use client";

import { useEffect, useRef } from "react";
import { Cursor } from "./Cursor";

type Live = { seq?: number; sigmaPct?: number; dispBp?: number; sources?: number; feeVBp?: number; feeSBp?: number };

const VENUES = ["Coinbase", "Kraken", "Binance", "Hyperliquid"];
const VY = [22, 88, 154, 220];
// rails, in the order a report travels them: venues and DVOL, then the DON, RiskDesk, the hook, the pools
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

/**
 * The risk desk's pipeline as a live architecture canvas: four venues and Deribit's DVOL feed the
 * Chainlink CRE DON, which signs one report to RiskDesk; ClimHook reads it inside each swap and
 * prices pools V and S. A packet runs the rails on every new report.
 */
export function PipelineDiagram({ live }: { live: Live }) {
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
  return (
    <div className="relative rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-fg-subtle">
        <span>clim · risk desk pipeline</span>
        <span className="flex items-center gap-2">
          <span className="size-4 rounded-full bg-wash ring-1 ring-line" />
          100%
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 770 350" className="block h-auto w-full min-w-[560px]" role="img" aria-label="Four venues and Deribit feed the Chainlink CRE network, which writes RiskDesk; ClimHook reads it and prices pools V and S">
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
              strokeDasharray={i === RAILS.length - 1 ? "5 4" : undefined}
              markerEnd="url(#clim-arrow)"
            />
          ))}
          <g fontFamily="var(--font-inter)" fontSize={13} fill="var(--clim-fg)">
            {VENUES.map((v, i) => (
              <g key={v}>
                <rect x={12} y={VY[i]} width={140} height={50} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
                <Icon kind="venue" x={22} y={VY[i] + 9} />
                <text x={42} y={VY[i] + 21}>{v}</text>
                <text x={42} y={VY[i] + 38} fontSize={10.5} fill="var(--clim-fg-subtle)">1-min ETH candles</text>
              </g>
            ))}
            <rect x={12} y={286} width={140} height={50} rx={6} fill="var(--clim-wash)" stroke="var(--clim-line)" />
            <Icon kind="venue" x={22} y={295} />
            <text x={42} y={307}>Deribit DVOL</text>
            <text x={42} y={324} fontSize={10.5} fill="var(--clim-fg-subtle)">the market&apos;s forecast</text>

            <rect x={196} y={131} width={160} height={110} rx={8} fill="var(--clim-fg)" />
            <text x={210} y={157} fill="var(--clim-surface)">Chainlink CRE</text>
            <text x={210} y={175} fontSize={11} fill="var(--clim-muted)">DON · signed median</text>
            <text x={210} y={203} fontSize={12} fill="var(--clim-surface)">σ {pct(live.sigmaPct)}</text>
            <text x={210} y={223} fontSize={11.5} fill="var(--clim-muted)">{live.dispBp ?? "…"} bp · {live.sources ?? "…"}/4 venues</text>

            <rect x={392} y={150} width={124} height={74} rx={6} fill="var(--clim-surface)" stroke="var(--clim-line)" />
            <Icon kind="desk" x={402} y={160} />
            <text x={422} y={172}>RiskDesk</text>
            <text x={402} y={194} fontSize={12}>report #{live.seq ?? "…"}</text>
            <text x={402} y={212} fontSize={10.5} fill="var(--clim-fg-subtle)">Ethereum Sepolia</text>

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
      </div>
      <Cursor label="Chainlink DON" className="left-[24%] top-[13%]" />
    </div>
  );
}
