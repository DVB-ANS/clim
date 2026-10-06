// The transaction flow of /swap and /lp: step states, receipt logs in plan 05's RawLog shape (so the
// dashboard's decoders read them), and the simulated flow used while the contracts are not deployed.
import { type Address, type Hex, keccak256, numberToHex, toHex, type TransactionReceipt } from "viem";
import type { Deployments } from "./deployments";
import { encodeSwapLog, type RawLog } from "./encode";
import { estimateOut, type SwapPlan } from "./swap";
import { ethUsdToTick } from "./units";

export type StepStatus = "waiting" | "signing" | "pending" | "done" | "failed";
export type StepState = { label: string; status: StepStatus; hash?: Hex; error?: string; note?: string };

/** One transaction of a flow: run() asks for the signature, reports the hash, resolves once mined. */
export type FlowStep = {
  label: string;
  run: (onHash: (hash: Hex) => void, onNote: (note: string) => void) => Promise<RawLog[] | void>;
};

/** On-chain writes need the live pair, the tokens and the routers; until then they stay off, with this reason. */
export function writeReadiness(d: Deployments, needs: "swap" | "lp" | "faucet"): { ok: boolean; reason?: string } {
  if (!d.pairs.live) {
    return {
      ok: false,
      reason: "Contracts not deployed in this build: src/generated/sepolia.json has no live pair yet (npm run sync). The simulated mode walks through the same steps.",
    };
  }
  if (!d.tokens.tETH || !d.tokens.tUSD) return { ok: false, reason: "Test tokens not deployed yet (tokens.tETH and tokens.tUSD are null)." };
  if (needs === "lp" && !d.uniswap.poolModifyLiquidityTest) {
    return { ok: false, reason: "The PoolModifyLiquidityTest address is missing from the deployments." };
  }
  return { ok: true };
}

/**
 * Gas limit for a swap or a liquidity change: the estimate plus 25 %. The estimate is exact for the state it
 * ran on, and another swap on the same pool landing first can raise the cost (on Sepolia, 2026-10-07, an add
 * of liquidity estimated at 342,216 gas reverted after an arbitrage swap on the pool earlier in its block;
 * the same call then estimated at 352,527). Only the gas used is paid.
 */
export function withGasMargin(estimate: bigint): bigint {
  return (estimate * 125n) / 100n;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A simulated step: "signed" after signMs, "mined" mineMs later, with a deterministic hash. */
export function mockStep(label: string, n: number, logs?: RawLog[], delays = { signMs: 700, mineMs: 1_400 }): FlowStep {
  return {
    label,
    run: async (onHash) => {
      await sleep(delays.signMs);
      onHash(mockTxHash(label, n));
      await sleep(delays.mineMs);
      return logs;
    },
  };
}

/** A receipt's logs in the eth_getLogs shape (hex fields) that decode.ts reads. */
export function receiptLogs(receipt: Pick<TransactionReceipt, "logs">, blockTimestamp?: number): RawLog[] {
  return receipt.logs.map((l) => ({
    address: l.address,
    topics: l.topics as Hex[],
    data: l.data,
    blockNumber: numberToHex(l.blockNumber ?? 0n),
    ...(blockTimestamp === undefined ? {} : { blockTimestamp: numberToHex(blockTimestamp) }),
    transactionHash: l.transactionHash ?? "0x",
    logIndex: numberToHex(l.logIndex ?? 0),
  }));
}

// Seeds the simulated hashes per page load: a reload restarts the run counters, not the hashes.
const LOAD = Date.now().toString(36);

/** Fake transaction hash of a simulated step: the same for the same step and run, within a page load. */
export function mockTxHash(label: string, n: number): Hex {
  return keccak256(toHex(`clim-mock:${LOAD}:${label}:${n}`));
}

/**
 * The Swap log a simulated swap emits: the quoted fee, the swapper's deltas before price impact
 * (input negative, output positive, like the real event) and the pool's price unchanged.
 */
export function mockSwapLogs(o: {
  plan: SwapPlan;
  sender: Address;
  feePips: number;
  ethUsd: number;
  token0IsEth: boolean;
  liquidity: bigint;
  poolManager: Address;
  blockNumber: number;
  t: number;
  /** The simulated swap step's hash, so the receipt and the step show the same transaction. */
  txHash: Hex;
}): RawLog[] {
  const sellingEth = o.plan.params.zeroForOne === o.token0IsEth;
  const out = estimateOut({
    side: sellingEth ? "sell ETH" : "buy ETH",
    amountIn: Number(o.plan.amountIn) / 1e18,
    ethUsd: o.ethUsd,
    feePips: o.feePips,
  });
  const inDelta = -o.plan.amountIn;
  const outDelta = BigInt(Math.floor(out * 1e18));
  const ethDelta = sellingEth ? inDelta : outDelta;
  const usdDelta = sellingEth ? outDelta : inDelta;
  const price = o.token0IsEth ? o.ethUsd : 1 / o.ethUsd;
  return [
    encodeSwapLog(
      {
        poolId: o.plan.poolId,
        sender: o.sender,
        amount0: o.token0IsEth ? ethDelta : usdDelta,
        amount1: o.token0IsEth ? usdDelta : ethDelta,
        sqrtPriceX96: BigInt(Math.floor(Math.sqrt(price) * 2 ** 96)),
        liquidity: o.liquidity,
        tick: ethUsdToTick(o.ethUsd, o.token0IsEth),
        fee: o.feePips,
      },
      { address: o.poolManager, blockNumber: o.blockNumber, blockTimestamp: o.t, transactionHash: o.txHash, logIndex: 0 },
    ),
  ];
}

/** One readable line from a wallet or RPC error (viem errors carry a shortMessage). */
export function errorText(e: unknown): string {
  const short = typeof e === "object" && e !== null && "shortMessage" in e ? String((e as { shortMessage: unknown }).shortMessage) : "";
  const msg = short || (e instanceof Error ? e.message : String(e));
  return msg.split("\n")[0];
}
