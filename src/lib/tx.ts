// The transaction flow of /swap and /lp: step states, receipt logs in plan 05's RawLog shape (so the
// dashboard's decoders read them), and the simulated flow used while the contracts are not deployed.
import { type Address, type Hex, keccak256, numberToHex, toHex, type TransactionReceipt } from "viem";
import { encodeSwapLog, type RawLog } from "./encode";
import { estimateOut, type SwapPlan } from "./swap";
import { ethUsdToTick } from "./units";

export type StepStatus = "waiting" | "signing" | "pending" | "done" | "failed";
export type StepState = { label: string; status: StepStatus; hash?: Hex; error?: string };

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

/** Deterministic fake transaction hash for a simulated step. */
export function mockTxHash(label: string, n: number): Hex {
  return keccak256(toHex(`clim-mock:${label}:${n}`));
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
  n: number;
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
      { address: o.poolManager, blockNumber: o.blockNumber, blockTimestamp: o.t, transactionHash: mockTxHash("swap", o.n), logIndex: 0 },
    ),
  ];
}
