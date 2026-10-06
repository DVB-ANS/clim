import { describe, expect, test } from "bun:test";
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE, type PoolKey } from "@clim/shared";
import { zeroAddress } from "viem";
import { inputAmountForUsd, noPriceLimit, swapArgs, zeroForOneFor } from "../src/lib/swap";

const KEY: PoolKey = {
  currency0: "0x1111111111111111111111111111111111111111",
  currency1: "0x2222222222222222222222222222222222222222",
  fee: 0x800000,
  tickSpacing: 60,
  hooks: zeroAddress,
};

describe("token order", () => {
  test("selling ETH is zeroForOne only when token0 is ETH", () => {
    expect(zeroForOneFor("sellEth", true)).toBe(true);
    expect(zeroForOneFor("buyEth", true)).toBe(false);
    expect(zeroForOneFor("sellEth", false)).toBe(false);
    expect(zeroForOneFor("buyEth", false)).toBe(true);
  });
});

describe("PoolSwapTest.swap arguments", () => {
  test("exact input is a negative amountSpecified; real tokens in and out", () => {
    const [key, params, settings, hookData] = swapArgs(KEY, true, 5n * 10n ** 18n, 123n);
    expect(key).toEqual(KEY);
    expect(params).toEqual({ zeroForOne: true, amountSpecified: -(5n * 10n ** 18n), sqrtPriceLimitX96: 123n });
    expect(settings).toEqual({ takeClaims: false, settleUsingBurn: false });
    expect(hookData).toBe("0x");
  });
  test("rejects a zero amount (v4 reverts SwapAmountCannotBeZero)", () => {
    expect(() => swapArgs(KEY, true, 0n, 123n)).toThrow(RangeError);
  });
  test("no price limit = one step inside the v4 bounds, on the side the price moves to", () => {
    expect(noPriceLimit(true)).toBe(MIN_SQRT_PRICE + 1n);
    expect(noPriceLimit(false)).toBe(MAX_SQRT_PRICE - 1n);
  });
});

describe("USD notional -> input amount in base units", () => {
  test("buying ETH pays USD, selling ETH pays ETH", () => {
    expect(inputAmountForUsd("buyEth", 2_000, 2_500, 18, 18)).toBe(2_000n * 10n ** 18n);
    expect(inputAmountForUsd("sellEth", 2_000, 2_500, 18, 18)).toBe(8n * 10n ** 17n);
  });
  test("respects the input token decimals", () => {
    expect(inputAmountForUsd("buyEth", 1_234.5678919, 2_500, 18, 6)).toBe(1_234_567_892n);
  });
});
