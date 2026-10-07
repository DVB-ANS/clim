// The transaction flow of /swap and /lp: step states and receipt logs in plan 05's RawLog shape (so the
// dashboard's decoders read them).
import { type Hex, numberToHex, type TransactionReceipt } from "viem";
import type { Deployments } from "./deployments";
import type { RawLog } from "./encode";

export type StepStatus = "waiting" | "signing" | "pending" | "done" | "failed";
export type StepState = { label: string; status: StepStatus; hash?: Hex; error?: string; note?: string };

/** One transaction of a flow: run() asks for the signature, reports the hash, resolves once mined. */
export type FlowStep = {
  label: string;
  run: (onHash: (hash: Hex) => void, onNote: (note: string) => void) => Promise<RawLog[] | void>;
};

/**
 * On-chain writes need the live pair, the tokens and the routers; until then they stay off, with this reason.
 * In the app, config.ts already refuses a build with no live pair, so only the tokens and routers reasons can
 * show; the pair check keeps this pure function safe on any deployments file (and its unit test).
 */
export function writeReadiness(d: Deployments, needs: "swap" | "lp" | "faucet"): { ok: boolean; reason?: string } {
  if (!d.pairs.live) {
    return {
      ok: false,
      reason: "Contracts not deployed in this build: src/generated/sepolia.json has no live pair (npm run sync).",
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

/** One readable line from a wallet or RPC error (viem errors carry a shortMessage). */
export function errorText(e: unknown): string {
  const short = typeof e === "object" && e !== null && "shortMessage" in e ? String((e as { shortMessage: unknown }).shortMessage) : "";
  const msg = short || (e instanceof Error ? e.message : String(e));
  return msg.split("\n")[0];
}
