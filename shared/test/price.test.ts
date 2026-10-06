import { describe, expect, test } from "bun:test";
import {
  clampSqrtPriceLimit,
  ethUsdFromSqrtPriceX96,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  Q96,
  sqrtPriceX96FromEthUsd,
  type PairOrientation,
} from "../src/price";

const ETH0: PairOrientation = { token0IsEth: true, decimals0: 18, decimals1: 18 };
const USD0: PairOrientation = { token0IsEth: false, decimals0: 18, decimals1: 18 };
// Real-world shape (USDC 6 decimals = token0, WETH 18 decimals = token1), to exercise the decimals path.
const USDC6_WETH18: PairOrientation = { token0IsEth: false, decimals0: 6, decimals1: 18 };

function relErr(a: bigint, b: bigint): number {
  const d = a > b ? a - b : b - a;
  return Number(d) / Number(b);
}

describe("sqrtPriceX96 <-> ETH price in USD", () => {
  test("2^96 is a raw price of 1", () => {
    expect(ethUsdFromSqrtPriceX96(Q96, ETH0)).toBe(1);
    expect(ethUsdFromSqrtPriceX96(Q96, USD0)).toBe(1);
  });
  test("token0 = ETH, 18/18, ETH = 4000", () => {
    const exact = 5010828967500958623728276031392n; // floor(sqrt(4000) * 2^96), computed with 60-digit decimals
    expect(relErr(sqrtPriceX96FromEthUsd(4000, ETH0), exact)).toBeLessThan(1e-12);
    expect(ethUsdFromSqrtPriceX96(exact, ETH0)).toBeCloseTo(4000, 8);
  });
  test("token0 = USD, 18/18, ETH = 2713.8", () => {
    const exact = 1520864997137815267081534579n; // floor(sqrt(1/2713.8) * 2^96)
    expect(relErr(sqrtPriceX96FromEthUsd(2713.8, USD0), exact)).toBeLessThan(1e-12);
    expect(ethUsdFromSqrtPriceX96(exact, USD0)).toBeCloseTo(2713.8, 8);
  });
  test("token0 = USDC (6 dec), token1 = WETH (18 dec), ETH = 2000", () => {
    const exact = 1771595571142957102961017161607260n; // floor(sqrt(1e12 / 2000) * 2^96)
    expect(relErr(sqrtPriceX96FromEthUsd(2000, USDC6_WETH18), exact)).toBeLessThan(1e-12);
    expect(ethUsdFromSqrtPriceX96(exact, USDC6_WETH18)).toBeCloseTo(2000, 8);
  });
  test("round trip in both orientations", () => {
    for (const o of [ETH0, USD0, USDC6_WETH18]) {
      for (const px of [1.5, 2713.8, 99_999.25]) {
        expect(ethUsdFromSqrtPriceX96(sqrtPriceX96FromEthUsd(px, o), o) / px).toBeCloseTo(1, 12);
      }
    }
  });
  test("a higher ETH price moves sqrtPrice up when token0 is ETH, down when token0 is USD", () => {
    expect(sqrtPriceX96FromEthUsd(3000, ETH0) > sqrtPriceX96FromEthUsd(2000, ETH0)).toBe(true);
    expect(sqrtPriceX96FromEthUsd(3000, USD0) < sqrtPriceX96FromEthUsd(2000, USD0)).toBe(true);
  });
  test("rejects non-positive prices", () => {
    expect(() => sqrtPriceX96FromEthUsd(0, ETH0)).toThrow(RangeError);
    expect(() => ethUsdFromSqrtPriceX96(0n, ETH0)).toThrow(RangeError);
  });
});

describe("clampSqrtPriceLimit keeps limits strictly inside the v4 bounds", () => {
  test("clamps both ends", () => {
    expect(clampSqrtPriceLimit(1n)).toBe(MIN_SQRT_PRICE + 1n);
    expect(clampSqrtPriceLimit(MAX_SQRT_PRICE)).toBe(MAX_SQRT_PRICE - 1n);
    expect(clampSqrtPriceLimit(Q96)).toBe(Q96);
  });
});
