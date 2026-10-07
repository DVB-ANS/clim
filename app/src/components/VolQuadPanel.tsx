"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { LabPTradeBand } from "@/lib/lab";
import { blocksSpan, niceMax, scalePct } from "@/lib/ledger";
import { pnlExplain, sigmaBreakEvenAnnualPct } from "@/lib/pnl";
import { arbBlocksOf, pTradeTotals, makeBlockClock, makePredictor, sigmaArbAnnualPct } from "@/lib/ptrade";
import { timeAverageFeeBp, weatherSeries } from "@/lib/series";
import { dvolE2ToPct, formatPct, sigmaE9ToAnnualPct, tickToEthUsd } from "@/lib/units";
import { AnimatedCounter } from "./AnimatedCounter";
import { Panel } from "./ui";

// label | track | value from sm; label and value over the track below it
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_4.5rem]";
const TRACK = "col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1";
const MOVE = "transition-[left,width] duration-500 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

type Reading = { label: string; sub: string; value: number; mark: string };

/**
 * Three readings of ETH volatility on one 0-to-max scale, as a dot plot against pool V's break-even
 * volatility: right of the dashed line (the pink zone), V's fee income no longer covers its LVR.
 */
export function VolQuadPanel({ data, band }: { data: ClimData; band: LabPTradeBand }) {
  const q = useMemo(() => {
    const last = data.reports.at(-1);
    if (!last || !data.pair || !data.state) return null;
    const pair = data.pair;
    const toBlock = data.state.latestBlock.number;
    const fromBlock = Math.max(data.reports[0].blockNumber, toBlock - band.windowBlocks + 1);
    const clock = makeBlockClock([...data.reports, ...data.swaps].map((x) => ({ block: x.blockNumber, t: x.blockTimestamp })));
    const obs = data.arbRouter
      ? pTradeTotals({ fromBlock, toBlock, arbBlocks: arbBlocksOf(data.swaps, pair.V.poolId, data.arbRouter), predictedAt: makePredictor(data.reports, params, clock) }).observed
      : Number.NaN;
    const from = clock(fromBlock);
    const feeBp = timeAverageFeeBp(weatherSeries(data.reports, params, data.nowSec).filter((p) => p.t >= from), data.nowSec);
    const vSwaps = data.swaps.filter((s) => s.poolId === pair.V.poolId);
    const pnl = pnlExplain({ swaps: data.swaps, reports: data.reports, poolId: pair.V.poolId, token0IsEth: pair.token0IsEth, arbRouter: data.arbRouter });
    const elapsed = vSwaps.length ? data.nowSec - vSwaps[0].blockTimestamp : 0;
    const be = vSwaps.length && elapsed > 0
      ? sigmaBreakEvenAnnualPct((pnl.feeRetailUsd + pnl.feeArbUsd) / elapsed, Number(vSwaps[vSwaps.length - 1].liquidity), tickToEthUsd(last.refTick, pair.token0IsEth))
      : Number.NaN;
    return {
      iv: last.dvolE2 === 0 ? Number.NaN : dvolE2ToPct(last.dvolE2),
      rv: sigmaE9ToAnnualPct(last.rv15E9),
      arb: sigmaArbAnnualPct(feeBp * 100, obs, params.sqrtHalfDtE6),
      be,
    };
  }, [data.reports, data.swaps, data.pair, data.state, data.arbRouter, data.nowSec, band.windowBlocks]);

  const rows: Reading[] = [
    { label: "Realised", sub: "last 15 min, the desk's RV15", value: q?.rv ?? Number.NaN, mark: "bg-sigma" },
    {
      label: "Read from arbitrage on V",
      sub: data.arbRouter
        ? `the σ that matches how often V was arbitraged, last ${band.windowBlocks} blocks (${blocksSpan(band.windowBlocks)})`
        : "needs the arbitrage router address",
      value: q?.arb ?? Number.NaN,
      mark: "bg-v",
    },
    {
      label: "Implied by options",
      sub: q && Number.isNaN(q.iv) ? "DVOL unavailable in this report" : "Deribit DVOL, a 30-day forecast",
      value: q?.iv ?? Number.NaN,
      mark: "bg-muted",
    },
  ];
  const be = q?.be ?? Number.NaN;
  const hasBe = Number.isFinite(be);
  const max = niceMax(Math.max(...[...rows.map((r) => r.value), be].filter(Number.isFinite)));
  const at = (x: number) => `${scalePct(x, max)}%`;
  const bePct = scalePct(be, max);
  // the break-even label sits centred on the line, or flush against it near either end of the track
  const beLabel: CSSProperties =
    bePct < 15 ? { left: `${bePct}%` } : bePct > 85 ? { right: `${100 - bePct}%` } : { left: `${bePct}%`, transform: "translateX(-50%)" };

  return (
    <Panel
      title="Volatility against V's break-even"
      subtitle="Three readings of ETH volatility on one scale, in % a year. Right of the dashed line, pool V's fees no longer cover its LVR: what LPs lose to arbitrageurs trading at stale prices."
    >
      {/* the break-even line's label, over the track column */}
      <div className={ROW} aria-hidden>
        <div className={`relative h-5 ${TRACK}`}>
          {hasBe ? (
            <span className={`absolute bottom-0.5 whitespace-nowrap text-xs text-fg ${MOVE}`} style={beLabel}>
              Break-even {formatPct(be)}
            </span>
          ) : null}
        </div>
      </div>

      <ul>
        {rows.map((r) => {
          const ok = Number.isFinite(r.value);
          return (
            <li key={r.label} className={`${ROW} border-t border-line py-3 sm:items-stretch sm:py-0`}>
              <div className="min-w-0 sm:col-start-1 sm:row-start-1 sm:py-3.5">
                <div className="text-sm text-fg">{r.label}</div>
                <div className="mt-0.5 text-xs leading-snug text-fg-subtle">{r.sub}</div>
              </div>
              <div className="self-center text-right sm:col-start-3 sm:row-start-1 sm:py-3.5">
                {ok ? (
                  <AnimatedCounter value={r.value} decimals={1} suffix="%" className="-my-[0.25em] font-display text-xl tabular-nums" />
                ) : (
                  <span className="font-display text-xl text-fg-subtle">n/a</span>
                )}
              </div>
              <div className={`relative mt-2 h-6 sm:mt-0 sm:h-auto ${TRACK}`} aria-hidden>
                {hasBe ? <div className={`absolute inset-y-0 right-0 bg-sigma-wash ${MOVE}`} style={{ left: at(be) }} /> : null}
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                {hasBe ? <div className={`absolute inset-y-0 border-l border-dashed border-deep ${MOVE}`} style={{ left: at(be) }} /> : null}
                {ok ? (
                  <>
                    <div className={`absolute left-0 top-1/2 h-0.5 -translate-y-1/2 ${r.mark} ${MOVE}`} style={{ width: at(r.value) }} />
                    <div className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.mark} ${MOVE}`} style={{ left: at(r.value) }} />
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* the scale */}
      <div className={`${ROW} border-t border-line pt-1.5`} aria-hidden>
        <div className={`flex justify-between text-xs tabular-nums text-fg-subtle ${TRACK}`}>
          <span>0%</span>
          <span>{max / 2}%</span>
          <span>{max}%</span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed">
        {!q ? (
          <span className="text-fg-subtle">Waiting for the desk&apos;s first report.</span>
        ) : !hasBe ? (
          <span className="text-fg-subtle">Break-even needs swaps on pool V.</span>
        ) : (
          <>
            {q.rv < be ? (
              <span className="text-fg">
                Realised σ ({formatPct(q.rv)}) is below V&apos;s break-even ({formatPct(be)}): at this weather, V&apos;s fees cover its LVR.
              </span>
            ) : (
              <span className="text-sigma-ink">
                Realised σ ({formatPct(q.rv)}) is above V&apos;s break-even ({formatPct(be)}): if it stays there, V&apos;s fees will not cover its LVR.
              </span>
            )}{" "}
            <span className="text-fg-subtle">Break-even uses V&apos;s fee income since its first swap.</span>
          </>
        )}
      </p>
    </Panel>
  );
}
