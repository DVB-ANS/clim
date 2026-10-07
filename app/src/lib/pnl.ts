import type { Address, Hex } from "viem";
import { type DeskReport, lastAtOrBefore, type SwapRow } from "./decode";
import type { PairDeployment } from "./deployments";
import { tickToEthUsd } from "./units";

/**
 * LP P&L explain from logs only (Milionis-Moallemi-Roughgarden): a delta-hedged LP earns
 * FEE_retail - ARB, and, in the model, LVR ~= ARB + FEE_arb (measured, ARB + FEE_arb can run well
 * above the LVR below in a fast move: it samples the desk's price only every 30 s). Amounts are
 * 18-decimal raw units; results in USD.
 * - Arbitrage swaps are valued at the arbitrageur's own reference price, recovered from the
 *   post-swap pool price: the arb bot (plan 04) pushes the pool exactly to the edge of the
 *   no-arbitrage band [m(1 - f), m / (1 - f)], so m = P_after / (1 - f) when it bought ETH and
 *   m = P_after * (1 - f) when it sold ETH.
 *   (Valuing them at the desk's refTick, 30 to 90 s old, would bias ARB downwards.)
 * - Retail fees and LVR use the desk's refTick in force. LVR assumes a constant full-range L.
 */
export type PnlRow = {
  swaps: number;
  arbSwaps: number;
  unpricedSwaps: number; // swaps before the first desk report
  volumeUsd: number;
  feeArbUsd: number;
  feeRetailUsd: number;
  arbUsd: number; // arbitrageurs' profit net of the fees they paid
  lvrUsd: number;
  netUsd: number; // feeRetailUsd - arbUsd
};

const E18 = 1e18;

/** ETH/USD price after a swap, from sqrtPriceX96 (token1 per token0, 18/18 decimals). */
export function postSwapEthUsd(sqrtPriceX96: bigint, token0IsEth: boolean): number {
  const p = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  return token0IsEth ? p : 1 / p;
}

/**
 * When the P&L's window starts: the first swap on poolId that a desk report prices (a report at or before
 * its block, pnlExplain's rule), so the headline never dates itself from a swap the ledger leaves out.
 */
export function firstPricedSwapSec(swaps: SwapRow[], reports: { blockNumber: number }[], poolId: Hex): number | undefined {
  const firstReport = reports[0]?.blockNumber;
  if (firstReport === undefined) return undefined;
  return swaps.find((s) => s.poolId === poolId && s.blockNumber >= firstReport)?.blockTimestamp;
}

export function pnlExplain(o: {
  swaps: SwapRow[];
  reports: DeskReport[];
  poolId: Hex;
  token0IsEth: boolean;
  arbRouter?: Address;
}): PnlRow {
  const row: PnlRow = { swaps: 0, arbSwaps: 0, unpricedSwaps: 0, volumeUsd: 0, feeArbUsd: 0, feeRetailUsd: 0, arbUsd: 0, lvrUsd: 0, netUsd: 0 };
  const arb = o.arbRouter?.toLowerCase();
  const priceAt = (block: number): number | undefined => {
    const i = lastAtOrBefore(o.reports, block);
    return i < 0 ? undefined : tickToEthUsd(o.reports[i].refTick, o.token0IsEth);
  };

  const mine = o.swaps.filter((s) => s.poolId === o.poolId);
  for (const s of mine) {
    const ref = priceAt(s.blockNumber);
    if (ref === undefined) {
      row.unpricedSwaps++;
      continue;
    }
    const eth = Number(o.token0IsEth ? s.amount0 : s.amount1) / E18;
    const usd = Number(o.token0IsEth ? s.amount1 : s.amount0) / E18;
    const isArb = arb !== undefined && s.sender.toLowerCase() === arb;
    const f = s.fee / 1e6;
    const after = postSwapEthUsd(s.sqrtPriceX96, o.token0IsEth);
    const m = isArb ? (eth > 0 ? after / (1 - f) : after * (1 - f)) : ref;
    const paidUsd = eth < 0 ? -eth * m : -usd; // input side, gross of fee
    const feeUsd = paidUsd * f;
    row.swaps++;
    row.volumeUsd += Math.abs(eth) * m;
    if (isArb) {
      row.arbSwaps++;
      row.feeArbUsd += feeUsd;
      row.arbUsd += eth * m + usd;
    } else {
      row.feeRetailUsd += feeUsd;
    }
  }

  if (mine.length > 0) {
    const L = Number(mine[mine.length - 1].liquidity);
    const fromBlock = mine[0].blockNumber;
    for (let i = 1; i < o.reports.length; i++) {
      if (o.reports[i].blockNumber < fromBlock) continue;
      const m0 = tickToEthUsd(o.reports[i - 1].refTick, o.token0IsEth);
      const m1 = tickToEthUsd(o.reports[i].refTick, o.token0IsEth);
      row.lvrUsd += ((L * Math.sqrt(m0)) / 4) * Math.log(m1 / m0) ** 2 / E18;
    }
  }
  row.netUsd = row.feeRetailUsd - row.arbUsd;
  return row;
}

/** σ_BE = 2·sqrt(F / (L·sqrt(m))): above this annualized volatility, fee income F (USD/s) is below LVR. */
export function sigmaBreakEvenAnnualPct(feeUsdPerSec: number, liquidity: number, ethUsd: number): number {
  const depthUsd = (liquidity * Math.sqrt(ethUsd)) / E18;
  if (depthUsd <= 0 || feeUsdPerSec < 0) return Number.NaN;
  return 2 * Math.sqrt(feeUsdPerSec / depthUsd) * Math.sqrt(31_536_000) * 100;
}

export type SwapView = {
  key: string;
  t: number;
  pool: "V" | "S";
  side: "buy ETH" | "sell ETH"; // from the swapper's side
  ethAmount: number;
  feeBp: number;
  kind: "arbitrage" | "retail";
  txHash: Hex;
};

/** The latest swaps on V and S, newest first, with the fee each one actually paid. */
export function recentSwapRows(o: { swaps: SwapRow[]; pair: PairDeployment; arbRouter?: Address; limit: number }): SwapView[] {
  const arb = o.arbRouter?.toLowerCase();
  const out: SwapView[] = [];
  for (let i = o.swaps.length - 1; i >= 0 && out.length < o.limit; i--) {
    const s = o.swaps[i];
    const pool = s.poolId === o.pair.V.poolId ? "V" : s.poolId === o.pair.S.poolId ? "S" : null;
    if (!pool) continue;
    const eth = Number(o.pair.token0IsEth ? s.amount0 : s.amount1) / E18;
    out.push({
      key: `${s.txHash}:${s.logIndex}`,
      t: s.blockTimestamp,
      pool,
      side: eth > 0 ? "buy ETH" : "sell ETH",
      ethAmount: Math.abs(eth),
      feeBp: s.fee / 100,
      kind: arb !== undefined && s.sender.toLowerCase() === arb ? "arbitrage" : "retail",
      txHash: s.txHash,
    });
  }
  return out;
}
