// Rational myopic arbitrageur (Milionis-Moallemi-Roughgarden 2023 model): trade only when the pool price
// leaves the no-arbitrage band, and push it exactly back to the band edge.
// A v4 fee f is taken from the input amount, so the band is [m * (1 - f), m / (1 - f)]:
//   pool ETH too cheap  (P < m (1 - f)): buy ETH,  target P' = m (1 - f)
//   pool ETH too dear   (P > m / (1 - f)): sell ETH, target P' = m / (1 - f)
// In log terms the band half-width is -ln(1 - f) ~ f (the design writes sqrt(m (1 -/+ f)); same to first order).
import { clampSqrtPriceLimit, ethUsdFromSqrtPriceX96, pipsToFraction, sqrtPriceX96FromEthUsd, type PairOrientation } from "@clim/shared";
import { zeroForOneFor, type Side } from "./swap";

/** Log-price tolerance (1e-9 = 0.00001 bp) so a pool left exactly on the band edge is not traded again on float noise. */
export const EDGE_EPS = 1e-9;

export type ArbInput = {
  sqrtPriceX96: bigint;
  marketEthUsd: number;
  feePips: number;
  orientation: PairOrientation;
};

type Common = { poolEthUsd: number; logGap: number; bandLog: number };
export type ArbDecision =
  | ({ action: "none" } & Common)
  | ({ action: "swap"; side: Side; zeroForOne: boolean; sqrtPriceLimitX96: bigint; targetEthUsd: number } & Common);

export function decideArb(i: ArbInput): ArbDecision {
  const f = pipsToFraction(i.feePips);
  if (!(f >= 0 && f < 1)) throw new RangeError(`feePips must be in [0, 1e6), got ${i.feePips}`);
  const poolEthUsd = ethUsdFromSqrtPriceX96(i.sqrtPriceX96, i.orientation);
  const logGap = Math.log(poolEthUsd / i.marketEthUsd);
  const bandLog = -Math.log(1 - f);
  const common: Common = { poolEthUsd, logGap, bandLog };
  if (Math.abs(logGap) <= bandLog + EDGE_EPS) return { action: "none", ...common };

  const side: Side = logGap > 0 ? "sellEth" : "buyEth";
  const targetEthUsd = side === "sellEth" ? i.marketEthUsd / (1 - f) : i.marketEthUsd * (1 - f);
  const zeroForOne = zeroForOneFor(side, i.orientation.token0IsEth);
  const sqrtPriceLimitX96 = clampSqrtPriceLimit(sqrtPriceX96FromEthUsd(targetEthUsd, i.orientation));
  // v4 reverts PriceLimitAlreadyExceeded unless the limit is strictly on the far side of the current price.
  const onRightSide = zeroForOne ? sqrtPriceLimitX96 < i.sqrtPriceX96 : sqrtPriceLimitX96 > i.sqrtPriceX96;
  if (!onRightSide) return { action: "none", ...common };
  return { action: "swap", side, zeroForOne, sqrtPriceLimitX96, targetEthUsd, ...common };
}
