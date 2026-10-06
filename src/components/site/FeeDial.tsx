"use client";

import { useId, useState } from "react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { params } from "@/lib/config";
import { feePips } from "@/lib/feeMath";
import { sigmaAtFee } from "@/lib/story";
import { annualPctToSigmaE9, pipsToBp } from "@/lib/units";

const SIGMA_MAX = 900; // %/yr at the slider's end (the cap needs about 824 with the fixture parameters)
const STEPS = 1000;
// a square-root scale gives calm and stormy markets most of the travel
const toSigma = (step: number) => SIGMA_MAX * (step / STEPS) ** 2;
const toStep = (sigma: number) => Math.round(Math.sqrt(Math.min(SIGMA_MAX, Math.max(0, sigma)) / SIGMA_MAX) * STEPS);

/** The hook's fee for a volatility, with the current parameters (ClimHook.quoteFee in normal mode). */
const feeAt = (sigmaPct: number, kE4: number) =>
  pipsToBp(feePips(annualPctToSigmaE9(sigmaPct), params.etaE4, params.sqrtHalfDtE6, kE4, params.feeMinPips, params.feeMaxPips));

const W = 520, H = 200, PAD = 8;
const FEE_MAX = pipsToBp(params.feeMaxPips);
const x = (sigma: number) => PAD + (toStep(sigma) / STEPS) * (W - 2 * PAD);
const y = (bp: number) => H - PAD - (bp / FEE_MAX) * (H - 2 * PAD);

/**
 * σ in, fee out: drag the volatility and read the fee the hook would charge, on the hook's own
 * formula. Two chips jump to the live σ and to the window's storm peak; pool S's fixed fee and the
 * safe-mode floor are drawn for scale. A native range input, so it works with keys and screen readers.
 */
export function FeeDial({ sigmaNow, sigmaPeak, feeSBp, kE4 = 10_000 }: { sigmaNow?: number; sigmaPeak?: number; feeSBp?: number; kE4?: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const sigma = picked ?? sigmaNow ?? 40;
  const fee = feeAt(sigma, kE4);
  const id = useId();
  const curve = Array.from({ length: 121 }, (_, i) => toSigma((i / 120) * STEPS))
    .map((s, i) => `${i ? "L" : "M"}${x(s).toFixed(1)} ${y(feeAt(s, kE4)).toFixed(1)}`)
    .join("");
  const safe = pipsToBp(params.feeSafePips);
  const chip = "rounded-full border border-line px-3 py-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--clim-line)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="leading-none">
          <span className="block text-xs text-fg-subtle">σ {Math.round(sigma)} %/yr → fee on pool V</span>
          <span className="mt-2 inline-flex items-baseline gap-1.5 font-display text-[34px] leading-none tracking-[-0.02em] tabular-nums">
            <AnimatedCounter value={fee} decimals={2} />
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
              Storm peak · {sigmaPeak.toFixed(0)} %
            </button>
          ) : null}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" aria-hidden>
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--clim-line)" />
        <line x1={PAD} x2={W - PAD} y1={y(safe)} y2={y(safe)} stroke="var(--clim-muted)" strokeDasharray="2 4" />
        <text x={PAD + 2} y={y(safe) - 5} fontSize="11" fill="var(--clim-fg-subtle)">
          safe-mode floor · {safe} bp
        </text>
        {feeSBp !== undefined ? (
          <>
            <line x1={PAD} x2={W - PAD} y1={y(feeSBp)} y2={y(feeSBp)} stroke="var(--clim-s)" strokeDasharray="5 4" />
            <text x={W - PAD - 2} y={y(feeSBp) - 5} fontSize="11" textAnchor="end" fill="var(--clim-fg-subtle)">
              pool S · {feeSBp.toFixed(2)} bp
            </text>
          </>
        ) : null}
        <path d={curve} fill="none" stroke="var(--clim-v)" strokeWidth={2} />
        {sigmaNow !== undefined ? <circle cx={x(sigmaNow)} cy={y(feeAt(sigmaNow, kE4))} r={5} fill="var(--clim-pink)" stroke="var(--clim-surface)" strokeWidth={2} /> : null}
        <circle cx={x(sigma)} cy={y(fee)} r={6.5} fill="var(--clim-v)" stroke="var(--clim-surface)" strokeWidth={2.5} />
      </svg>

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
        aria-valuetext={`σ ${Math.round(sigma)} %/yr, fee ${fee.toFixed(2)} bp`}
        className="mt-2 w-full accent-[var(--clim-accent)]"
      />
      <div className="flex justify-between text-[11px] text-fg-subtle">
        <span>calm</span>
        <span>100 %</span>
        <span>400 %</span>
        <span>{SIGMA_MAX} %/yr</span>
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        The hook&apos;s formula with the current parameters{params.fixture ? " (a fixture until the lab writes them)" : ""}. The {FEE_MAX} bp cap
        needs σ ≈ {Math.round(sigmaAtFee(FEE_MAX, params, kE4))} %/yr; the pink dot is the desk&apos;s σ now.
      </p>
    </div>
  );
}
