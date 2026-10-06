import { describe, expect, it } from "vitest";
import type { DeskReport, SwapRow } from "./decode";
import type { FeeParams } from "./feeMath";
import { parsePTradeBand } from "./lab";
import { arbBlocksOf, makeBlockClock, makePredictor, predictedPTrade, pTradeTotals, rollingPTrade, sigmaArbAnnualPct } from "./ptrade";

const p: FeeParams = { etaE4: 41_760, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };
const ARB = "0x3000000000000000000000000000000000000003";
const RETAIL = "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe";

describe("predictedPTrade (Nezlobin-Tassy fixed-block form)", () => {
  it("returns P* when the fee is the unclamped formula fee", () => {
    // sigma 100%/yr at P* = 20%: fee 1,822 pips, eta_eff = 4.176 -> 1 / (4.176 + 0.824) = 0.2
    expect(predictedPTrade(1_822, 178_072, 2_449_490)).toBeCloseTo(0.2, 3);
  });
  it("is lower than P* when the floor binds", () => {
    // sigma 25%/yr: formula fee 4.55 bp, floor 5 bp -> eta_eff = 4.586 -> 0.1848
    expect(predictedPTrade(500, 44_518, 2_449_490)).toBeCloseTo(0.1848, 3);
  });
  it("is 0 without volatility", () => {
    expect(predictedPTrade(500, 0, 2_449_490)).toBe(0);
  });
});

describe("makeBlockClock", () => {
  it("interpolates between anchors and extrapolates at 12 s per block", () => {
    const clock = makeBlockClock([{ block: 100, t: 1_000 }, { block: 110, t: 1_130 }]);
    expect(clock(105)).toBe(1_065);
    expect(clock(90)).toBe(880);
    expect(clock(112)).toBe(1_154);
  });
});

function report(seq: number, block: number, t: number, sigmaApplied: number): DeskReport {
  return {
    seq, tObs: t - 20, sigmaApplied, sigmaReported: sigmaApplied, rv15E9: sigmaApplied, dvolE2: 0, refTick: 0,
    dispBp: 3, nSources: 4, kE4: 10_000, zone: 0, blockNumber: block, blockTimestamp: t, latencySec: 20,
    txHash: "0x01", logIndex: 0,
  };
}

describe("makePredictor", () => {
  const reports = [report(1, 100, 1_000, 178_072), report(2, 103, 1_036, 44_518)];
  const clock = makeBlockClock([{ block: 100, t: 1_000 }, { block: 103, t: 1_036 }]);
  it("uses the desk state readable at the block for the dynamic pool", () => {
    const pred = makePredictor(reports, p, clock);
    expect(pred(101)).toBeCloseTo(0.2, 3);
    expect(pred(103)).toBeCloseTo(0.1848, 3);
    expect(Number.isNaN(pred(99))).toBe(true);
  });
  it("uses a constant fee for the static pool", () => {
    const pred = makePredictor(reports, p, clock, 1_822);
    expect(pred(101)).toBeCloseTo(0.2, 3);
    expect(pred(103)).toBeLessThan(0.1);
  });
});

describe("arbBlocksOf / rollingPTrade", () => {
  const swap = (block: number, sender: string, poolId = "0xaa"): SwapRow => ({
    poolId: poolId as `0x${string}`, sender: sender as `0x${string}`, amount0: 0n, amount1: 0n, sqrtPriceX96: 0n,
    liquidity: 0n, tick: 0, fee: 500, blockNumber: block, blockTimestamp: block * 12, txHash: "0x01", logIndex: 0,
  });
  it("counts blocks (not swaps) with at least one arbitrage on the pool", () => {
    const s = [swap(1, ARB), swap(1, ARB), swap(2, RETAIL), swap(3, ARB, "0xbb"), swap(4, ARB)];
    expect([...arbBlocksOf(s, "0xaa", ARB)].sort()).toEqual([1, 4]);
  });
  it("computes observed and predicted frequencies over a rolling block window with the lab band", () => {
    const band = parsePTradeBand({
      generatedAt: "x", windowBlocks: 4, method: "test",
      grid: [{ p: 0, lo95: 0, hi95: 0.5, lo99: 0, hi99: 0.75 }, { p: 1, lo95: 0.5, hi95: 1, lo99: 0.25, hi99: 1 }],
    });
    const out = rollingPTrade({
      fromBlock: 1, toBlock: 8, window: 4, step: 2, arbBlocks: new Set([1, 2, 5]),
      predictedAt: () => 0.25, clock: (b) => b * 12, band,
    });
    expect(out.map((x) => [x.block, x.observed])).toEqual([[4, 0.5], [6, 0.25], [8, 0.25]]);
    expect(out[0].predicted).toBeCloseTo(0.25, 10);
    expect(out[0].t).toBe(48);
    expect(out[0].lo95).toBeCloseTo(0.125, 10);
    expect(out[0].hi95).toBeCloseTo(0.625, 10);
  });
  it("skips blocks with no prediction (before the first report)", () => {
    const out = rollingPTrade({
      fromBlock: 1, toBlock: 6, window: 2, step: 1, arbBlocks: new Set([6]),
      predictedAt: (b) => (b < 3 ? Number.NaN : 0.1), clock: (b) => b,
    });
    expect(out[0].block).toBe(4);
    expect(out.at(-1)).toMatchObject({ block: 6, observed: 0.5 });
    expect(out.at(-1)?.lo95).toBeUndefined();
  });
});

describe("pTradeTotals", () => {
  it("averages over every block that has a prediction", () => {
    const t = pTradeTotals({ fromBlock: 1, toBlock: 6, arbBlocks: new Set([3, 4, 9]), predictedAt: (b) => (b < 3 ? Number.NaN : 0.2) });
    expect(t).toEqual({ blocks: 4, arbBlocks: 2, observed: 0.5, predicted: 0.2 });
  });
  it("returns zeros when nothing can be predicted", () => {
    expect(pTradeTotals({ fromBlock: 1, toBlock: 2, arbBlocks: new Set(), predictedAt: () => Number.NaN })).toEqual({ blocks: 0, arbBlocks: 0, observed: 0, predicted: 0 });
  });
});

describe("sigmaArbAnnualPct", () => {
  it("inverts the P_trade formula: P* = 20% at 18.22 bp means sigma = 100%/yr", () => {
    expect(sigmaArbAnnualPct(1_822, 0.2, 2_449_490)).toBeCloseTo(100, 0);
  });
  it("is undefined when nothing was arbitraged", () => {
    expect(Number.isNaN(sigmaArbAnnualPct(500, 0, 2_449_490))).toBe(true);
  });
});
