// /lp: full-range positions on V or S through PoolModifyLiquidityTest (salt = the user's address),
// v4 position math for the amounts and the uncollected fees, and the user's pro-rata share of the
// pool's P&L explain (src/lib/pnl.ts). Amounts are raw 18-decimal units (tETH and tUSD).
import { type Address, type Hex, pad } from "viem";
import type { PnlRow } from "./pnl";
import type { PoolName } from "./swap";

export const MIN_TICK = -887_272;
export const MAX_TICK = 887_272;
const Q128 = 1n << 128n;
const U256 = 1n << 256n;

/** Full-range ticks: the TickMath bounds rounded inwards to the pool's tick spacing. */
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  return {
    tickLower: Math.ceil(MIN_TICK / tickSpacing) * tickSpacing,
    tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
  };
}

/**
 * PoolModifyLiquidityTest owns every position it creates; the salt keeps users apart. It is not an
 * access control: anyone can pass someone else's salt (testnet router, test tokens only).
 */
export function saltFor(user: Address): Hex {
  return pad(user.toLowerCase() as Hex, { size: 32 });
}

/** sqrt of the pool price (token1 per token0) from the ETH/USD price and the pool orientation. */
export function sqrtPriceOf(ethUsd: number, token0IsEth: boolean): number {
  return Math.sqrt(token0IsEth ? ethUsd : 1 / ethUsd);
}

function sqrtAtTick(tick: number): number {
  return Math.exp((tick * Math.log(1.0001)) / 2);
}

/** Token amounts of liquidity L at sqrt price s (v4 position math, s clamped to the range). */
export function amountsForLiquidity(L: number, sqrtP: number, tickLower: number, tickUpper: number): { amount0: number; amount1: number } {
  const sa = sqrtAtTick(tickLower);
  const sb = sqrtAtTick(tickUpper);
  const s = Math.min(Math.max(sqrtP, sa), sb);
  return { amount0: L * (1 / s - 1 / sb), amount1: L * (s - sa) };
}

/** Liquidity that `ethRaw` of tETH buys at sqrt price s (the tUSD side follows from the price). */
export function liquidityForEth(ethRaw: number, sqrtP: number, tickLower: number, tickUpper: number, token0IsEth: boolean): number {
  const sa = sqrtAtTick(tickLower);
  const sb = sqrtAtTick(tickUpper);
  return token0IsEth ? ethRaw / (1 / sqrtP - 1 / sb) : ethRaw / (sqrtP - sa);
}

/** Uncollected fees of a position: L x (feeGrowthInside - last) / 2^128, wrapping like Solidity. */
export function feesOwed(liquidity: bigint, insideNowX128: bigint, insideLastX128: bigint): bigint {
  const delta = (((insideNowX128 - insideLastX128) % U256) + U256) % U256;
  return (delta * liquidity) / Q128;
}

/** USD value of raw tETH and tUSD amounts. */
export function valueUsd(ethRaw: number, usdRaw: number, ethUsd: number): number {
  return (ethRaw / 1e18) * ethUsd + usdRaw / 1e18;
}

/** The user's fraction of the pool's liquidity. */
export function shareOf(userL: number, poolL: number): number {
  return poolL > 0 ? userL / poolL : 0;
}

export type PnlShare = Pick<PnlRow, "feeRetailUsd" | "feeArbUsd" | "arbUsd" | "lvrUsd" | "netUsd">;

/** A pool's P&L explain scaled to a share of its liquidity: fees, ARB and LVR all accrue pro rata to L. */
export function proRata(row: PnlRow, share: number): PnlShare {
  return {
    feeRetailUsd: row.feeRetailUsd * share,
    feeArbUsd: row.feeArbUsd * share,
    arbUsd: row.arbUsd * share,
    lvrUsd: row.lvrUsd * share,
    netUsd: row.netUsd * share,
  };
}

export type PositionView = {
  pool: PoolName;
  /** The twin pool, for "your P&L if you had been there". */
  otherPool: PoolName;
  liquidity: number;
  share: number;
  amountEth: number;
  amountUsd: number;
  valueUsd: number;
  feesUsd: number;
  /** On-chain: uncollected fees from feeGrowthInside. Pro rata: share of the pool's fees since `sinceSec`. */
  feesSource: "on-chain" | "pro rata";
  /** Share of the pool's hedged LP P&L (FEE_retail - ARB, pnl.ts) since `sinceSec`. */
  pnlUsd: number;
  /** The same liquidity in the twin pool over the same period. */
  pnlOtherUsd: number;
  sinceSec: number;
};

/** The user's position: value at the pool price, fees, and P&L against the same position in the twin pool. */
export function positionView(o: {
  pool: PoolName;
  liquidity: number;
  poolLiquidity: number;
  otherPoolLiquidity?: number;
  sqrtP: number;
  tickLower: number;
  tickUpper: number;
  token0IsEth: boolean;
  ethUsd: number;
  rowSame: PnlRow;
  rowOther: PnlRow;
  sinceSec: number;
  feesUsdOnChain?: number;
}): PositionView {
  const share = shareOf(o.liquidity, o.poolLiquidity);
  const { amount0, amount1 } = amountsForLiquidity(o.liquidity, o.sqrtP, o.tickLower, o.tickUpper);
  const [ethRaw, usdRaw] = o.token0IsEth ? [amount0, amount1] : [amount1, amount0];
  const same = proRata(o.rowSame, share);
  const other = proRata(o.rowOther, shareOf(o.liquidity, o.otherPoolLiquidity ?? o.poolLiquidity));
  return {
    pool: o.pool,
    otherPool: o.pool === "V" ? "S" : "V",
    liquidity: o.liquidity,
    share,
    amountEth: ethRaw / 1e18,
    amountUsd: usdRaw / 1e18,
    valueUsd: valueUsd(ethRaw, usdRaw, o.ethUsd),
    feesUsd: o.feesUsdOnChain ?? same.feeRetailUsd + same.feeArbUsd,
    feesSource: o.feesUsdOnChain === undefined ? "pro rata" : "on-chain",
    pnlUsd: same.netUsd,
    pnlOtherUsd: other.netUsd,
    sinceSec: o.sinceSec,
  };
}

