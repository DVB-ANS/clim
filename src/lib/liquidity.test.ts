import { describe, expect, it } from "vitest";
import {
  amountsForLiquidity,
  feesOwed,
  fullRangeTicks,
  liquidityForEth,
  proRata,
  saltFor,
  shareOf,
  sqrtPriceOf,
  valueUsd,
} from "./liquidity";
import type { PnlRow } from "./pnl";

const Q128 = 1n << 128n;
const U256 = 1n << 256n;

describe("fullRangeTicks", () => {
  it("rounds the TickMath bounds inwards to the tick spacing", () => {
    expect(fullRangeTicks(60)).toEqual({ tickLower: -887_220, tickUpper: 887_220 });
    expect(fullRangeTicks(1)).toEqual({ tickLower: -887_272, tickUpper: 887_272 });
    expect(fullRangeTicks(10)).toEqual({ tickLower: -887_270, tickUpper: 887_270 });
  });
});

describe("saltFor", () => {
  it("is the user's address left-padded to 32 bytes, so the test router keeps one position per user", () => {
    expect(saltFor("0x00000000000000000000000000000000000000Ab")).toBe(`0x${"0".repeat(62)}ab`);
  });
});

describe("position math (full range, 18/18 decimals)", () => {
  const { tickLower, tickUpper } = fullRangeTicks(60);

  it("reads sqrt(price) from the pool orientation", () => {
    expect(sqrtPriceOf(2_500, true)).toBeCloseTo(50, 12);
    expect(sqrtPriceOf(2_500, false)).toBeCloseTo(0.02, 12);
  });

  it("buys about x * sqrt(P) of liquidity with x ETH, in either orientation", () => {
    const L0 = liquidityForEth(1e18, sqrtPriceOf(2_500, true), tickLower, tickUpper, true);
    const L1 = liquidityForEth(1e18, sqrtPriceOf(2_500, false), tickLower, tickUpper, false);
    expect(L0 / 5e19).toBeCloseTo(1, 6);
    expect(L1 / 5e19).toBeCloseTo(1, 6);
  });

  it("gives back the ETH and USD sides of that liquidity", () => {
    const L = liquidityForEth(1e18, 50, tickLower, tickUpper, true);
    const { amount0, amount1 } = amountsForLiquidity(L, 50, tickLower, tickUpper);
    expect(amount0 / 1e18).toBeCloseTo(1, 9);
    expect(amount1 / 2_500e18).toBeCloseTo(1, 6);
    expect(valueUsd(amount0, amount1, 2_500)).toBeCloseTo(5_000, 2);
  });
});

describe("feesOwed (v4 position fee accounting)", () => {
  it("is L x (feeGrowthInside - last) / 2^128", () => {
    expect(feesOwed(Q128, 12n, 2n)).toBe(10n);
    expect(feesOwed(2n * Q128, 7n, 7n)).toBe(0n);
  });
  it("wraps like Solidity's unchecked subtraction", () => {
    expect(feesOwed(Q128, 5n, U256 - 5n)).toBe(10n);
  });
});

describe("shareOf and proRata", () => {
  it("is the user's fraction of the pool liquidity", () => {
    expect(shareOf(1, 4)).toBe(0.25);
    expect(shareOf(1, 0)).toBe(0);
  });
  it("scales a pool's P&L explain to that share", () => {
    const row: PnlRow = {
      swaps: 10, arbSwaps: 4, unpricedSwaps: 0, volumeUsd: 1_000_000,
      feeArbUsd: 300, feeRetailUsd: 500, arbUsd: 200, lvrUsd: 480, netUsd: 300,
    };
    expect(proRata(row, 0.1)).toEqual({ feeRetailUsd: 50, feeArbUsd: 30, arbUsd: 20, lvrUsd: 48, netUsd: 30 });
  });
});

describe("positionView", () => {
  it("values the position, its fees and its P&L against the same position in the twin pool", async () => {
    const { positionView } = await import("./liquidity");
    const row = (net: number, fees: number): PnlRow => ({
      swaps: 1, arbSwaps: 1, unpricedSwaps: 0, volumeUsd: 1, feeArbUsd: fees / 2, feeRetailUsd: fees / 2, arbUsd: 1, lvrUsd: 1, netUsd: net,
    });
    const { tickLower, tickUpper } = fullRangeTicks(60);
    const L = liquidityForEth(1e18, 50, tickLower, tickUpper, true);
    const v = positionView({
      pool: "V", liquidity: L, poolLiquidity: 100 * L, sqrtP: 50, tickLower, tickUpper, token0IsEth: true, ethUsd: 2_500,
      rowSame: row(400, 1_000), rowOther: row(250, 900), sinceSec: 123,
    });
    expect(v.share).toBeCloseTo(0.01, 12);
    expect(v.valueUsd).toBeCloseTo(5_000, 1);
    expect(v.feesUsd).toBeCloseTo(10, 9);
    expect(v.feesSource).toBe("pro rata");
    expect(v.pnlUsd).toBeCloseTo(4, 9);
    expect(v.pnlOtherUsd).toBeCloseTo(2.5, 9);
    expect(v.otherPool).toBe("S");
    const withOnChainFees = positionView({ ...v, liquidity: L, poolLiquidity: 100 * L, sqrtP: 50, tickLower, tickUpper, token0IsEth: true, ethUsd: 2_500, rowSame: row(400, 1_000), rowOther: row(250, 900), sinceSec: 123, feesUsdOnChain: 7 });
    expect(withOnChainFees.feesUsd).toBe(7);
    expect(withOnChainFees.feesSource).toBe("on-chain");
  });
});
