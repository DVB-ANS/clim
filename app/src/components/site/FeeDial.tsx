"use client";

import { useId, useState } from "react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { params } from "@/lib/config";
import { feePips } from "@/lib/feeMath";
import { K_DESK_MAX_E4, reachableFeeMaxBp, SIGMA_DESK_MAX_E9, sigmaAtFee } from "@/lib/story";
import { annualPctToSigmaE9, pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";

const SIGMA_MAX = Math.round(sigmaE9ToAnnualPct(SIGMA_DESK_MAX_E9)); // 1000 %/yr: the most the desk publishes
const STEPS = 200; // about 2 %/yr per arrow key near the live σ
// a square-root scale gives calm and stormy markets most of the travel
const toSigma = (step: number) => SIGMA_MAX * (step / STEPS) ** 2;
const toStep = (sigma: number) => Math.round(Math.sqrt(Math.min(SIGMA_MAX, Math.max(0, sigma)) / SIGMA_MAX) * STEPS);
const share = (sigma: number) => Math.sqrt(Math.min(SIGMA_MAX, Math.max(0, sigma)) / SIGMA_MAX);

/** The hook's normal-mode fee for a volatility, with the current parameters (ClimHook.quoteFee). */
const feeAt = (sigmaPct: number, kE4: number) =>
  pipsToBp(feePips(annualPctToSigmaE9(sigmaPct), params.etaE4, params.sqrtHalfDtE6, kE4, params.feeMinPips, params.feeMaxPips));

const W = 520, H = 200, PAD = 8;
const FEE_MAX = pipsToBp(params.feeMaxPips);
const x = (sigma: number) => PAD + share(sigma) * (W - 2 * PAD);
const y = (bp: number) => H - PAD - (bp / FEE_MAX) * (H - 2 * PAD);

/**
 * σ in, fee out: drag the volatility and read the fee the hook would charge in normal mode, on its
 * own formula. Two chips jump to the live σ and to the window's σ peak; pool S's fixed fee and
 * the safe-mode floor are drawn for scale, labelled in HTML so the text keeps its size on any screen.
 * A native range input, so it works with keys and screen readers.
 */
export function FeeDial({ sigmaNow, sigmaPeak, feeSBp, kE4 = 10_000 }: {
  sigmaNow?: number;
  sigmaPeak?: number;
  feeSBp?: number;
  kE4?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const sigma = picked ?? sigmaNow ?? 40;
  const fee = feeAt(sigma, kE4);
  const id = useId();
  const curve = Array.from({ length: 121 }, (_, i) => toSigma((i / 120) * STEPS))
    .map((s, i) => `${i ? "L" : "M"}${x(s).toFixed(1)} ${y(feeAt(s, kE4)).toFixed(1)}`)
    .join("");
  const safe = pipsToBp(params.feeSafePips);
  const reachable = reachableFeeMaxBp(params, kE4);
  const k = (e4: number) => Number((e4 / 10_000).toFixed(2));
  // σ at which the cap binds once a report raises k to the most the desk accepts (RiskDesk clamps k to [1, 2])
  const capAtKMax = sigmaAtFee(FEE_MAX, params, K_DESK_MAX_E4);
  const chip = "rounded-full border border-line px-3 py-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";
  const pctY = (bp: number) => `${(y(bp) / H) * 100}%`;

  return (
    <div className="rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--clim-line)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="leading-none">
          <span className="block text-xs text-fg-subtle">σ {Math.round(sigma)} %/yr → pool V&apos;s fee, normal mode</span>
          <span className="mt-2 inline-flex items-baseline gap-1.5 font-display text-[34px] leading-none tracking-[-0.02em] tabular-nums">
            <AnimatedCounter value={fee} decimals={2} className="-my-[0.25em]" />
            <span className="text-base text-fg-subtle">bp</span>
          </span>
        </p>
        <div className="flex gap-2">
          {sigmaNow !== undefined ? (
            <button type="button" className={chip} onClick={() => setPicked(null)}>
              Now · {sigmaNow.toFixed(0)} %
            </button>
          ) : null}
          {sigmaPeak !== undefined ? (
            <button type="button" className={chip} onClick={() => setPicked(sigmaPeak)}>
              Window peak · {sigmaPeak.toFixed(0)} %
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--clim-line)" vectorEffect="non-scaling-stroke" />
          <line x1={PAD} x2={W - PAD} y1={y(safe)} y2={y(safe)} stroke="var(--clim-muted)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          {feeSBp !== undefined ? (
            <line x1={PAD} x2={W - PAD} y1={y(feeSBp)} y2={y(feeSBp)} stroke="var(--clim-s)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          <path d={curve} fill="none" stroke="var(--clim-v)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {sigmaNow !== undefined ? <circle cx={x(sigmaNow)} cy={y(feeAt(sigmaNow, kE4))} r={5} fill="var(--clim-pink)" stroke="var(--clim-surface)" strokeWidth={2} /> : null}
          <circle cx={x(sigma)} cy={y(fee)} r={6.5} fill="var(--clim-v)" stroke="var(--clim-surface)" strokeWidth={2.5} />
        </svg>
        <span aria-hidden className="absolute left-1 -translate-y-full pb-0.5 text-xs text-fg-subtle" style={{ top: pctY(safe) }}>
          safe-mode floor · {safe} bp
        </span>
        {feeSBp !== undefined ? (
          <span aria-hidden className="absolute right-1 -translate-y-full pb-0.5 text-xs text-fg-subtle" style={{ top: pctY(feeSBp) }}>
            pool S · {feeSBp.toFixed(2)} bp
          </span>
        ) : null}
      </div>

      <label htmlFor={id} className="sr-only">
        Volatility σ, in percent per year
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={STEPS}
        value={toStep(sigma)}
        onChange={(e) => setPicked(toSigma(Number(e.target.value)))}
        aria-valuetext={`σ ${Math.round(sigma)} %/yr, fee ${fee.toFixed(2)} bp${fee <= pipsToBp(params.feeMinPips) ? " (floor)" : ""}`}
        className="mt-2 w-full accent-[var(--clim-accent)]"
      />
      <div aria-hidden className="relative h-4 text-xs text-fg-subtle">
        <span className="absolute left-0">calm</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${share(100) * 100}%` }}>
          100 %
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${share(400) * 100}%` }}>
          400 %
        </span>
        <span className="absolute right-0">{SIGMA_MAX} %/yr</span>
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        The hook&apos;s formula with the lab&apos;s parameters
        {reachable < FEE_MAX
          ? `: at the desk's ${SIGMA_MAX} %/yr ceiling and k = ${k(kE4)} it charges ${reachable.toFixed(2)} bp, so the ${FEE_MAX} bp cap binds only when a report raises k${
              capAtKMax <= SIGMA_MAX ? ` (up to ${k(K_DESK_MAX_E4)}: from about ${Math.round(capAtKMax)} %/yr at k = ${k(K_DESK_MAX_E4)})` : ""
            }`
          : `; with k = ${k(kE4)}, the ${FEE_MAX} bp cap needs σ ≈ ${Math.round(sigmaAtFee(FEE_MAX, params, kE4))} %/yr`}
        . The pink dot is the desk&apos;s σ now.
      </p>
    </div>
  );
}
