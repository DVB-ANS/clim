import { describe, expect, it } from "vitest";
import type { DeskReport, SwapRow } from "./decode";
import { firstPricedSwapSec, pnlExplain, recentSwapRows, sigmaBreakEvenAnnualPct } from "./pnl";
import { ethUsdToTick, tickToEthUsd } from "./units";

const ARB = "0x3000000000000000000000000000000000000003";
const RETAIL = "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe";
const E18 = 10n ** 18n;

function report(block: number, price: number): DeskReport {
  return {
    seq: block, tObs: block * 12, sigmaApplied: 1, sigmaReported: 1, rv15E9: 1, dvolE2: 0,
    refTick: ethUsdToTick(price, true), dispBp: 3, nSources: 4, kE4: 10_000, zone: 0, blockNumber: block,
    blockTimestamp: block * 12, latencySec: 0, txHash: "0x01", logIndex: 0,
  };
}
const sqrtX96 = (price: number) => BigInt(Math.floor(Math.sqrt(price) * 2 ** 96));
function swap(block: number, sender: string, amount0: bigint, amount1: bigint, fee: number, sqrtPriceX96 = sqrtX96(2_500), liquidity = 2n * 10n ** 22n): SwapRow {
  return {
    poolId: "0xaa", sender: sender as `0x${string}`, amount0, amount1, sqrtPriceX96, liquidity, tick: 0, fee,
    blockNumber: block, blockTimestamp: block * 12, txHash: "0x01", logIndex: 0,
  };
}

describe("pnlExplain", () => {
  const m = tickToEthUsd(ethUsdToTick(2_500, true), true); // reference price as stored on-chain (tick precision)
  const reports = [report(10, 2_500), report(20, 2_550)];

  it("values arbitrage at the bot's own reference price and retail fees at the desk price", () => {
    // The arb bot saw m = 2,600 (the desk still says 2,500), sold 1 ETH at 30 bp and pushed the
    // pool to the band edge m / (1 - f) = 2,607.8. It received 2,610 USD: profit at its own price = +10 USD.
    // Retail buys ETH paying 1,000 USD at 30 bp: fee 3 USD.
    const swaps = [
      swap(11, ARB, -1n * E18, 2_610n * E18, 3_000, sqrtX96(2_600 / 0.997)),
      swap(12, RETAIL, 399n * 10n ** 15n, -1_000n * E18, 3_000),
    ];
    const r = pnlExplain({ swaps, reports, poolId: "0xaa", token0IsEth: true, arbRouter: ARB });
    expect(r.swaps).toBe(2);
    expect(r.arbSwaps).toBe(1);
    expect(r.feeArbUsd).toBeCloseTo(0.003 * 2_600, 4);
    expect(r.feeRetailUsd).toBeCloseTo(3, 6);
    expect(r.arbUsd).toBeCloseTo(10, 4);
    expect(r.netUsd).toBeCloseTo(r.feeRetailUsd - r.arbUsd, 9);
    expect(r.volumeUsd).toBeCloseTo(2_600 + 0.399 * m, 3);
  });

  it("recovers the reference price when the arbitrageur bought ETH", () => {
    // Bot saw 2,400, bought 1 ETH paying 2,390 USD gross, pool pushed to 2,400 * (1 - f).
    const swaps = [swap(11, ARB, 1n * E18, -2_390n * E18, 3_000, sqrtX96(2_400 * 0.997))];
    const r = pnlExplain({ swaps, reports, poolId: "0xaa", token0IsEth: true, arbRouter: ARB });
    expect(r.arbUsd).toBeCloseTo(10, 4);
    expect(r.feeArbUsd).toBeCloseTo(2_390 * 0.003, 6);
  });

  it("computes LVR from the desk price path and the pool liquidity (L * sqrt(m) / 4 * dlnm^2)", () => {
    const swaps = [swap(11, RETAIL, 1n, -1n, 500), swap(25, RETAIL, 1n, -1n, 500)];
    const r = pnlExplain({ swaps, reports, poolId: "0xaa", token0IsEth: true, arbRouter: ARB });
    const m2 = tickToEthUsd(ethUsdToTick(2_550, true), true);
    const expected = (2e22 * Math.sqrt(m)) / 4 * Math.log(m2 / m) ** 2 / 1e18;
    expect(r.lvrUsd).toBeCloseTo(expected, 6);
  });

  it("handles a pool where token0 is tUSD", () => {
    const flipped = [report(10, 2_500)].map((x) => ({ ...x, refTick: ethUsdToTick(2_500, false) }));
    // token1 = tETH: pool price is ETH per USD = 1 / 2,500 after a zero-fee ETH sale.
    const swaps = [swap(11, ARB, 2_510n * E18, -1n * E18, 0, sqrtX96(1 / 2_500))];
    const r = pnlExplain({ swaps, reports: flipped, poolId: "0xaa", token0IsEth: false, arbRouter: ARB });
    expect(r.arbUsd).toBeCloseTo(10, 4);
  });

  it("ignores swaps of other pools and swaps before the first report", () => {
    const swaps = [swap(5, ARB, -1n * E18, 2_600n * E18, 500), { ...swap(11, ARB, -1n * E18, 2_600n * E18, 500), poolId: "0xbb" as const }];
    const r = pnlExplain({ swaps, reports, poolId: "0xaa", token0IsEth: true, arbRouter: ARB });
    expect(r.swaps).toBe(0);
    expect(r.unpricedSwaps).toBe(1);
  });
});

describe("firstPricedSwapSec", () => {
  it("starts at the first swap a report prices, not at an unpriced one before the first report", () => {
    const reports = [report(10, 2_500), report(20, 2_550)];
    const swaps = [swap(5, RETAIL, 1n, -1n, 3_000), { ...swap(9, RETAIL, 1n, -1n, 500), poolId: "0xbb" as const }, swap(10, RETAIL, 1n, -1n, 500), swap(14, RETAIL, 1n, -1n, 500)];
    expect(firstPricedSwapSec(swaps, reports, "0xaa")).toBe(10 * 12);
    expect(firstPricedSwapSec(swaps.slice(0, 1), reports, "0xaa")).toBeUndefined();
    expect(firstPricedSwapSec(swaps, [], "0xaa")).toBeUndefined();
  });
});

describe("sigmaBreakEvenAnnualPct", () => {
  it("solves sigma^2 * L * sqrt(m) / 4 = F", () => {
    // L = 2e22, m = 2,500 -> L*sqrt(m)/1e18 = 1e6 USD. At sigma = 50%/yr, LVR rate = s^2 * 1e6 / 4 per second.
    const s = 0.5 / Math.sqrt(31_536_000);
    const fee = (s * s * 1e6) / 4;
    expect(sigmaBreakEvenAnnualPct(fee, 2e22, 2_500)).toBeCloseTo(50, 6);
  });
});

describe("recentSwapRows", () => {
  it("lists the latest swaps of V and S, newest first, with side, size, fee and kind", () => {
    const key = { currency0: "0x01", currency1: "0x02", fee: 0, tickSpacing: 60, hooks: "0x03" } as never;
    const pair = { riskDesk: "0x04", hook: "0x03", startBlock: 0, token0IsEth: true, V: { poolId: "0xaa", key }, S: { poolId: "0xbb", key } } as never;
    const swaps = [
      swap(10, RETAIL, -2n * E18, 5_000n * E18, 500),
      { ...swap(11, ARB, 1n * E18, -2_500n * E18, 1_822), poolId: "0xbb" as const },
      { ...swap(12, RETAIL, 1n * E18, -2_500n * E18, 500), poolId: "0xcc" as const },
    ];
    const rows = recentSwapRows({ swaps, pair, arbRouter: ARB, limit: 5 });
    expect(rows.map((r) => [r.pool, r.side, r.ethAmount, r.feeBp, r.kind])).toEqual([
      ["S", "buy ETH", 1, 18.22, "arbitrage"],
      ["V", "sell ETH", 2, 5, "retail"],
    ]);
    expect(recentSwapRows({ swaps, pair, arbRouter: ARB, limit: 1 })).toHaveLength(1);
  });
});
