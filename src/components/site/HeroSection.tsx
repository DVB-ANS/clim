"use client";

import type { CSSProperties } from "react";
import { params } from "@/lib/config";
import { pipsToBp } from "@/lib/units";
import { AnimatedCounter } from "../AnimatedCounter";
import { Wordmark } from "../Wordmark";
import { HeroCards } from "./HeroCards";
import { LaunchButton } from "./LaunchButton";
import { Magnet } from "./Magnet";
import { PointerHighlight } from "./PointerHighlight";
import type { LandingData } from "./useLandingData";

const HEADLINE = ["Your", "Liquidity.", "Our", "Risk", "Desk.", "Fees", "That", "Follow", "The"];

/**
 * The hero, with no bar above it: the wordmark, the promise (its words rise one by one, then a pink box
 * draws around "Storm" with the desk's σ on its cursor), one sentence of mechanism, Launch app first
 * and largest, a live trust line, and the desk's cards on the right. "Scroll to learn more" closes it;
 * #hero-end tells the floating nav when to appear.
 */
export function HeroSection({ d }: { d: LandingData }) {
  const sigma = d.sigmaPct;
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-x-clip bg-surface">
      <div className="mx-auto flex min-h-svh max-w-[1200px] flex-col px-4">
        <div className="flex items-center justify-between gap-4 py-5">
          <Wordmark className="text-[30px]" />
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted">Ethereum Sepolia{d.simulated ? " · simulated" : ""}</span>
        </div>

        <div className="grid flex-1 items-center gap-12 pb-8 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="rise inline-flex rounded-full bg-pink-wash px-3 py-1 text-[13px] text-sigma-ink">Storm insurance for Uniswap v4 LPs</p>
            <h1 id="hero-title" className="mt-6 font-display text-[44px] font-normal leading-[0.98] tracking-[-0.02em] sm:text-[58px] lg:text-[66px]">
              {HEADLINE.map((w, i) => (
                <span key={i}>
                  <span className="rise-word" style={{ "--i": i } as CSSProperties}>
                    {w}
                  </span>{" "}
                </span>
              ))}
              <span className="rise-word" style={{ "--i": HEADLINE.length } as CSSProperties}>
                <PointerHighlight label={`σ ${sigma === undefined ? "…" : sigma.toFixed(1)} %/yr`} className="text-sigma">
                  Storm
                </PointerHighlight>
                .
              </span>
            </h1>
            <p className="rise mt-10 max-w-[34rem] text-[18px] leading-[1.45] text-fg-muted" style={{ animationDelay: "250ms" }}>
              A Chainlink CRE risk desk reads ETH on Coinbase, Kraken, Binance and Hyperliquid every 30 seconds. A Uniswap v4 hook turns that
              volatility into the fee of every swap:{" "}
              <span className="text-sigma-ink">
                {pipsToBp(params.feeMinPips)} bp in calm markets, up to {pipsToBp(params.feeMaxPips)} bp in a storm
              </span>
              .
            </p>
            <div className="rise mt-8 flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-center" style={{ animationDelay: "350ms" }}>
              <Magnet className="w-full min-[480px]:w-auto">
                <LaunchButton size="lg" className="w-full min-[480px]:w-auto">
                  Launch app
                </LaunchButton>
              </Magnet>
              <a
                href="#how"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-line px-6 text-[16px] text-fg transition-colors hover:border-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                How it works
                <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                  <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
            <p className="rise mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-subtle" style={{ animationDelay: "450ms" }}>
              <span aria-hidden className="size-2 rounded-full bg-pink" />
              <span>Live from the desk</span>
              {d.last ? (
                <span>
                  · report #{d.last.seq} · {d.last.nSources}/4 venues · σ{" "}
                  {sigma === undefined ? "…" : <AnimatedCounter value={sigma} decimals={1} className="-my-[0.25em]" />} %/yr
                </span>
              ) : null}
              {d.simulated ? <span>· simulated until the contracts are on Sepolia</span> : null}
            </p>
          </div>
          <HeroCards
            live={{ points: d.points, feeVBp: d.feeVBp, feeSBp: d.feeSBp, sigmaPct: sigma, modeLabel: d.modeLabel, seq: d.last?.seq, simulated: d.simulated }}
          />
        </div>

        <a
          href="#problem"
          className="mx-auto mb-6 flex flex-col items-center gap-1 rounded-sm text-[13px] text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          Scroll to learn more
          <svg viewBox="0 0 16 16" className="scroll-cue size-4" aria-hidden>
            <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
      <div id="hero-end" aria-hidden className="h-px" />
    </section>
  );
}
