"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { params } from "@/lib/config";
import { spanLabel } from "@/lib/ledger";
import { verdictResult, windowLabel } from "@/lib/story";
import { formatTusd, pipsToBp } from "@/lib/units";
import { AnimatedCounter } from "../AnimatedCounter";
import { LaunchLink } from "./LaunchLink";
import { PoolsVersus } from "./PoolsVersus";
import type { LandingData } from "./useLandingData";
import { WeatherMini } from "./WeatherMini";

const bp = (x: number) => `${x.toFixed(2)} bp`;
const FLOOR = pipsToBp(params.feeMinPips);
const pill = "inline-flex min-h-10 items-center rounded-full px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * "Two pools, one market": the window's weather (σ's peak ringed in pink, what each pool charged then),
 * then pool V against pool S, its static twin, on the app's own P&L maths. The verdict only says "same
 * average fee" when PnlPanel's 10 % rule holds, only credits a storm when σ took V's fee off its
 * floor, and names the time V spent in its safe modes (desk outages, not the weather) whenever there
 * was any. Amounts are in tUSD (test tokens); every figure is labelled simulated in mock mode.
 */
export function PoolsSection({ d }: { d: LandingData }) {
  const { storm, verdict: v, simulated } = d;
  // "x % less lost to arbitrage and y % less lost by its hedged LPs", the verdict's numbers
  const result = v ? verdictResult(v) : "";
  // time in a safe mode (desk silent or venues apart): the hook charged its safe fee, whatever the weather
  const safeSec = v ? v.regimes.blindSec + v.regimes.degradedSec : 0;
  const rolling = (x: number): ReactNode => (
    <>
      <AnimatedCounter value={x} decimals={2} className="-my-[0.25em]" /> bp
    </>
  );

  return (
    <section id="pools" aria-labelledby="pools-title" className="anchor bg-surface px-4 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <p className="text-[13px] text-fg-subtle">Pools</p>
        <h2 id="pools-title" className="mt-3 font-display text-[40px] font-normal leading-[1] tracking-[-0.02em] md:text-[52px]">
          Two pools, one market
        </h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-fg-muted">
          Same pair, same retail flow, the same arbitrage bot. One fee reads the weather; the other never moves.
        </p>

        <div className="mt-10 grid gap-6 rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--clim-line)] md:p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">The window&apos;s weather</p>
            <p className="text-xs text-fg-subtle">
              σ and the fee it set, last {storm ? windowLabel(storm.hours) : "hours"}
              {simulated ? " · simulated" : ""}
            </p>
            <WeatherMini
              points={d.windowPoints}
              staticFeeBp={d.feeSBp ?? 0}
              peak={storm ? { t: storm.peakAt, sigmaPct: storm.peakSigma } : undefined}
              className="mt-3 h-auto w-full"
            />
          </div>
          {storm ? (
            <dl className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-5">
              <div>
                <dt className="text-xs text-fg-subtle">Peak σ</dt>
                <dd className="font-display text-[22px] leading-tight tracking-[-0.02em] text-sigma-ink tabular-nums sm:text-[28px] sm:text-sigma">
                  {storm.peakSigma.toFixed(1)} <span className="text-sm text-fg-subtle">%/yr</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Pool V charged then</dt>
                <dd className="font-display text-[22px] leading-tight sm:text-[28px] tracking-[-0.02em] text-signal tabular-nums">
                  {storm.feeVAtPeak.toFixed(2)} <span className="text-sm text-fg-subtle">bp</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Pool S, as always</dt>
                <dd className="font-display text-[22px] leading-tight sm:text-[28px] tracking-[-0.02em] tabular-nums">
                  {storm.feeS.toFixed(2)} <span className="text-sm text-fg-subtle">bp</span>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-fg-muted">Waiting for reports…</p>
          )}
        </div>

        {v ? (
          <>
            <PoolsVersus
              className="mt-6"
              v={{
                title: "Pool V · clim",
                subtitle: "The fee reads the weather",
                rows: [
                  { label: "Fee now", value: rolling(v.V.feeNow) },
                  { label: "Over the window", value: `${v.V.feeMin.toFixed(2)} → ${bp(v.V.feeMax)}` },
                  { label: "Time-average fee", value: bp(v.V.avgFee) },
                  { label: "Lost to arbitrage", value: formatTusd(v.V.arbUsd) },
                  { label: "Hedged LP P&L", value: formatTusd(v.V.netUsd) },
                ],
                actions: (
                  <>
                    <Link href="/swap" className={`${pill} bg-accent text-accent-fg hover:bg-accent-strong`}>
                      Swap on V
                    </Link>
                    <Link href="/lp" className={`${pill} border border-line text-fg hover:border-fg-subtle`}>
                      Add liquidity
                    </Link>
                  </>
                ),
              }}
              s={{
                title: "Pool S · static twin",
                subtitle: "The fee never moves",
                rows: [
                  { label: "Fee now", value: bp(v.S.feeNow) },
                  { label: "Over the window", value: `${bp(v.S.feeNow)}, always` },
                  { label: "Time-average fee", value: bp(v.S.avgFee) },
                  { label: "Lost to arbitrage", value: formatTusd(v.S.arbUsd) },
                  { label: "Hedged LP P&L", value: formatTusd(v.S.netUsd) },
                ],
                actions: (
                  <LaunchLink className={`${pill} border border-line text-fg hover:border-fg-subtle`}>Compare in the dashboard</LaunchLink>
                ),
              }}
            />
            <p className="mt-6 max-w-3xl font-display text-[24px] leading-snug tracking-[-0.01em]">
              {v.sameAvgFee && storm?.stormy ? (
                <>
                  Same average fee. Pool V charged it when the storm came
                  {safeSec > 0 ? ` (and for ${spanLabel(safeSec)} in its safe modes, while the desk was silent or the venues apart)` : ""}: {result}.
                </>
              ) : v.sameAvgFee && storm ? (
                <>
                  Same average fee, but no storm in this window: σ peaked at {storm.peakSigma.toFixed(0)} %/yr, below the{" "}
                  {storm.floorSigma.toFixed(0)} %/yr where V&apos;s fee leaves its {FLOOR} bp floor.{" "}
                  {safeSec > 0
                    ? `V charged more only in its safe modes, for ${spanLabel(safeSec)} (desk silent or venues apart): that, not the weather, is behind the result: ${result}.`
                    : `V charged its floor throughout: ${result}.`}{" "}
                  For a storm, see{" "}
                  <Link href="/replay" className="text-link underline">
                    the 4 February replay
                  </Link>
                  .
                </>
              ) : v.sameAvgFee ? (
                <>Same average fee: {result}.</>
              ) : (
                <>
                  Average fees differ (V {bp(v.V.avgFee)}, S {bp(v.S.avgFee)}), so this window is not a like-for-like comparison: the lab&apos;s
                  backtests at equal fee are the reference.
                </>
              )}
            </p>
            <p className="mt-3 text-[13px] text-fg-muted">
              {simulated ? `Simulated: the same swaps and arbitrage bot on both pools over the last ${windowLabel(v.hours)}, ` : `Over the last ${windowLabel(v.hours)}, `}
              valued from the logs as in the app&apos;s P&amp;L explain (delta-hedged: retail fees − arbitrage), in tUSD, the pair&apos;s test
              token. Every retail order goes to both pools, so neither loses flow to the cheaper one, as it would through a router.
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">Waiting for swaps on both pools…</p>
        )}
      </div>
    </section>
  );
}
