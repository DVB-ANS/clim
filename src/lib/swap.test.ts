import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { computePoolId, type PairDeployment } from "./deployments";
import { encodeSwapLog } from "./encode";
import { FeeMode } from "./feeMath";
import { estimateOut, feeReason, MAX_SQRT_PRICE, MIN_SQRT_PRICE, planSwap, swapResult } from "./swap";

const tETH: Address = "0x1000000000000000000000000000000000000001";
const tUSD: Address = "0x2000000000000000000000000000000000000002";
const HOOK: Address = "0x5000000000000000000000000000000000001080";
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const PM: Address = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";

function pairOf(c0: Address, c1: Address): PairDeployment {
  const keyV = { currency0: c0, currency1: c1, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
  const keyS = { ...keyV, fee: 1_050, hooks: ZERO };
  return {
    riskDesk: "0x4000000000000000000000000000000000000004",
    hook: HOOK,
    startBlock: 1,
    token0IsEth: c0 === tETH,
    V: { poolId: computePoolId(keyV), key: keyV },
    S: { poolId: computePoolId(keyS), key: keyS },
  };
}

describe("planSwap (PoolSwapTest exact-input swap)", () => {
  const pair = pairOf(tETH, tUSD);

  it("sells tETH for tUSD as token0 -> token1 with the lowest price limit", () => {
    const p = planSwap({ pair, tETH, tUSD, pool: "V", side: "sell ETH", amount: "1.5" });
    expect(p.tokenIn).toBe(tETH);
    expect(p.tokenOut).toBe(tUSD);
    expect(p.amountIn).toBe(1_500_000_000_000_000_000n);
    expect(p.params).toEqual({ zeroForOne: true, amountSpecified: -1_500_000_000_000_000_000n, sqrtPriceLimitX96: MIN_SQRT_PRICE + 1n });
    expect(p.poolId).toBe(pair.V.poolId);
  });

  it("buys tETH with tUSD as token1 -> token0 with the highest price limit, on the chosen pool", () => {
    const p = planSwap({ pair, tETH, tUSD, pool: "S", side: "buy ETH", amount: "2500" });
    expect(p.tokenIn).toBe(tUSD);
    expect(p.params.zeroForOne).toBe(false);
    expect(p.params.sqrtPriceLimitX96).toBe(MAX_SQRT_PRICE - 1n);
    expect(p.key.fee).toBe(1_050);
  });

  it("follows the pool orientation when tUSD is token0", () => {
    const flipped = pairOf(tUSD, tETH);
    expect(planSwap({ pair: flipped, tETH, tUSD, pool: "V", side: "sell ETH", amount: "1" }).params.zeroForOne).toBe(false);
  });

  it("refuses an amount that is not a positive decimal number", () => {
    for (const bad of ["", "0", "-1", "abc", "1e3"]) {
      expect(() => planSwap({ pair, tETH, tUSD, pool: "V", side: "sell ETH", amount: bad })).toThrow(/amount/);
    }
  });
});

describe("feeReason (the weather behind the fee)", () => {
  const base = { staticFeePips: 1_050, feeMinPips: 500, feeSafePips: 3_000, tauKillSec: 180 };

  it("explains V's fee by sigma in normal mode, and names the floor when it binds", () => {
    expect(feeReason({ ...base, pool: "V", quote: { feePips: 1_822, mode: FeeMode.Normal }, sigmaPct: 100 })).toBe(
      "You pay 18.22 bp because σ = 100.0%/yr (normal mode).",
    );
    expect(feeReason({ ...base, pool: "V", quote: { feePips: 500, mode: FeeMode.Normal }, sigmaPct: 31.4 })).toBe(
      "You pay 5.00 bp because σ = 31.4%/yr (normal mode): calm weather, the 5 bp floor applies.",
    );
  });

  it("explains the degraded and blind overrides", () => {
    expect(feeReason({ ...base, pool: "V", quote: { feePips: 3_000, mode: FeeMode.Degraded }, sigmaPct: 40 })).toBe(
      "You pay 30.00 bp because the exchanges disagree by more than 25 bp (degraded mode: at least 30 bp).",
    );
    expect(feeReason({ ...base, pool: "V", quote: { feePips: 3_000, mode: FeeMode.Blind }, sigmaPct: 40 })).toBe(
      "You pay 30.00 bp because the risk desk has been silent for more than 180 s (blind mode: at least 30 bp).",
    );
  });

  it("explains S's fee as fixed", () => {
    expect(feeReason({ ...base, pool: "S", quote: { feePips: 1_822, mode: FeeMode.Normal }, sigmaPct: 100 })).toBe(
      "You pay 10.50 bp: pool S charges a fixed fee, whatever the weather.",
    );
  });
});

describe("estimateOut", () => {
  it("applies the fee to the input at the pool's mid price (before price impact)", () => {
    expect(estimateOut({ side: "sell ETH", amountIn: 1, ethUsd: 2_500, feePips: 500 })).toBeCloseTo(2_498.75, 9);
    expect(estimateOut({ side: "buy ETH", amountIn: 2_500, ethUsd: 2_500, feePips: 500 })).toBeCloseTo(0.9995, 12);
  });
});

describe("swapResult", () => {
  it("reads the fee actually charged from the receipt's Swap event of the swapped pool", () => {
    const pair = pairOf(tETH, tUSD);
    const meta = (logIndex: number) => ({ address: PM, blockNumber: 10, blockTimestamp: 1_000, transactionHash: `0x${"ab".repeat(32)}` as const, logIndex });
    const args = { sender: tETH, amount0: -1n, amount1: 1n, sqrtPriceX96: 1n, liquidity: 1n, tick: 0 };
    const logs = [
      encodeSwapLog({ ...args, poolId: pair.S.poolId, fee: 1_050 }, meta(0)),
      encodeSwapLog({ ...args, poolId: pair.V.poolId, fee: 1_822 }, meta(1)),
    ];
    expect(swapResult(logs, pair.V.poolId)?.fee).toBe(1_822);
    expect(swapResult(logs, "0x01")).toBeUndefined();
  });
});
