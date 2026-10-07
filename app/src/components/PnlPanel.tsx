"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { deployments, params } from "@/lib/config";
import { feeRegimes, grouped, pnlCaveat, pnlSentence, relativePct, signed } from "@/lib/ledger";
import { firstPricedSwapSec, pnlExplain, type PnlRow } from "@/lib/pnl";
import { timeAverageFeeBp, weatherSeries } from "@/lib/series";
import { formatBp, pipsToBp } from "@/lib/units";
import { AnimatedCounter } from "./AnimatedCounter";
import { StatusMark } from "./StatusMark";
import { type HeadingLevel, Panel } from "./ui";

// a label column and three numeric columns (V, S, V − S) from sm; below it the label takes its own line
const ROW = "grid grid-cols-3 gap-x-3 sm:grid-cols-[minmax(220px,1fr)_repeat(3,112px)] sm:gap-x-0";
const LABEL = "col-span-3 text-left max-sm:text-[13px] sm:col-span-1";
const NUM = "text-right tabular-nums";
const EASE = "ease-[cubic-bezier(0.2,0,0,1)]";

/** Two bars on one scale, V's and S's hedged P&L, each in its pool's colour (PositionPanel's Compare). */
function Bars({ v, s }: { v: number; s: number }) {
  const max = Math.max(Math.abs(v), Math.abs(s), 1e-9);
  const bar = (x: number, label: string, fill: string) => (
    <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm">
      <span className="text-fg-subtle">{label}</span>
      <span className="h-2.5 rounded-full bg-surface-2">
        <span
          className={`block h-full rounded-full ${fill} transition-[width] duration-500 ${EASE} motion-reduce:transition-none`}
          style={{ width: `${Math.max(2, (Math.abs(x) / max) * 100)}%`, opacity: x < 0 ? 0.45 : 1 }}
        />
      </span>
      <span className={NUM}>{signed(x)}</span>
    </div>
  );
  return (
    <div className="space-y-2" aria-hidden>
      {bar(v, "Pool V", "bg-v")}
      {bar(s, "Pool S", "bg-s")}
    </div>
  );
}

/** One ledger row: a label (and an optional note under it), then V, S and V − S. */
function Line({ label, note, v, s, d, className = "", strong = false }: {
  label: ReactNode;
  note?: ReactNode;
  v: ReactNode;
  s: ReactNode;
  d?: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <tr role="row" className={`${ROW} ${className}`}>
      <th role="rowheader" scope="row" className={`${LABEL} ${strong ? "font-medium" : "font-normal"}`}>
        {label}
        {note ? <span className="mt-0.5 block text-xs leading-snug text-fg-subtle sm:pr-6">{note}</span> : null}
      </th>
      <td role="cell" className={NUM}>{v}</td>
      <td role="cell" className={NUM}>{s}</td>
      <td role="cell" className={NUM}>{d}</td>
    </tr>
  );
}

/**
 * Pool V against pool S as a hedged LP sees them, from the Swap events and the desk's reports only:
 * a ledger (retail fees, minus the loss to arbitrage, gives the hedged P&L) and its headline, V minus S.
 */
export function PnlPanel({ data, level }: { data: ClimData; level?: HeadingLevel }) {
  const rows = useMemo(() => {
    if (!data.pair) return null;
    const row = (poolId: `0x${string}`) =>
      pnlExplain({ swaps: data.swaps, reports: data.reports, poolId, token0IsEth: data.pair!.token0IsEth, arbRouter: data.arbRouter });
    return { v: row(data.pair.V.poolId), s: row(data.pair.S.poolId) };
  }, [data.pair, data.swaps, data.reports, data.arbRouter]);
  const feeCheck = useMemo(() => {
    if (!data.pair || data.reports.length === 0) return null;
    const points = weatherSeries(data.reports, params, data.nowSec);
    const v = timeAverageFeeBp(points, data.nowSec);
    const s = pipsToBp(data.pair.S.key.fee);
    // where V's fee sat above its floor, and why: what the headline may and may not credit to the weather
    const caveat = pnlCaveat(feeRegimes(points, data.nowSec, pipsToBp(params.feeMinPips)), pipsToBp(params.feeMinPips), pipsToBp(params.feeSafePips));
    return { v, s, equal: Math.abs(v - s) <= 0.1 * s, caveat };
  }, [data.pair, data.reports, data.nowSec]);
  if (!rows || !data.pair) return null;
  const { v, s }: { v: PnlRow; s: PnlRow } = rows;
  const vPoolId = data.pair.V.poolId;
  // the headline starts at the first swap the ledger counts (one a desk report prices), not at an unpriced one
  const firstV = firstPricedSwapSec(data.swaps, data.reports, vPoolId);
  const replay = !!deployments.pairs.replay && vPoolId === deployments.pairs.replay.V.poolId;
  // round once, to the whole tUSD shown, and derive every total and difference from the rounded amounts:
  // each row and each column of the ledger then adds up exactly as printed
  const R = Math.round;
  const vFee = R(v.feeRetailUsd), sFee = R(s.feeRetailUsd), vArb = R(v.arbUsd), sArb = R(s.arbUsd);
  const vNet = vFee - vArb, sNet = sFee - sArb, dNet = vNet - sNet;
  const dSign = signed(dNet);
  const arbPct = relativePct(vArb, sArb);
  const unpriced = v.unpricedSwaps + s.unpricedSwaps;
  const sentence = pnlSentence({ vNet, sNet, sinceSec: firstV, replay, fairFee: feeCheck?.equal ?? true });

  return (
    <Panel
      id="pnl"
      level={level}
      title="LP profit and loss, pool V against pool S"
      subtitle="Read from the Swap events and the desk's reports only. Amounts in tUSD, the pair's test dollar: no real money is at stake."
      className="col-span-full"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* the headline: first in reading order, beside the ledger from lg */}
        <div className="lg:col-start-2 lg:row-start-1">
          <p className="text-[13px] text-fg-subtle">Hedged LP P&amp;L, pool V minus pool S</p>
          <p className="mt-1 font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">
            <AnimatedCounter
              value={dSign === "0" ? 0 : Math.abs(dNet)}
              prefix={dSign === "0" ? undefined : dNet > 0 ? "+" : "−"}
              suffix=" tUSD"
              className="-my-[0.25em]"
            />
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{sentence}</p>
          {feeCheck ? <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{feeCheck.caveat}</p> : null}
          <div className="mt-4">
            <Bars v={vNet} s={sNet} />
          </div>
          {feeCheck ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
              {feeCheck.equal ? (
                <>
                  <StatusMark status="done" size={14} className="mt-[3px]" />
                  <span>
                    Average fee: V {formatBp(feeCheck.v, 2)}, S {formatBp(feeCheck.s, 2)}: within 10% of each other.
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden className="text-xs leading-5 text-fg-subtle">▲</span>
                  <span>
                    Average fee: V {formatBp(feeCheck.v, 2)}, S {formatBp(feeCheck.s, 2)}: more than 10% apart.
                  </span>
                </>
              )}
            </p>
          ) : null}
          {data.arbRouter ? null : <p className="mt-2 text-sm text-fg-muted">Arbitrage router unknown: every swap counted as retail.</p>}
        </div>

        {/* the ledger */}
        <div className="mt-8 min-w-0 lg:col-start-1 lg:row-start-1 lg:mt-0">
          <table role="table" className="block w-full" aria-label="LP profit and loss by pool, in tUSD">
            <thead role="rowgroup" className="block">
              <tr role="row" className={`${ROW} pb-2 text-xs`}>
                <td role="cell" className="hidden sm:block" />
                <th role="columnheader" scope="col" className={`${NUM} font-medium text-v`}>Pool V</th>
                <th role="columnheader" scope="col" className={`${NUM} font-medium text-s`}>Pool S</th>
                <th role="columnheader" scope="col" className={`${NUM} font-normal text-fg-subtle`}>V − S</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block text-[15px] text-fg">
              <Line
                className="border-t border-line py-2.5"
                label="Fees from retail traders"
                v={signed(vFee)}
                s={signed(sFee)}
                d={signed(vFee - sFee)}
              />
              <Line
                className="border-t border-line py-2.5"
                label="Lost to arbitrage"
                note="net of the fees arbitrageurs paid"
                v={signed(-vArb)}
                s={signed(-sArb)}
                d={
                  <>
                    {signed(sArb - vArb)}
                    {Number.isFinite(arbPct) ? (
                      <span className="mt-0.5 block text-balance text-xs leading-snug text-fg-subtle">
                        ({Math.abs(arbPct).toFixed(1)}% {arbPct >= 0 ? "more" : "less"} than S)
                      </span>
                    ) : null}
                  </>
                }
              />
              <Line
                className="border-t-2 border-fg py-2.5 font-display text-[20px] font-medium tracking-[-0.01em]"
                strong
                label="Hedged LP P&L"
                v={signed(vNet)}
                s={signed(sNet)}
                d={dSign}
              />
            </tbody>
            <tbody role="rowgroup" className="mt-5 block text-[13px] text-fg-muted">
              <tr role="row" className={`${ROW} pb-1`}>
                <th role="rowheader" scope="rowgroup" colSpan={4} className="col-span-3 text-left text-[13px] font-normal text-fg-subtle sm:col-span-4">
                  Activity
                </th>
              </tr>
              <Line className="border-t border-line py-2" label="Swaps" v={grouped(v.swaps)} s={grouped(s.swaps)} />
              <Line className="border-t border-line py-2" label="Arbitrage swaps" v={grouped(v.arbSwaps)} s={grouped(s.arbSwaps)} />
              <Line className="border-t border-line py-2" label="Volume" v={grouped(v.volumeUsd)} s={grouped(s.volumeUsd)} />
              <Line className="border-t border-line py-2" label="Fees paid by arbitrageurs" v={grouped(v.feeArbUsd)} s={grouped(s.feeArbUsd)} />
              <Line
                className="border-t border-line py-2"
                label="Lost to arbitrage before fees, measured"
                note="lost to arbitrage + fees paid by arbitrageurs"
                v={grouped(vArb + R(v.feeArbUsd))}
                s={grouped(sArb + R(s.feeArbUsd))}
              />
              <Line
                className="border-y border-line py-2"
                label="LVR, model"
                note="the model's estimate of the same loss, from the desk's prices (one every 30 s) and the pool's depth: close to the measured loss in calm markets, it can fall well below it in a fast move, when the price jumps between two reports"
                v={grouped(v.lvrUsd)}
                s={grouped(s.lvrUsd)}
              />
            </tbody>
          </table>
          {unpriced > 0 ? (
            <p className="mt-3 text-[13px] text-fg-subtle">
              {unpriced} swap{unpriced === 1 ? "" : "s"} before the first desk report {unpriced === 1 ? "is" : "are"} not counted.
            </p>
          ) : null}

          <details className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              How it is computed
              <span aria-hidden className="relative size-5 shrink-0 text-fg transition-colors duration-150 group-hover:text-accent">
                <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-current" />
                <span className={`absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rotate-90 rounded-[1px] bg-current transition-[rotate] duration-240 ${EASE} group-open:rotate-180 motion-reduce:transition-none`} />
              </span>
            </summary>
            <p className="max-w-[68ch] pb-2 pt-1 text-[13px] leading-relaxed text-fg-muted">
              A hedged LP holds its pool position and sells short the ETH inside it, so the ETH price cancels out. What is left: the fees retail
              traders pay, minus what arbitrageurs take when they trade the pool back to the market price (after Milionis, Moallemi and
              Roughgarden). Arbitrage swaps are those sent through our arbitrage bot&apos;s router; each is valued at the bot&apos;s own price,
              recovered from the pool price after its swap. Retail fees and LVR use the desk&apos;s reference price at that block. LVR assumes the
              pool&apos;s liquidity stayed at its last value.
            </p>
          </details>
        </div>
      </div>
    </Panel>
  );
}
