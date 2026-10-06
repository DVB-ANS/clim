// Swap plumbing for PoolSwapTest (v4-core src/test/PoolSwapTest.sol).
// The caller must have approved PoolSwapTest for the input token: it pulls with transferFrom(msg.sender, ...).
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE, type PoolKey } from "@clim/shared";
import { parseUnits } from "viem";

export type Side = "buyEth" | "sellEth";

/** Selling ETH means paying token0 only when token0 is ETH. */
export function zeroForOneFor(side: Side, token0IsEth: boolean): boolean {
  return side === "sellEth" ? token0IsEth : !token0IsEth;
}

/** args for poolSwapTestAbi `swap`: exact input (negative amountSpecified), ERC-20 settlement, no hook data. */
export function swapArgs(key: PoolKey, zeroForOne: boolean, amountIn: bigint, sqrtPriceLimitX96: bigint) {
  if (amountIn <= 0n) throw new RangeError("amountIn must be > 0");
  return [
    key,
    { zeroForOne, amountSpecified: -amountIn, sqrtPriceLimitX96 },
    { takeClaims: false, settleUsingBurn: false },
    "0x",
  ] as const;
}

/** Retail swaps take any price: the limit sits one step inside TickMath bounds in the direction of the swap. */
export function noPriceLimit(zeroForOne: boolean): bigint {
  return zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n;
}

/** Input amount (base units) for a retail order of `usd` dollars: USD when buying ETH, ETH when selling it. */
export function inputAmountForUsd(side: Side, usd: number, ethUsd: number, ethDecimals: number, usdDecimals: number): bigint {
  const human = side === "buyEth" ? usd : usd / ethUsd;
  const decimals = side === "buyEth" ? usdDecimals : ethDecimals;
  return parseUnits(human.toFixed(Math.min(decimals, 12)), decimals);
}
