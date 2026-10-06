// The landing's story in numbers: the storm the desk just went through, pool V against its static
// twin S, and how often the hook fell back to a safe mode. Pure functions over the same logs and maths
// as the dashboard (weatherSeries, pnlExplain, blindEpisodes), no React. Values come display-ready:
// σ in %/yr, fees in bp, windows in hours (to 0.1 h), durations in seconds where the name says Sec.
// stormSummary, poolsVerdict and safetyCounts return undefined for an empty or zero-length window.
import type { Address } from "viem";
import type { DeskReport, SwapRow } from "./decode";
import type { PairDeployment } from "./deployments";
import { type FeeParams, feePips, quoteFee } from "./feeMath";
import { type PnlRow, pnlExplain } from "./pnl";
import { blindEpisodes, deskStateOf, DISP_MAX_BP, timeAverageFeeBp, weatherSeries } from "./series";
import { PIPS_PER_BP, pipsToBp, sigmaE9ToAnnualPct } from "./units";

/** From the first report's landing to `end` (default: the last report's), or undefined when empty or zero-length. */
function windowHours(reports: DeskReport[], end?: number): number | undefined {
  const first = reports[0];
  if (!first) return undefined;
  const to = end ?? reports[reports.length - 1].blockTimestamp;
  if (!(to > first.blockTimestamp)) return undefined;
  return Math.round((to - first.blockTimestamp) / 360) / 10;
}

export type StormSummary = {
  peakSigma: number; // highest σ the desk applied in the window, %/yr
  peakAt: number; // unix s: when that report landed (the weather series' time axis)
  feeVAtPeak: number; // bp: the hook's quote as that report landed, with its state (a degraded flag included)
  feeS: number; // bp: pool S's fixed fee
  hours: number; // window length
};

/** The storm of the window: its σ peak, the fee pool V charged then, and pool S's fee for scale. */
export function stormSummary(reports: DeskReport[], params: FeeParams, o: { staticFeePips: number; nowSec?: number }): StormSummary | undefined {
  const hours = windowHours(reports, o.nowSec);
  if (hours === undefined) return undefined;
  const peak = reports.reduce((a, r) => (r.sigmaApplied > a.sigmaApplied ? r : a));
  return {
    peakSigma: sigmaE9ToAnnualPct(peak.sigmaApplied),
    peakAt: peak.blockTimestamp,
    feeVAtPeak: pipsToBp(quoteFee(deskStateOf(peak), peak.blockTimestamp, params).feePips),
    feeS: pipsToBp(o.staticFeePips),
    hours,
  };
}

/** PnlPanel's rule for a fair comparison: V's time-average fee within 10 % of S's fixed fee. */
export function sameAverageFee(avgVBp: number, feeSBp: number): boolean {
  return Math.abs(avgVBp - feeSBp) <= 0.1 * feeSBp;
}

/** One pool over the window: its row of PnlPanel's P&L explain (same field names), plus the fees it charged, in bp. */
export type PoolStory = PnlRow & {
  feeNow: number;
  feeMin: number;
  feeMax: number;
  avgFee: number; // time-weighted: timeAverageFeeBp of the hook's step series for V, the fixed fee for S
};

export type PoolsVerdict = {
  V: PoolStory;
  S: PoolStory;
  sameAvgFee: boolean; // sameAverageFee(V.avgFee, S.avgFee): only then may the copy say "same average fee"
  arbChangePct: number; // PnlPanel's "ARB on V vs S": V.arbUsd / S.arbUsd - 1, in % (negative: V lost less to arbitrage)
  pnlChangePct: number; // V's hedged LP P&L against S's, in % of |S's| (positive: V's LPs made more)
  hours: number; // window length
};

/**
 * Pool V against pool S over the window, from the logs only (pnlExplain, as in PnlPanel), with the
 * verdict's branch already decided. Undefined until there is a window and priced swaps on both pools.
 */
export function poolsVerdict(
  reports: DeskReport[],
  params: FeeParams,
  o: { swaps: SwapRow[]; pair: PairDeployment; arbRouter?: Address; nowSec: number },
): PoolsVerdict | undefined {
  const hours = windowHours(reports, o.nowSec);
  if (hours === undefined) return undefined;
  const pnl = (name: "V" | "S") =>
    pnlExplain({ swaps: o.swaps, reports, poolId: o.pair[name].poolId, token0IsEth: o.pair.token0IsEth, arbRouter: o.arbRouter });
  const pnlV = pnl("V");
  const pnlS = pnl("S");
  if (pnlV.swaps === 0 || pnlS.swaps === 0) return undefined;

  const points = weatherSeries(reports, params, o.nowSec);
  const fees = points.map((p) => p.feeVBp);
  const feeS = pipsToBp(o.pair.S.key.fee);
  const V: PoolStory = {
    ...pnlV,
    feeNow: fees[fees.length - 1],
    feeMin: fees.reduce((a, b) => Math.min(a, b)),
    feeMax: fees.reduce((a, b) => Math.max(a, b)),
    avgFee: timeAverageFeeBp(points, o.nowSec),
  };
  const S: PoolStory = { ...pnlS, feeNow: feeS, feeMin: feeS, feeMax: feeS, avgFee: feeS };
  return {
    V,
    S,
    sameAvgFee: sameAverageFee(V.avgFee, S.avgFee),
    arbChangePct: S.arbUsd !== 0 ? (V.arbUsd / S.arbUsd - 1) * 100 : 0,
    pnlChangePct: S.netUsd !== 0 ? ((V.netUsd - S.netUsd) / Math.abs(S.netUsd)) * 100 : 0,
    hours,
  };
}

export type SafetyCounts = {
  hours: number; // window length
  degraded: number; // reports whose venues disagreed by more than DISP_MAX_BP (RiskDesk's DEGRADED flag)
  blindGaps: number; // silences longer than tauKillSec, one still running at nowSec included
  longestBlindSec: number; // the longest time the hook quoted blind, 0 without a gap
};

/** How often the window's desk fell back to a safe mode: degraded reports and blind gaps (blindEpisodes). */
export function safetyCounts(reports: DeskReport[], params: FeeParams, nowSec: number): SafetyCounts | undefined {
  const hours = windowHours(reports, nowSec);
  if (hours === undefined) return undefined;
  const gaps = blindEpisodes(reports, params.tauKillSec, nowSec);
  return {
    hours,
    degraded: reports.filter((r) => r.dispBp > DISP_MAX_BP).length,
    blindGaps: gaps.length,
    longestBlindSec: gaps.reduce((a, g) => Math.max(a, g.to - g.from), 0),
  };
}

/** Past this σE9 (about 617 million %/yr) the fee is taken as unreachable, e.g. with kE4 = 0. */
const SIGMA_E9_LIMIT = 2 ** 40;

/**
 * The lowest σ (%/yr) at which the hook's normal-mode fee reaches `feeBp`, by bisection on feePips:
 * 0 at or below the floor, Infinity above the cap.
 */
export function sigmaAtFee(feeBp: number, params: FeeParams, kE4 = 10_000): number {
  const fee = (sigmaE9: number) => feePips(sigmaE9, params.etaE4, params.sqrtHalfDtE6, kE4, params.feeMinPips, params.feeMaxPips);
  // pips are integers; the epsilon absorbs float noise such as 38.52 * 100 = 3852.0000000000005 (ceil: 3853)
  const target = Math.ceil(feeBp * PIPS_PER_BP - 1e-6);
  if (!(target > fee(0))) return 0;
  let lo = 0; // fee(lo) < target <= fee(hi)
  let hi = 1;
  while (fee(hi) < target) {
    if (hi >= SIGMA_E9_LIMIT) return Infinity;
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fee(mid) >= target) hi = mid;
    else lo = mid;
  }
  return sigmaE9ToAnnualPct(hi);
}
