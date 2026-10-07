"use client";

import Link from "next/link";
import type { WeatherPoint } from "@/lib/series";
import { AnimatedCounter } from "../AnimatedCounter";
import { linkCls } from "../ui";
import { StormSpiral } from "./StormSpiral";
import { WeatherMini } from "./WeatherMini";

export type HeroLive = { points: WeatherPoint[]; feeVBp?: number; feeSBp?: number; sigmaPct?: number; modeLabel?: string; seq?: number; silent?: string };

/* Flat hairline cards, as on the deck's slides: no drop shadows. */
const card = "rounded-md border border-line bg-surface";

const CHIP = { sigma: "bg-sigma-wash text-sigma-ink", s: "bg-s/12 text-s" } as const;

function Chip({ children, tone }: { children: React.ReactNode; tone: keyof typeof CHIP }) {
  return <span className={`grid size-8 shrink-0 place-items-center rounded-full ${CHIP[tone]}`}>{children}</span>;
}

/** A sparkline of V's fee ending in a flat dot on its last point (no halo, as on the deck's slides). */
function Spark({ points }: { points: WeatherPoint[] }) {
  const xs = points.slice(-60);
  if (xs.length < 2) return null;
  const max = Math.max(...xs.map((p) => p.feeVBp)) * 1.15, min = Math.min(...xs.map((p) => p.feeVBp)) * 0.85;
  const X = (i: number) => (i / (xs.length - 1)) * 220, Y = (v: number) => 60 - ((v - min) / Math.max(1e-9, max - min)) * 52;
  const d = xs.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.feeVBp).toFixed(1)}`).join("");
  const last = xs.at(-1)!;
  return (
    <svg viewBox="0 0 230 66" className="mt-3 h-16 w-full" aria-hidden>
      <path d={`${d}L220 66L0 66Z`} fill="var(--clim-v)" fillOpacity={0.08} />
      <path d={d} fill="none" stroke="var(--clim-v)" strokeWidth={1.6} />
      <circle cx={220} cy={Y(last.feeVBp)} r={3.5} fill="var(--clim-v)" />
    </svg>
  );
}

/**
 * The hero's cluster of live cards: the weather, the fee now (rolling), and the CL-1 risk desk's card,
 * which says the desk runs in Chainlink CRE's simulator on one node, carries the deck's storm (StormSpiral,
 * sized by the art box's height so the whole spiral shows), the latest σ with the mode, and, when the desk
 * has gone silent, since when.
 */
export function HeroCards({ live }: { live: HeroLive }) {
  const bp = (x?: number) => (x === undefined ? "…" : x.toFixed(2));
  return (
    <div className="relative flex flex-col gap-4 md:grid md:grid-cols-2 lg:block lg:h-[540px]">
      <article className={`${card} rise relative p-4 md:col-span-2 lg:absolute lg:right-0 lg:top-0 lg:w-[86%]`} style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-3">
          <Chip tone="sigma">
            <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden><path d="M2 12V8M7 12V3M12 12V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
          </Chip>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sigma-ink">Weather</p>
            <p className="text-xs text-fg-subtle">σ and the fee it sets, last 2 hours</p>
          </div>
        </div>
        <WeatherMini points={live.points} staticFeeBp={live.feeSBp ?? 0} className="mt-3 h-auto w-full" />
      </article>

      <article className={`${card} rise relative p-4 lg:absolute lg:left-0 lg:top-[262px] lg:w-[50%]`} style={{ animationDelay: "240ms" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Fee now · pool V</p>
            <p className="mt-2 font-display text-[32px] leading-none tracking-[-0.02em] tabular-nums">
              {live.feeVBp === undefined ? "…" : <AnimatedCounter value={live.feeVBp} decimals={2} className="-my-[0.25em]" />}{" "}
              <span className="text-base text-fg-subtle">bp</span>
            </p>
            <p className="mt-1.5 text-xs text-fg-subtle">
              <span className="text-s">vs {bp(live.feeSBp)} bp</span> in pool S · {live.modeLabel ?? "…"} mode
            </p>
          </div>
          <Chip tone="s">
            <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M7 4v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
          </Chip>
        </div>
        <Spark points={live.points} />
      </article>

      <article aria-label="CL-1, the risk desk's card" className={`${card} rise relative p-4 lg:absolute lg:right-[2%] lg:top-[300px] lg:w-[46%]`} style={{ animationDelay: "360ms" }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">CL-1 · risk desk</p>
          <span className="text-xs tabular-nums text-sigma-ink">#{live.seq ?? "…"}</span>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">Chainlink CRE simulator · 1 node</p>
        {live.silent ? (
          <p className="text-xs text-fg-subtle">
            {live.silent} ·{" "}
            <Link className={linkCls} href="/app#start" aria-label="Why the desk is silent">
              why
            </Link>
          </p>
        ) : null}
        <div className="relative mt-3 aspect-[16/9] overflow-hidden">
          {/* sized by the box's height: every arm and the eye show, only a sliver is cropped on the right, as on the cover */}
          <StormSpiral className="absolute -right-[4%] top-1/2 aspect-square h-[110%] w-auto max-w-none -translate-y-1/2 text-pink" />
          {/* σ and the mode sit left of the spiral, on an opaque ground in case a narrow width brings them together */}
          <span className="absolute bottom-0 left-0 bg-surface pr-2">
            <span className="block text-xs text-fg-subtle">σ %/yr</span>
            <span className="block font-display text-[34px] leading-none tracking-[-0.02em] tabular-nums text-sigma">
              {live.sigmaPct === undefined ? "…" : live.sigmaPct.toFixed(1)}
            </span>
            {live.modeLabel ? <span className="mt-1 block text-xs text-fg-muted">{live.modeLabel} mode</span> : null}
          </span>
        </div>
      </article>
    </div>
  );
}
