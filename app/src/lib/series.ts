import type { Hex } from "viem";
import type { DeskReport, SwapRow } from "./decode";
import { type DeskState, FeeMode, type FeeParams, FLAG_DEGRADED, quoteFee } from "./feeMath";
import { dvolE2ToPct, pipsToBp, sigmaE9ToAnnualPct } from "./units";

export const DISP_MAX_BP = 25; // mirror of RiskDesk DISP_MAX: above it the report is flagged DEGRADED

export type WeatherPoint = {
  t: number; // unix seconds: when this desk state became readable by the hook (report inclusion) or went blind
  sigmaPct: number; // sigma applied by RiskDesk (after the envelope), annualized %
  sigmaReportedPct: number; // sigma proposed by the CRE workflow, annualized %
  dvolPct: number | null; // null when the desk reported dvolE2 = 0 (DVOL unavailable, or replay mode)
  feeVBp: number; // fee the hook quotes at t
  mode: FeeMode;
};

export function deskStateOf(r: DeskReport): DeskState {
  return { tObs: r.tObs, sigmaE9: r.sigmaApplied, kE4: r.kE4, flags: r.dispBp > DISP_MAX_BP ? FLAG_DEGRADED : 0, seq: r.seq };
}

/** The hook's fee as a step function of time, rebuilt from RiskReported logs only. */
export function weatherSeries(reports: DeskReport[], p: FeeParams, nowSec: number): WeatherPoint[] {
  const out: WeatherPoint[] = [];
  reports.forEach((r, i) => {
    const s = deskStateOf(r);
    const push = (t: number) => {
      const q = quoteFee(s, t, p);
      out.push({
        t,
        sigmaPct: sigmaE9ToAnnualPct(r.sigmaApplied),
        sigmaReportedPct: sigmaE9ToAnnualPct(r.sigmaReported),
        dvolPct: r.dvolE2 === 0 ? null : dvolE2ToPct(r.dvolE2),
        feeVBp: pipsToBp(q.feePips),
        mode: q.mode,
      });
    };
    const isLast = i === reports.length - 1;
    const end = isLast ? nowSec : reports[i + 1].blockTimestamp;
    push(r.blockTimestamp);
    const blindAt = r.tObs + p.tauKillSec + 1;
    if (blindAt > r.blockTimestamp && blindAt < end) push(blindAt);
    if (isLast && nowSec > r.blockTimestamp && nowSec !== blindAt) push(nowSec);
  });
  return out;
}

export type FeeDot = { t: number; feeBp: number };

export function swapFeeDots(swaps: SwapRow[], poolId: Hex): FeeDot[] {
  return swaps.filter((s) => s.poolId === poolId).map((s) => ({ t: s.blockTimestamp, feeBp: pipsToBp(s.fee) }));
}

/** Smallest and largest finite value, or undefined when there is none (the charts' text alternatives). */
export function extent(xs: Array<number | null | undefined>): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/** Keeps every k-th point (k = ceil(n / max)) and always the last one. */
export function downsample<T>(xs: T[], maxPoints: number): T[] {
  if (xs.length <= maxPoints) return xs;
  const k = Math.ceil(xs.length / maxPoints);
  const out = xs.filter((_, i) => i % k === 0);
  if ((xs.length - 1) % k !== 0) out.push(xs[xs.length - 1]);
  return out;
}

/**
 * downsample for the hook's step series: it also keeps every point whose mode differs from the previous
 * one, so a blind or degraded step keeps its exact start and end (a 27 s blind spell is not dropped, nor
 * drawn as 100 s). It can return a little more than maxPoints: the last point, and the points where the mode changes.
 */
export function downsampleSteps<T extends { mode: FeeMode }>(xs: T[], maxPoints: number): T[] {
  if (xs.length <= maxPoints) return xs;
  const k = Math.ceil(xs.length / maxPoints);
  return xs.filter((p, i) => i % k === 0 || i === xs.length - 1 || (i > 0 && p.mode !== xs[i - 1].mode));
}

export type BlindEpisode = { from: number; to: number; ongoing: boolean; lastTx: Hex; resumeTx?: Hex };

/** Periods when the hook quoted blind because the desk was silent for more than tauKillSec. */
export function blindEpisodes(reports: DeskReport[], tauKillSec: number, nowSec: number): BlindEpisode[] {
  const out: BlindEpisode[] = [];
  reports.forEach((r, i) => {
    const next = reports[i + 1];
    const from = r.tObs + tauKillSec + 1;
    const end = next ? next.blockTimestamp : nowSec;
    if (from < end) out.push({ from, to: end, ongoing: !next, lastTx: r.txHash, resumeTx: next?.txHash });
  });
  return out;
}

/** Time-weighted mean of the step series' fee between its first point and `to`. */
export function timeAverageFeeBp(points: WeatherPoint[], to: number): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const end = i + 1 < points.length ? points[i + 1].t : to;
    area += points[i].feeVBp * Math.max(0, end - points[i].t);
  }
  const span = to - (points[0]?.t ?? to);
  return span > 0 ? area / span : (points[0]?.feeVBp ?? 0);
}
