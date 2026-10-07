import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { computePoolId, type PairDeployment } from "./deployments";
import { encodeSwapLog } from "./encode";
import { swapResult } from "./swap";
import { receiptLogs, withGasMargin } from "./tx";

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

describe("writeReadiness", () => {
  it("disables on-chain writes with a clear reason while the live pair is not deployed", async () => {
    const { writeReadiness } = await import("./tx");
    const { parseDeployments } = await import("./deployments");
    // a deployments file before the pair: infrastructure only
    const bootstrap = {
      chainId: 11155111,
      deployBlock: null,
      uniswap: {
        poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
        stateView: "0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C",
        poolSwapTest: "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe",
        poolModifyLiquidityTest: "0x0C478023803a644c94c4CE1C1e7b9A087e411B0A",
      },
      cre: { mockForwarder: "0x15fC6ae953E024d975e77382eEeC56A9101f9F88", keystoneForwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482" },
      tokens: { tETH: null, tUSD: null },
      riskDesks: { live: null, replay: null },
      hooks: { live: null, replay: null },
      pools: { liveV: null, liveS: null, replayV: null, replayS: null },
    };
    const r = writeReadiness(parseDeployments(bootstrap), "swap");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not deployed/);
  });
});

describe("errorText", () => {
  it("prefers viem's short message and keeps one line", async () => {
    const { errorText } = await import("./tx");
    expect(errorText({ shortMessage: "User rejected the request.", message: "long\nstack" })).toBe("User rejected the request.");
    expect(errorText(new Error("execution reverted: cooldown\nmore"))).toBe("execution reverted: cooldown");
    expect(errorText("plain")).toBe("plain");
  });
});

describe("gas limit of a swap or a liquidity change", () => {
  it("adds 25 % to the estimate", () => {
    expect(withGasMargin(342_216n)).toBe(427_770n);
    expect(withGasMargin(0n)).toBe(0n);
  });
});
