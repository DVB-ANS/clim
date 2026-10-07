// The latest real storm on the live desk, the one /replay leads with. Only its window is fixed here;
// everything the page says about it is computed from the desk's RiskReported logs and the pools' Swap
// logs (the static snapshot of the live pair covers it). Pure: no React and no fetching (storm.test.ts).
import type { Hex } from "viem";
import type { DeskReport, SwapRow } from "./decode";
import { FeeMode, type FeeParams, quoteFee } from "./feeMath";
import { after } from "./guide";
import { deskStateOf, DISP_MAX_BP, weatherSeries } from "./series";
import { type Range, sliceSteps } from "./timeWindow";
import { pipsToBp, sigmaE9ToAnnualPct } from "./units";

/**
 * 7 October 2026, 01:40 to 03:10 UTC on the live pair: the span where σ took pool V's fee off its floor,
 * with about 18 minutes either side. It ends before 03:21 UTC, when σ lifted the fee again, to 5.12 bp at
 * most for a few minutes: an aftershock, not the storm, so the stats leave it out.
 */
export const LATEST_STORM_WINDOW: Range = [Date.UTC(2026, 9, 7, 1, 40) / 1000, Date.UTC(2026, 9, 7, 3, 10) / 1000];

export type FeeRange = { n: number; minPips: number; maxPips: number };

export type StormStats = {
  /** The highest σ the desk applied in the window (reports flagged degraded left out, as in stormProof) and the fee it set. */
  peak: { report: DeskReport; sigmaPct: number; feePips: number };
  /** The first and last moments σ held V's fee above its floor in the window (normal mode), and how long it was above in between. */
  above: { from: number; to: number; sec: number };
  /** The reports that landed in [above.from, above.to), and how many of them set V's fee above the floor. */
  reports: { n: number; aboveFloor: number };
  /**
   * The swaps on V that landed in [above.from, above.to): how many paid more than the floor, how many paid exactly what
   * the hook's formula gives for the report in force (the last one before the swap in chain order, at the swap's block
   * time), and the one that paid the most (the first of them in chain order). Undefined when V had no swap then.
   */
  v?: FeeRange & { aboveFloor: number; formula: number; top: SwapRow };
  /** The swaps on S that landed in the same span and the fees they paid. Undefined when S had no swap then. */
  s?: FeeRange;
};

/** The swaps on one pool that landed in [from, to), in chain order. */
function swapsIn(swaps: SwapRow[], poolId: Hex, from: number, to: number): SwapRow[] {
  return swaps
    .filter((s) => s.poolId === poolId && s.blockTimestamp >= from && s.blockTimestamp < to)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

function feeRange(rows: SwapRow[]): FeeRange | undefined {
  if (rows.length === 0) return undefined;
  const fees = rows.map((s) => s.fee);
  return { n: rows.length, minPips: Math.min(...fees), maxPips: Math.max(...fees) };
}

/** The last report strictly before `x` in (blockNumber, logIndex) order, in reports sorted that way. */
function inForce(sorted: DeskReport[], x: SwapRow): DeskReport | undefined {
  let lo = 0;
  let hi = sorted.length - 1;
  let found: DeskReport | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (after(x, sorted[mid])) {
      found = sorted[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * What the chain logs say about a storm in `window`: undefined when no report landed in it, or when σ never took V's fee
 * off its floor there. `reports` is the desk's whole history (a swap's report in force may have landed before the window).
 */
export function stormStats(o: { reports: DeskReport[]; swaps: SwapRow[]; poolIdV: Hex; poolIdS: Hex; params: FeeParams; window: Range }): StormStats | undefined {
  const { params, window } = o;
  const [w0, w1] = window;
  const floorBp = pipsToBp(params.feeMinPips);
  const landed = o.reports.filter((r) => r.blockTimestamp >= w0 && r.blockTimestamp <= w1);

  let peakReport: DeskReport | undefined;
  for (const r of landed) if (r.dispBp <= DISP_MAX_BP && (!peakReport || r.sigmaApplied > peakReport.sigmaApplied)) peakReport = r;
  if (!peakReport) return undefined;

  // V's fee as the hook quoted it, step by step, cut to the window; a step counts when σ set it above the floor
  const steps = sliceSteps(weatherSeries(o.reports, params, w1), window);
  let from: number | undefined;
  let to: number | undefined;
  let sec = 0;
  for (let i = 0; i < steps.length; i++) {
    const p = steps[i];
    const end = Math.min(w1, i + 1 < steps.length ? steps[i + 1].t : w1);
    if (end <= p.t || p.mode !== FeeMode.Normal || !(p.feeVBp > floorBp)) continue;
    from ??= p.t;
    to = end;
    sec += end - p.t;
  }
  if (from === undefined || to === undefined) return undefined;
  const above = { from, to, sec };

  const during = landed.filter((r) => r.blockTimestamp >= from && r.blockTimestamp < to);
  const quoteAt = (r: DeskReport, t: number) => quoteFee(deskStateOf(r), t, params);
  const aboveFloorReports = during.filter((r) => {
    const q = quoteAt(r, r.blockTimestamp);
    return q.mode === FeeMode.Normal && q.feePips > params.feeMinPips;
  }).length;

  const sorted = [...o.reports].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const vRows = swapsIn(o.swaps, o.poolIdV, from, to);
  const vRange = feeRange(vRows);
  let v: StormStats["v"];
  if (vRange) {
    let top = vRows[0];
    let formula = 0;
    for (const s of vRows) {
      if (s.fee > top.fee) top = s;
      const r = inForce(sorted, s);
      if (r && quoteAt(r, s.blockTimestamp).feePips === s.fee) formula++;
    }
    v = { ...vRange, aboveFloor: vRows.filter((s) => s.fee > params.feeMinPips).length, formula, top };
  }

  return {
    peak: { report: peakReport, sigmaPct: sigmaE9ToAnnualPct(peakReport.sigmaApplied), feePips: quoteAt(peakReport, peakReport.blockTimestamp).feePips },
    above,
    reports: { n: during.length, aboveFloor: aboveFloorReports },
    v,
    s: feeRange(swapsIn(o.swaps, o.poolIdS, from, to)),
  };
}
