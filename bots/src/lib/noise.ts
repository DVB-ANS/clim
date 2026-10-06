// Retail (noise) flow: Poisson arrivals per block, random side, log-normal USD size.
// Routing (spec section 3.8): "mirror" (default) sends every order to both V and S, so the twin pools see the
// same retail flow; "split" sends each order to V or S at random; "cheapest" sends it to the better all-in price
// (the volume-leak variant). Small orders: price impact is ignored when choosing the pool.
import { pipsToFraction } from "@clim/shared";
import { logNormal, poisson, type Rand } from "./rng";
import type { Side } from "./swap";

export type PoolLabel = "V" | "S";
export type PoolQuote = { ethUsd: number; feePips: number };
export type Routing = "mirror" | "split" | "cheapest";
export const ROUTINGS: readonly Routing[] = ["mirror", "split", "cheapest"];
export type NoiseConfig = { ratePerBlock: number; medianUsd: number; sigmaLn: number; routing: Routing };
export type RetailOrder = { side: Side; usd: number; pool: PoolLabel };

/** USD per ETH actually paid (buy) or received (sell) on a small order, fee included. */
export function effectivePrice(side: Side, q: PoolQuote): number {
  const f = pipsToFraction(q.feePips);
  return side === "buyEth" ? q.ethUsd / (1 - f) : q.ethUsd * (1 - f);
}

export function cheaperPool(side: Side, quotes: Record<PoolLabel, PoolQuote>): PoolLabel {
  const v = effectivePrice(side, quotes.V);
  const s = effectivePrice(side, quotes.S);
  if (side === "buyEth") return s < v ? "S" : "V";
  return s > v ? "S" : "V";
}

export function planBlockOrders(rand: Rand, cfg: NoiseConfig, quotes: Record<PoolLabel, PoolQuote>): RetailOrder[] {
  const n = poisson(rand, cfg.ratePerBlock);
  const orders: RetailOrder[] = [];
  for (let i = 0; i < n; i++) {
    const side: Side = rand() < 0.5 ? "buyEth" : "sellEth";
    const usd = logNormal(rand, cfg.medianUsd, cfg.sigmaLn);
    if (cfg.routing === "mirror") {
      orders.push({ side, usd, pool: "V" }, { side, usd, pool: "S" });
      continue;
    }
    const pool: PoolLabel = cfg.routing === "split" ? (rand() < 0.5 ? "V" : "S") : cheaperPool(side, quotes);
    orders.push({ side, usd, pool });
  }
  return orders;
}
