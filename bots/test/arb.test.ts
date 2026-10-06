import { describe, expect, test } from "bun:test";
import { ethUsdFromSqrtPriceX96, sqrtPriceX96FromEthUsd, type PairOrientation } from "@clim/shared";
import { decideArb } from "../src/lib/arb";

const ETH0: PairOrientation = { token0IsEth: true, decimals0: 18, decimals1: 18 };
const USD0: PairOrientation = { token0IsEth: false, decimals0: 18, decimals1: 18 };
const M = 2_000;
const FEE = 500; // 5 bp: no-arbitrage band is [m * (1 - f), m / (1 - f)]

function at(pool: number, o: PairOrientation, feePips = FEE, market = M) {
  return decideArb({ sqrtPriceX96: sqrtPriceX96FromEthUsd(pool, o), marketEthUsd: market, feePips, orientation: o });
}

describe("myopic arbitrageur", () => {
  test("pool at the market price: no trade", () => {
    expect(at(M, ETH0).action).toBe("none");
  });
  test("pool ETH too expensive (token0 = ETH): sell ETH, zeroForOne, push down to m / (1 - f)", () => {
    const d = at(2_002, ETH0);
    if (d.action !== "swap") throw new Error("expected a swap");
    expect(d.side).toBe("sellEth");
    expect(d.zeroForOne).toBe(true);
    expect(d.sqrtPriceLimitX96 < sqrtPriceX96FromEthUsd(2_002, ETH0)).toBe(true);
    expect(ethUsdFromSqrtPriceX96(d.sqrtPriceLimitX96, ETH0)).toBeCloseTo(M / (1 - 0.0005), 6);
  });
  test("pool ETH too cheap (token0 = ETH): buy ETH, oneForZero, push up to m * (1 - f)", () => {
    const d = at(1_998, ETH0);
    if (d.action !== "swap") throw new Error("expected a swap");
    expect(d.side).toBe("buyEth");
    expect(d.zeroForOne).toBe(false);
    expect(d.sqrtPriceLimitX96 > sqrtPriceX96FromEthUsd(1_998, ETH0)).toBe(true);
    expect(ethUsdFromSqrtPriceX96(d.sqrtPriceLimitX96, ETH0)).toBeCloseTo(M * (1 - 0.0005), 6);
  });
  test("token0 = USD flips the swap direction and the limit side", () => {
    const sell = at(2_002, USD0);
    if (sell.action !== "swap") throw new Error("expected a swap");
    expect(sell.side).toBe("sellEth");
    expect(sell.zeroForOne).toBe(false);
    expect(sell.sqrtPriceLimitX96 > sqrtPriceX96FromEthUsd(2_002, USD0)).toBe(true);
    const buy = at(1_998, USD0);
    if (buy.action !== "swap") throw new Error("expected a swap");
    expect(buy.side).toBe("buyEth");
    expect(buy.zeroForOne).toBe(true);
    expect(buy.sqrtPriceLimitX96 < sqrtPriceX96FromEthUsd(1_998, USD0)).toBe(true);
  });
  test("band edges: inside -> none, outside -> swap", () => {
    expect(at((M / (1 - 0.0005)) * (1 - 1e-7), ETH0).action).toBe("none");
    expect(at(M * 1.0006, ETH0).action).toBe("swap");
    expect(at(M * (1 - 0.0005) * (1 + 1e-7), ETH0).action).toBe("none");
    expect(at(M * 0.9994, ETH0).action).toBe("swap");
  });
  test("a wider fee widens the band: 1 % gap is inside a 150 bp fee", () => {
    expect(at(2_020, ETH0, 15_000).action).toBe("none");
    expect(at(2_020, ETH0, 500).action).toBe("swap");
  });
  test("after the arbitrage the pool sits on the band edge: no second trade", () => {
    for (const o of [ETH0, USD0]) {
      for (const pool of [1_990, 2_010]) {
        const d = at(pool, o);
        if (d.action !== "swap") throw new Error("expected a swap");
        const again = decideArb({ sqrtPriceX96: d.sqrtPriceLimitX96, marketEthUsd: M, feePips: FEE, orientation: o });
        expect(again.action).toBe("none");
      }
    }
  });
  test("reports the log gap and the band in the decision", () => {
    const d = at(2_002, ETH0);
    expect(d.logGap).toBeCloseTo(Math.log(2_002 / 2_000), 9);
    expect(d.bandLog).toBeCloseTo(-Math.log(1 - 0.0005), 12);
  });
});
