import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { type DeskReport, decodeReports, decodeSwaps, type SwapRow } from "./decode";
import { FeeMode, type FeeParams, feePips } from "./feeMath";
import { makeMockWorld, MOCK_STATIC_FEE_PIPS } from "./mock";
import { pnlExplain } from "./pnl";
import { timeAverageFeeBp, weatherSeries } from "./series";
import { poolsVerdict, reachableFeeMaxBp, safetyCounts, sameAverageFee, sigmaAtFee, stormSummary, windowLabel } from "./story";
import { annualPctToSigmaE9, sigmaE9ToAnnualPct } from "./units";

const params: FeeParams = { etaE4: 41_760, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };
const NOW = 1_791_300_000;

// The landing's 6 h mock, as useClimData builds it.
const world = makeMockWorld({ nowSec: NOW, params, seed: 7 });
const reports = decodeReports(world.deskLogs);
const swaps = decodeSwaps(world.swapLogs);
const series = weatherSeries(reports, params, NOW);
const pools = { swaps, pair: world.pair, arbRouter: world.arbRouter, nowSec: NOW };
const staticFeePips = world.pair.S.key.fee;

/** A report that landed 30 s after its observation, at σ 100 %/yr (18.22 bp with these params). */
function report(seq: number, landedAt: number, over: Partial<DeskReport> = {}): DeskReport {
  return {
    seq, tObs: landedAt - 30, sigmaApplied: 178_072, sigmaReported: 178_072, rv15E9: 178_072, dvolE2: 0, refTick: 78_244,
    dispBp: 3, nSources: 4, kE4: 10_000, zone: 0, blockNumber: seq, blockTimestamp: landedAt, latencySec: 30, txHash: "0x01", logIndex: 0,
    ...over,
  };
}

/** A purchase of 0.1 ETH for 250 USD, by the mock's retail router unless `sender` says otherwise. */
function swap(poolId: Hex, block: number, fee: number, sender: Hex = "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe"): SwapRow {
  return {
    poolId, sender, amount0: 10n ** 17n, amount1: -250n * 10n ** 18n,
    sqrtPriceX96: 50n * 2n ** 96n, liquidity: 2n * 10n ** 23n, tick: 78_244, fee, blockNumber: block, blockTimestamp: 1_000 + block,
    txHash: "0x02", logIndex: 0,
  };
}

describe("stormSummary", () => {
  const storm = stormSummary(reports, params, { staticFeePips, nowSec: NOW })!;

  it("finds the storm's σ peak, above the σ now", () => {
    expect(storm.peakSigma).toBe(Math.max(...series.map((p) => p.sigmaPct)));
    expect(storm.peakSigma).toBeGreaterThan(sigmaE9ToAnnualPct(reports.at(-1)!.sigmaApplied));
  });

  it("reads V's fee at the peak off the hook's own step series, well above S's", () => {
    const atPeak = series.find((p) => p.t === storm.peakAt)!;
    expect(atPeak.sigmaPct).toBe(storm.peakSigma);
    expect(storm.feeVAtPeak).toBe(atPeak.feeVBp);
    expect(storm.feeS).toBe(MOCK_STATIC_FEE_PIPS / 100);
    expect(storm.feeVAtPeak).toBeGreaterThan(2 * storm.feeS);
  });

  it("spans the mock's 6 h", () => {
    expect(storm.hours).toBe(6);
  });

  it("calls the mock's 180 %/yr peak a storm: σ took the fee off its floor", () => {
    expect(storm.stormy).toBe(true);
    expect(storm.floorSigma).toBe(sigmaAtFee(5.01, params)); // 27.5 %/yr with these params
    expect(storm.floorSigma).toBeGreaterThan(20);
    expect(storm.peakSigma).toBeGreaterThan(storm.floorSigma);
  });

  it("calls a calm window no storm, even when a safe mode lifted the fee", () => {
    const calm = (pct: number) => annualPctToSigmaE9(pct);
    const xs = [
      report(1, NOW - 600, { sigmaApplied: calm(10) }),
      report(2, NOW - 570, { sigmaApplied: calm(20), dispBp: 40 }), // degraded: 30 bp, but σ is calm
      report(3, NOW - 540, { sigmaApplied: calm(15) }),
    ];
    const s = stormSummary(xs, params, { staticFeePips: 511, nowSec: NOW })!;
    expect(s.peakSigma).toBeCloseTo(20, 1);
    expect(s.peakSigma).toBeLessThan(s.floorSigma);
    expect(s.feeVAtPeak).toBe(30);
    expect(s.stormy).toBe(false);
  });
});

describe("poolsVerdict", () => {
  const verdict = poolsVerdict(reports, params, pools)!;

  it("reads both pools off pnlExplain, with PnlPanel's ARB change", () => {
    for (const name of ["V", "S"] as const) {
      expect(verdict[name]).toMatchObject(pnlExplain({ swaps, reports, poolId: world.pair[name].poolId, token0IsEth: world.pair.token0IsEth, arbRouter: world.arbRouter }));
    }
    expect(verdict.arbChangePct).toBeCloseTo((verdict.V.arbUsd / verdict.S.arbUsd - 1) * 100, 9);
  });

  it("gives V a fee range around its time average and S one fee, always", () => {
    const { V, S } = verdict;
    expect(V.feeMax - V.feeMin).toBeGreaterThan(S.feeMax - S.feeMin);
    expect([S.feeMin, S.feeNow, S.avgFee, S.feeMax]).toEqual(Array(4).fill(MOCK_STATIC_FEE_PIPS / 100));
    expect(V.avgFee).toBe(timeAverageFeeBp(series, NOW));
    expect(V.feeMin).toBe(5);
    expect(V.feeMax).toBe(stormSummary(reports, params, { staticFeePips, nowSec: NOW })!.feeVAtPeak);
    expect(V.feeNow).toBe(series.at(-1)!.feeVBp);
  });

  it("follows PnlPanel's 10 % rule; seed 7 lands on the same average fee, V losing less and earning more", () => {
    expect(verdict.sameAvgFee).toBe(Math.abs(verdict.V.avgFee - verdict.S.avgFee) <= 0.1 * verdict.S.avgFee);
    expect(verdict.sameAvgFee).toBe(true);
    expect(verdict.arbChangePct).toBeLessThan(0);
    expect(verdict.pnlChangePct).toBeGreaterThan(0);
    expect(verdict.hours).toBe(6);
  });

  it("states unequal averages as such (synthetic: a calm 100 %/yr hour, V at 18.22 bp against S at 10.50 bp)", () => {
    const rs = [report(1, 1_000), report(2, 1_030)];
    const twoSwaps = [swap(world.pair.V.poolId, 2, 1_822), swap(world.pair.S.poolId, 2, MOCK_STATIC_FEE_PIPS)];
    const v = poolsVerdict(rs, params, { ...pools, swaps: twoSwaps, nowSec: 1_060 })!;
    expect(v.V.avgFee).toBeCloseTo(18.22, 10);
    expect(v.S.avgFee).toBe(10.5);
    expect(v.sameAvgFee).toBe(false);
    expect([v.V.swaps, v.S.swaps]).toEqual([1, 1]);
  });

  it("measures V's P&L change against |S's|, so a losing S still reads as V ahead", () => {
    const rs = [report(1, 1_000), report(2, 1_030)];
    const mixed = [swap(world.pair.V.poolId, 2, 1_822), swap(world.pair.S.poolId, 2, MOCK_STATIC_FEE_PIPS, world.arbRouter)];
    const v = poolsVerdict(rs, params, { ...pools, swaps: mixed, nowSec: 1_060 })!;
    expect(v.S.netUsd).toBeLessThan(0); // S only paid an arbitrageur
    expect(v.V.netUsd).toBeGreaterThan(0);
    expect(v.pnlChangePct).toBeCloseTo(((v.V.netUsd - v.S.netUsd) / -v.S.netUsd) * 100, 9);
    expect(v.pnlChangePct).toBeGreaterThan(0);
    expect(v.arbChangePct).toBe(-100);
  });

  it("calls averages within 10 % of S's fee the same, on both sides", () => {
    expect(sameAverageFee(11, 10)).toBe(true);
    expect(sameAverageFee(9, 10)).toBe(true);
    expect(sameAverageFee(11.01, 10)).toBe(false);
    expect(sameAverageFee(8.99, 10)).toBe(false);
  });
});

describe("safetyCounts", () => {
  const safety = safetyCounts(reports, params, NOW)!;

  it("counts the reports the hook quoted in degraded mode", () => {
    expect(safety.degraded).toBeGreaterThan(0);
    expect(safety.degraded).toBe(series.filter((p) => p.mode === FeeMode.Degraded).length);
  });

  it("finds the mock's cut CRE loop as one or more blind gaps, each shorter than the silence", () => {
    const blindStarts = series.filter((p, i) => p.mode === FeeMode.Blind && series[i - 1]?.mode !== FeeMode.Blind);
    expect(safety.blindGaps).toBeGreaterThanOrEqual(1);
    expect(safety.blindGaps).toBe(blindStarts.length);
    expect(safety.longestBlindSec).toBeGreaterThan(0);
    expect(safety.longestBlindSec).toBeLessThan(0.02 * 6 * 3_600); // the loop is cut for 2 % of the run
    expect(safety.hours).toBe(6);
  });

  it("counts a silence still running at now", () => {
    const rs = [report(1, 1_000), report(2, 1_030, { dispBp: 31 })]; // the last tObs is 1,000: blind from 1,181
    expect(safetyCounts(rs, params, 1_100)).toEqual({ hours: 0, degraded: 1, blindGaps: 0, longestBlindSec: 0 });
    expect(safetyCounts(rs, params, 1_400)).toEqual({ hours: 0.1, degraded: 1, blindGaps: 1, longestBlindSec: 219 });
  });
});

describe("sigmaAtFee (feePips inverted)", () => {
  const atSigma = (pct: number, kE4 = 10_000) =>
    feePips(annualPctToSigmaE9(pct), params.etaE4, params.sqrtHalfDtE6, kE4, params.feeMinPips, params.feeMaxPips);

  it("puts the 150 bp cap at about 823 %/yr with the fixture parameters", () => {
    const sigma = sigmaAtFee(150, params);
    expect(sigma).toBeGreaterThan(820);
    expect(sigma).toBeLessThan(828);
    expect(atSigma(sigma)).toBe(15_000);
  });

  it("returns the lowest σ reaching the fee: one σE9 step lower falls short", () => {
    for (const bp of [18.22, 38.52, 41]) {
      const e9 = annualPctToSigmaE9(sigmaAtFee(bp, params));
      expect(feePips(e9, params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips)).toBe(Math.round(bp * 100));
      expect(feePips(e9 - 1, params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips)).toBeLessThan(Math.round(bp * 100));
    }
    expect(sigmaAtFee(18.22, params)).toBeCloseTo(100, 1);
  });

  it("is 0 at or below the floor and Infinity above the cap", () => {
    expect(sigmaAtFee(5, params)).toBe(0);
    expect(sigmaAtFee(2, params)).toBe(0);
    expect(sigmaAtFee(150.01, params)).toBe(Infinity);
    expect(sigmaAtFee(20, params, 0)).toBe(Infinity);
  });

  it("halves with k = 2", () => {
    expect(sigmaAtFee(40, params, 20_000)).toBeCloseTo(sigmaAtFee(40, params) / 2, 1);
    expect(atSigma(sigmaAtFee(40, params, 20_000), 20_000)).toBe(4_000);
  });
});

describe("short or empty windows", () => {
  it("tells no story without reports", () => {
    expect(stormSummary([], params, { staticFeePips, nowSec: NOW })).toBeUndefined();
    expect(poolsVerdict([], params, pools)).toBeUndefined();
    expect(safetyCounts([], params, NOW)).toBeUndefined();
  });

  it("tells none over a window of zero length", () => {
    const one = [report(1, 1_000)];
    expect(stormSummary(one, params, { staticFeePips })).toBeUndefined(); // ends, by default, at its own landing
    expect(stormSummary(one, params, { staticFeePips, nowSec: 1_000 })).toBeUndefined();
    expect(safetyCounts(one, params, 1_000)).toBeUndefined();
    expect(poolsVerdict(one, params, { ...pools, swaps: [swap(world.pair.V.poolId, 1, 1_822), swap(world.pair.S.poolId, 1, 1_050)], nowSec: 1_000 })).toBeUndefined();
    expect(stormSummary(one, params, { staticFeePips, nowSec: 1_060 })?.peakSigma).toBeCloseTo(100, 2);
  });

  it("waits for priced swaps on both pools before comparing them", () => {
    const rs = [report(2, 1_000), report(3, 1_030)];
    const at = (s: SwapRow[]) => poolsVerdict(rs, params, { ...pools, swaps: s, nowSec: 1_060 });
    expect(at([])).toBeUndefined();
    expect(at([swap(world.pair.V.poolId, 3, 1_822)])).toBeUndefined();
    // before the first report there is no desk price, so these swaps are unpriced
    expect(at([swap(world.pair.V.poolId, 1, 3_000), swap(world.pair.S.poolId, 1, 1_050)])).toBeUndefined();
    expect(at([swap(world.pair.V.poolId, 3, 1_822), swap(world.pair.S.poolId, 3, 1_050)])).toBeDefined();
  });
});

describe("display helpers", () => {
  it("labels windows in hours from one hour, in minutes below", () => {
    expect(windowLabel(6)).toBe("6 h");
    expect(windowLabel(1)).toBe("1 h");
    expect(windowLabel(0.5)).toBe("30 min");
    expect(windowLabel(0)).toBe("a few minutes");
  });

  it("reaches the 150 bp cap with the fixture parameters, not with the lab's (η 25,093): the desk stops at 1000 %/yr", () => {
    expect(reachableFeeMaxBp(params)).toBe(150);
    expect(reachableFeeMaxBp({ ...params, etaE4: 25_093 })).toBeLessThan(150);
    expect(reachableFeeMaxBp({ ...params, etaE4: 25_093 })).toBeGreaterThan(100);
  });

  it("only compares arbitrage when the router is known and S has seen some", () => {
    expect(poolsVerdict(reports, params, pools)?.arbKnown).toBe(true);
    expect(poolsVerdict(reports, params, { ...pools, arbRouter: undefined })?.arbKnown).toBe(false);
  });
});
