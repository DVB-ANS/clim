import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { computePoolId, type PairDeployment } from "./deployments";
import { encodeSwapLog } from "./encode";
import { planSwap, swapResult } from "./swap";
import { mockSwapLogs, mockTxHash, receiptLogs } from "./tx";

const tETH: Address = "0x1000000000000000000000000000000000000001";
const tUSD: Address = "0x2000000000000000000000000000000000000002";
const ROUTER: Address = "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe";
const PM: Address = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";
const HOOK: Address = "0x5000000000000000000000000000000000001080";

function pairOf(c0: Address, c1: Address): PairDeployment {
  const keyV = { currency0: c0, currency1: c1, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
  const keyS = { ...keyV, fee: 1_050, hooks: "0x0000000000000000000000000000000000000000" as Address };
  return {
    riskDesk: "0x4000000000000000000000000000000000000004",
    hook: HOOK,
    startBlock: 1,
    token0IsEth: c0 === tETH,
    V: { poolId: computePoolId(keyV), key: keyV },
    S: { poolId: computePoolId(keyS), key: keyS },
  };
}

describe("receiptLogs", () => {
  it("turns viem receipt logs into plan 05's RawLog shape, so decode.ts reads them", () => {
    const pair = pairOf(tETH, tUSD);
    const raw = encodeSwapLog(
      { poolId: pair.V.poolId, sender: ROUTER, amount0: -1n, amount1: 2n, sqrtPriceX96: 3n, liquidity: 4n, tick: 5, fee: 1_822 },
      { address: PM, blockNumber: 1, blockTimestamp: 1, transactionHash: `0x${"cd".repeat(32)}`, logIndex: 0 },
    );
    const receipt = {
      logs: [{ address: raw.address, topics: raw.topics, data: raw.data, blockNumber: 77n, transactionHash: raw.transactionHash, logIndex: 3 }],
    };
    const logs = receiptLogs(receipt as never, 1_000);
    expect(logs[0]).toMatchObject({ blockNumber: "0x4d", logIndex: "0x3", blockTimestamp: "0x3e8" });
    expect(swapResult(logs, pair.V.poolId)).toMatchObject({ fee: 1_822, amount0: -1n, blockNumber: 77, blockTimestamp: 1_000 });
  });
});

describe("mockTxHash", () => {
  it("is a deterministic 32-byte hash per step", () => {
    expect(mockTxHash("swap", 1)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(mockTxHash("swap", 1)).toBe(mockTxHash("swap", 1));
    expect(mockTxHash("swap", 2)).not.toBe(mockTxHash("swap", 1));
  });
});

describe("mockSwapLogs (simulated swap)", () => {
  const common = { sender: ROUTER, feePips: 1_822, ethUsd: 2_500, liquidity: 2n * 10n ** 23n, poolManager: PM, blockNumber: 9, t: 99, n: 1 };

  it("emits the Swap log a real swap would: quoted fee, swapper deltas, router as sender", () => {
    const pair = pairOf(tETH, tUSD);
    const plan = planSwap({ pair, tETH, tUSD, pool: "V", side: "sell ETH", amount: "1" });
    const s = swapResult(mockSwapLogs({ ...common, plan, token0IsEth: true }), pair.V.poolId)!;
    expect(s.fee).toBe(1_822);
    expect(s.sender).toBe(ROUTER);
    expect(s.amount0).toBe(-(10n ** 18n));
    expect(Number(s.amount1) / 1e18).toBeCloseTo(2_500 * (1 - 0.001822), 6);
  });

  it("follows the pool orientation when buying ETH with tUSD as token0", () => {
    const pair = pairOf(tUSD, tETH);
    const plan = planSwap({ pair, tETH, tUSD, pool: "S", side: "buy ETH", amount: "2500" });
    const s = swapResult(mockSwapLogs({ ...common, plan, token0IsEth: false, feePips: 1_050 }), pair.S.poolId)!;
    expect(s.amount0).toBe(-2_500n * 10n ** 18n);
    expect(Number(s.amount1) / 1e18).toBeCloseTo(1 - 0.00105, 9);
  });
});

describe("writeReadiness", () => {
  it("disables on-chain writes with a clear reason while the contracts are not deployed (the fixture)", async () => {
    const { writeReadiness } = await import("./tx");
    const { parseDeployments } = await import("./deployments");
    const fixture = (await import("../fixtures/deployments.sepolia.json")).default;
    const r = writeReadiness(parseDeployments(fixture), "swap");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not deployed/);
  });
});

describe("mockStep", () => {
  it("signs, reports a deterministic hash, then returns the simulated logs", async () => {
    const { mockStep, mockTxHash } = await import("./tx");
    const seen: string[] = [];
    const out = await mockStep("Swap on pool V", 3, [], { signMs: 0, mineMs: 0 }).run((h) => seen.push(h), () => {});
    expect(seen).toEqual([mockTxHash("Swap on pool V", 3)]);
    expect(out).toEqual([]);
  });
});
