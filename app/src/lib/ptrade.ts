import type { Address, Hex } from "viem";
import { type DeskReport, lastAtOrBefore, type SwapRow } from "./decode";
import { type FeeParams, quoteFee } from "./feeMath";
import { bandAt, type LabPTradeBand } from "./lab";
import { deskStateOf } from "./series";

/** |zeta(1/2)| / sqrt(pi), fixed-interval blocks (Nezlobin-Tassy 2025): P_trade = 1 / (eta + 0.824). */
export const NT_CONSTANT = 0.824;
export const SEPOLIA_BLOCK_SEC = 12;

export function predictedPTrade(feePips: number, sigmaE9: number, sqrtHalfDtE6: number): number {
  if (sigmaE9 <= 0) return 0;
  const noise = (sigmaE9 / 1e9) * (sqrtHalfDtE6 / 1e6); // sigma per sqrt-second * sqrt(dt / 2)
  return 1 / (feePips / 1e6 / noise + NT_CONSTANT);
}

/** σ_arb: the annualized volatility that reproduces the observed arbitrage frequency at the mean fee. */
export function sigmaArbAnnualPct(meanFeePips: number, pObserved: number, sqrtHalfDtE6: number): number {
  const denom = 1 / pObserved - NT_CONSTANT;
  if (!(pObserved > 0) || denom <= 0) return Number.NaN;
  const sigmaPerSqrtSec = meanFeePips / 1e6 / (denom * (sqrtHalfDtE6 / 1e6));
  return sigmaPerSqrtSec * Math.sqrt(31_536_000) * 100;
}

export type BlockClock = (block: number) => number;

/** Block -> unix time, interpolated between known (block, timestamp) pairs from logs. */
export function makeBlockClock(anchors: { block: number; t: number }[], blockSec = SEPOLIA_BLOCK_SEC): BlockClock {
  const a = [...anchors].sort((x, y) => x.block - y.block);
  return (block) => {
    if (a.length === 0) return Number.NaN;
    if (block <= a[0].block) return a[0].t - (a[0].block - block) * blockSec;
    const last = a[a.length - 1];
    if (block >= last.block) return last.t + (block - last.block) * blockSec;
    let lo = 0;
    let hi = a.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid].block <= block) lo = mid;
      else hi = mid;
    }
    const w = (block - a[lo].block) / (a[hi].block - a[lo].block);
    return Math.round(a[lo].t + w * (a[hi].t - a[lo].t));
  };
}

/**
 * Predicted per-block arbitrage probability. Dynamic pool: fee from the desk state readable at the
 * block. Static pool: pass its fee. NaN before the first report.
 */
export function makePredictor(reports: DeskReport[], p: FeeParams, clock: BlockClock, staticFeePips?: number) {
  return (block: number): number => {
    const i = lastAtOrBefore(reports, block);
    if (i < 0) return Number.NaN;
    const r = reports[i];
    const fee = staticFeePips ?? quoteFee(deskStateOf(r), clock(block), p).feePips;
    return predictedPTrade(fee, r.sigmaApplied, p.sqrtHalfDtE6);
  };
}

export function arbBlocksOf(swaps: SwapRow[], poolId: Hex, arbRouter: Address): Set<number> {
  const router = arbRouter.toLowerCase();
  return new Set(swaps.filter((s) => s.poolId === poolId && s.sender.toLowerCase() === router).map((s) => s.blockNumber));
}

export type PTradePoint = {
  block: number;
  t: number;
  observed: number;
  predicted: number;
  lo95?: number;
  hi95?: number;
  lo99?: number;
  hi99?: number;
};

export function rollingPTrade(o: {
  fromBlock: number;
  toBlock: number;
  window: number;
  step: number;
  arbBlocks: Set<number>;
  predictedAt: (block: number) => number;
  clock: BlockClock;
  band?: LabPTradeBand;
}): PTradePoint[] {
  const out: PTradePoint[] = [];
  const first = (() => {
    for (let b = o.fromBlock; b <= o.toBlock; b++) if (!Number.isNaN(o.predictedAt(b))) return b;
    return o.toBlock + 1;
  })();
  const n = o.toBlock - first + 1;
  if (n < o.window) return out;
  const arbCum = new Float64Array(n + 1);
  const predCum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const b = first + i;
    arbCum[i + 1] = arbCum[i] + (o.arbBlocks.has(b) ? 1 : 0);
    predCum[i + 1] = predCum[i] + o.predictedAt(b);
  }
  for (let i = o.window; i <= n; i += o.step) {
    const end = first + i - 1;
    const observed = (arbCum[i] - arbCum[i - o.window]) / o.window;
    const predicted = (predCum[i] - predCum[i - o.window]) / o.window;
    out.push({ block: end, t: o.clock(end), observed, predicted, ...(o.band ? bandAt(o.band, predicted) : {}) });
  }
  const lastEnd = first + n - 1;
  if (out.length > 0 && out[out.length - 1].block !== lastEnd) {
    const observed = (arbCum[n] - arbCum[n - o.window]) / o.window;
    const predicted = (predCum[n] - predCum[n - o.window]) / o.window;
    out.push({ block: lastEnd, t: o.clock(lastEnd), observed, predicted, ...(o.band ? bandAt(o.band, predicted) : {}) });
  }
  return out;
}

export function pTradeTotals(o: {
  fromBlock: number;
  toBlock: number;
  arbBlocks: Set<number>;
  predictedAt: (block: number) => number;
}): { blocks: number; arbBlocks: number; observed: number; predicted: number } {
  let blocks = 0;
  let arb = 0;
  let pred = 0;
  for (let b = o.fromBlock; b <= o.toBlock; b++) {
    const p = o.predictedAt(b);
    if (Number.isNaN(p)) continue;
    blocks++;
    pred += p;
    if (o.arbBlocks.has(b)) arb++;
  }
  return blocks === 0 ? { blocks: 0, arbBlocks: 0, observed: 0, predicted: 0 } : { blocks, arbBlocks: arb, observed: arb / blocks, predicted: pred / blocks };
}
