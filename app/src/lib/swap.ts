// /swap: build a PoolSwapTest exact-input swap on V or S, say why the fee is what it is, and read the
// fee actually charged back from the Swap event of the receipt (the same decoder as the dashboard).
import type { Address, Hex } from "viem";
import { decodeSwaps, type SwapRow } from "./decode";
import type { PairDeployment, PoolKey } from "./deployments";
import type { RawLog } from "./encode";
import { FeeMode, type Quote } from "./feeMath";
import { formatBp, formatPct, pipsToBp } from "./units";

/** TickMath bounds (v4-core src/libraries/TickMath.sol): limits a swap never reaches. */
export const MIN_SQRT_PRICE = 4_295_128_739n;
export const MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;

export type PoolName = "V" | "S";
/** From the swapper's side, like SwapView.side in pnl.ts. */
export type SwapSide = "sell ETH" | "buy ETH";

export type SwapPlan = {
  pool: PoolName;
  key: PoolKey;
  poolId: Hex;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /** PoolSwapTest SwapParams: negative amountSpecified = exact input. */
  params: { zeroForOne: boolean; amountSpecified: bigint; sqrtPriceLimitX96: bigint };
};

/** 18-decimal amount from a plain decimal string ("1.5"). */
export function parseAmount(amount: string): bigint {
  const s = amount.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) throw new Error("amount: enter a positive number such as 0.5");
  const [whole, frac = ""] = s.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
  if (wei <= 0n) throw new Error("amount: must be greater than 0");
  return wei;
}

export function planSwap(o: { pair: PairDeployment; tETH: Address; tUSD: Address; pool: PoolName; side: SwapSide; amount: string }): SwapPlan {
  const amountIn = parseAmount(o.amount);
  const { key, poolId } = o.pair[o.pool];
  const tokenIn = o.side === "sell ETH" ? o.tETH : o.tUSD;
  const tokenOut = o.side === "sell ETH" ? o.tUSD : o.tETH;
  const zeroForOne = tokenIn.toLowerCase() === key.currency0.toLowerCase();
  return {
    pool: o.pool,
    key,
    poolId,
    tokenIn,
    tokenOut,
    amountIn,
    params: { zeroForOne, amountSpecified: -amountIn, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n },
  };
}

/** The sentence shown before a swap: what the swapper pays, and the weather that sets it. */
export function feeReason(o: {
  pool: PoolName;
  quote: Quote;
  sigmaPct: number;
  staticFeePips: number;
  feeMinPips: number;
  feeSafePips: number;
  tauKillSec: number;
}): string {
  if (o.pool === "S") return `You pay ${formatBp(pipsToBp(o.staticFeePips), 2)}: pool S charges a fixed fee, whatever the weather.`;
  const fee = formatBp(pipsToBp(o.quote.feePips), 2);
  const safe = formatBp(pipsToBp(o.feeSafePips), 0);
  if (o.quote.mode === FeeMode.Blind) {
    return `You pay ${fee} because the risk desk has been silent for more than ${o.tauKillSec} s (blind mode: at least ${safe}).`;
  }
  if (o.quote.mode === FeeMode.Degraded) {
    return `You pay ${fee} because the exchanges disagree by more than 25 bp (degraded mode: at least ${safe}).`;
  }
  const floor = o.quote.feePips <= o.feeMinPips ? `: calm weather, the ${formatBp(pipsToBp(o.feeMinPips), 0)} floor applies` : "";
  return `You pay ${fee} because σ = ${formatPct(o.sigmaPct)}/yr (normal mode)${floor}.`;
}

/** Output before price impact: the pool's mid price, after the fee taken from the input. */
export function estimateOut(o: { side: SwapSide; amountIn: number; ethUsd: number; feePips: number }): number {
  const net = o.amountIn * (1 - o.feePips / 1e6);
  return o.side === "sell ETH" ? net * o.ethUsd : net / o.ethUsd;
}

/** The Swap event of the swapped pool in a receipt: its `fee` is what the swap actually paid. */
export function swapResult(logs: RawLog[], poolId: Hex): SwapRow | undefined {
  return decodeSwaps(logs)
    .filter((s) => s.poolId === poolId)
    .at(-1);
}
