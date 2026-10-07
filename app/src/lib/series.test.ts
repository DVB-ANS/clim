import { describe, expect, it } from "vitest";
import type { DeskReport, SwapRow } from "./decode";
import { FeeMode, type FeeParams } from "./feeMath";
import { blindEpisodes, downsample, downsampleSteps, extent, swapFeeDots, timeAverageFeeBp, weatherSeries } from "./series";

const p: FeeParams = { etaE4: 41_760, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };

function report(seq: number, tObs: number, landedAt: number, over: Partial<DeskReport> = {}): DeskReport {
  return {
    seq, tObs, sigmaApplied: 178_072, sigmaReported: 178_072, rv15E9: 178_072, dvolE2: 9_500, refTick: 78_244,
    dispBp: 3, nSources: 4, kE4: 10_000, zone: 0, blockNumber: seq, blockTimestamp: landedAt,
    latencySec: landedAt - tObs, txHash: "0x01", logIndex: 0, ...over,
  };
}

describe("weatherSeries", () => {
  it("steps the fee at each report's inclusion time and closes the series at now", () => {
    const s = weatherSeries([report(1, 970, 1_000), report(2, 1_000, 1_030, { sigmaApplied: 400_663 })], p, 1_060);
    expect(s.map((x) => x.t)).toEqual([1_000, 1_030, 1_060]);
    expect(s.map((x) => x.feeVBp)).toEqual([18.22, 40.99, 40.99]);
    expect(s[0].sigmaPct).toBeCloseTo(100, 2);
    expect(s[0].dvolPct).toBe(95);
    expect(s.every((x) => x.mode === FeeMode.Normal)).toBe(true);
  });
  it("inserts a blind step when the next report lands more than tauKillSec after tObs", () => {
    const s = weatherSeries([report(1, 970, 1_000), report(2, 1_270, 1_300)], p, 1_310);
    expect(s.map((x) => [x.t, x.mode])).toEqual([
      [1_000, FeeMode.Normal],
      [1_151, FeeMode.Blind],
      [1_300, FeeMode.Normal],
      [1_310, FeeMode.Normal],
    ]);
    expect(s[1].feeVBp).toBe(30);
  });
  it("goes blind after the last report when the desk is silent", () => {
    const s = weatherSeries([report(1, 970, 1_000)], p, 2_000);
    expect(s.map((x) => [x.t, x.mode])).toEqual([
      [1_000, FeeMode.Normal],
      [1_151, FeeMode.Blind],
      [2_000, FeeMode.Blind],
    ]);
  });
  it("marks degraded reports (dispersion above 25 bp)", () => {
    const [first] = weatherSeries([report(1, 970, 1_000, { dispBp: 30 })], p, 1_010);
    expect(first.mode).toBe(FeeMode.Degraded);
    expect(first.feeVBp).toBe(30);
  });
  it("leaves DVOL empty when the desk reported dvolE2 = 0 (unavailable)", () => {
    const [first] = weatherSeries([report(1, 970, 1_000, { dvolE2: 0 })], p, 1_010);
    expect(first.dvolPct).toBeNull();
  });
  it("returns nothing without reports", () => {
    expect(weatherSeries([], p, 1_000)).toEqual([]);
  });
});

describe("swapFeeDots", () => {
  it("keeps the swaps of one pool with their charged fee in bp", () => {
    const base = { sender: "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe", amount0: 0n, amount1: 0n, sqrtPriceX96: 0n, liquidity: 0n, tick: 0, blockNumber: 1, txHash: "0x01", logIndex: 0 } as const;
    const swaps: SwapRow[] = [
      { ...base, poolId: "0xaa", fee: 1_822, blockTimestamp: 1_000 },
      { ...base, poolId: "0xbb", fee: 700, blockTimestamp: 1_012 },
    ];
    expect(swapFeeDots(swaps, "0xaa")).toEqual([{ t: 1_000, feeBp: 18.22 }]);
  });
});

describe("downsample", () => {
  it("keeps short series untouched", () => {
    expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it("strides long series and always keeps the last point", () => {
    expect(downsample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
    expect(downsample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([0, 3, 6, 9, 10]);
  });
});

describe("downsampleSteps", () => {
  const step = (i: number, mode: FeeMode) => ({ t: i, feeVBp: mode === FeeMode.Blind ? 30 : 5, mode });

  it("keeps a one-point blind step and the resume after it, so the 30 bp step keeps its width", () => {
    const xs = Array.from({ length: 1_800 }, (_, i) => step(i, i === 1 ? FeeMode.Blind : FeeMode.Normal));
    const out = downsampleSteps(xs, 600);
    expect(out.map((p) => p.t).slice(0, 3)).toEqual([0, 1, 2]);
    expect(out.find((p) => p.mode === FeeMode.Blind)?.t).toBe(1);
    expect(out.at(-1)).toBe(xs.at(-1));
    expect(out.length).toBeLessThanOrEqual(600 + 1 + 2); // the last point, and the two around the blind step
  });

  it("is the plain every-k-th downsample when the mode never changes, and the input when it is short", () => {
    const flat = Array.from({ length: 10 }, (_, i) => step(i, FeeMode.Normal));
    expect(downsampleSteps(flat, 4)).toEqual(downsample(flat, 4));
    expect(downsampleSteps(flat, 20)).toBe(flat);
  });
});

describe("blindEpisodes", () => {
  it("finds silences longer than tauKillSec, closed by the next report or still ongoing", () => {
    const reports = [report(1, 970, 1_000), report(2, 1_270, 1_300), report(3, 1_300, 1_330)];
    expect(blindEpisodes(reports, 180, 1_400)).toEqual([{ from: 1_151, to: 1_300, ongoing: false, lastTx: "0x01", resumeTx: "0x01" }]);
    expect(blindEpisodes(reports, 180, 1_600)).toEqual([
      { from: 1_151, to: 1_300, ongoing: false, lastTx: "0x01", resumeTx: "0x01" },
      { from: 1_481, to: 1_600, ongoing: true, lastTx: "0x01", resumeTx: undefined },
    ]);
  });
});

describe("timeAverageFeeBp", () => {
  it("weights each fee by how long it was in force", () => {
    const pts = [
      { t: 0, sigmaPct: 0, sigmaReportedPct: 0, dvolPct: 0, feeVBp: 5, mode: FeeMode.Normal },
      { t: 30, sigmaPct: 0, sigmaReportedPct: 0, dvolPct: 0, feeVBp: 20, mode: FeeMode.Normal },
    ];
    expect(timeAverageFeeBp(pts, 40)).toBeCloseTo((5 * 30 + 20 * 10) / 40, 10);
    expect(timeAverageFeeBp([], 40)).toBe(0);
  });
});

describe("extent", () => {
  it("gives the smallest and largest finite value, skipping gaps", () => {
    expect(extent([3, null, -1, undefined, 7, Number.NaN])).toEqual([-1, 7]);
    expect(extent([5])).toEqual([5, 5]);
  });
  it("is undefined without a finite value", () => {
    expect(extent([])).toBeUndefined();
    expect(extent([null, undefined, Number.POSITIVE_INFINITY])).toBeUndefined();
  });
});
