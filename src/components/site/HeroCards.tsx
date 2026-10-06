"use client";

import type { WeatherPoint } from "@/lib/series";
import { AnimatedCounter } from "../AnimatedCounter";
import { Cursor } from "./Cursor";
import { LcdStorm } from "./LcdStorm";
import { WeatherMini } from "./WeatherMini";

export type HeroLive = { points: WeatherPoint[]; feeVBp?: number; feeSBp?: number; sigmaPct?: number; modeLabel?: string; seq?: number; simulated: boolean };

const card = "rounded-md border border-line bg-surface shadow-[0_10px_30px_rgba(32,32,32,0.06)]";

const CHIP = { sigma: "bg-sigma-wash text-sigma-ink", deep: "bg-deep/12 text-deep" } as const;

function Chip({ children, tone }: { children: React.ReactNode; tone: keyof typeof CHIP }) {
  return <span className={`grid size-8 shrink-0 place-items-center rounded-full ${CHIP[tone]}`}>{children}</span>;
}

/** A sparkline of V's fee with Ventriloc's highlighted last point. */
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
      <circle cx={220} cy={Y(last.feeVBp)} r={8} fill="var(--clim-v)" fillOpacity={0.18} />
      <circle cx={220} cy={Y(last.feeVBp)} r={3.5} fill="var(--clim-v)" />
    </svg>
  );
}

/** The hero's cluster of live cards: the weather, the fee now (rolling), and the CL-1 instrument's screen. */
export function HeroCards({ live }: { live: HeroLive }) {
  const bp = (x?: number) => (x === undefined ? "…" : x.toFixed(2));
  return (
    <div className="relative flex flex-col gap-4 md:block md:h-[500px]">
      <article className={`${card} rise relative p-4 md:absolute md:right-0 md:top-0 md:w-[86%]`} style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-3">
          <Chip tone="sigma">
            <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden><path d="M2 12V8M7 12V3M12 12V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
          </Chip>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sigma-ink">Weather</p>
            <p className="text-xs text-fg-subtle">σ and the fee it sets, last 2 hours{live.simulated ? " · simulated" : ""}</p>
          </div>
        </div>
        <WeatherMini points={live.points} staticFeeBp={live.feeSBp ?? 0} className="mt-3 h-auto w-full" />
        <Cursor label="Chainlink DON" className="left-[42%] top-[38%]" />
      </article>

      <article className={`${card} rise relative p-4 md:absolute md:left-0 md:top-[262px] md:w-[50%]`} style={{ animationDelay: "240ms" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Fee now · pool V</p>
            <p className="mt-2 font-display text-[32px] leading-none tracking-[-0.02em] tabular-nums">
              {live.feeVBp === undefined ? "…" : <AnimatedCounter value={live.feeVBp} decimals={2} className="-my-[0.25em]" />}{" "}
              <span className="text-base text-fg-subtle">bp</span>
            </p>
            <p className="mt-1.5 text-xs text-fg-subtle">
              <span className="text-deep">vs {bp(live.feeSBp)} bp</span> in pool S · {live.modeLabel ?? "…"} mode
            </p>
          </div>
          <Chip tone="deep">
            <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M7 4v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
          </Chip>
        </div>
        <Spark points={live.points} />
        <Cursor label="ClimHook" className="right-[8%] top-[44%]" delay="-2s" />
      </article>

      <article
        aria-label="CL-1, the risk desk's screen"
        className="rise relative overflow-hidden rounded-md bg-lcd-bg p-4 text-lcd-lit shadow-[0_10px_30px_rgba(14,17,25,0.22)] md:absolute md:right-[2%] md:top-[300px] md:w-[46%]"
        style={{ animationDelay: "360ms" }}
      >
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-lcd-lit/80">CL-1 · risk desk</span>
          <span className="font-lcd text-xs font-bold tracking-wider text-lcd-hot">#{live.seq ?? "…"}</span>
        </div>
        <div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-sm">
          <LcdStorm sigmaPct={live.sigmaPct ?? 40} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-3 bottom-2 flex items-end justify-between font-lcd text-lcd-lit">
            <span>
              <span className="block text-[10px] font-bold opacity-70">σ %/YR</span>
              <span className="text-[34px] font-black leading-none tabular-nums">{live.sigmaPct === undefined ? "…" : live.sigmaPct.toFixed(1)}</span>
            </span>
            <span className="text-right text-xs font-bold uppercase">{live.modeLabel ?? ""}</span>
          </div>
        </div>
        <Cursor label="LP" className="left-[18%] top-[30%]" delay="-4s" />
      </article>
    </div>
  );
}
