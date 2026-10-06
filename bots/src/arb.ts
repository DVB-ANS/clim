// Arbitrage bot: every new block, read both pools and the market price, and arbitrage each pool back to
// the edge of its no-arbitrage band (V: fee from ClimHook.quoteFee(), S: static fee from slot0.lpFee).
// It swaps through routers.arb (its own PoolSwapTest, so the app can tell arbitrage swaps by Swap.sender).
// Usage: bun src/arb.ts --pair live|replay        Log: bots/out/arb-<pair>.jsonl
import { arbRouter, loadDeployments, orientationOf, poolSwapTestAbi, resolvePair } from "@clim/shared";
import { join } from "node:path";
import { decideArb } from "./lib/arb";
import { publicClientFor, readBalances, readPairState, walletFor } from "./lib/chain";
import { botKey, envStr, pairArg } from "./lib/env";
import { appendJsonl, OUT_DIR, shortError } from "./lib/jsonl";
import { aggregate, fetchReplayPrice, fetchVenueQuotes } from "./lib/market";
import { swapArgs } from "./lib/swap";

const pair = pairArg();
const d = loadDeployments();
const p = resolvePair(d, pair);
const client = publicClientFor();
const wallet = walletFor(botKey("ARB", pair));
const me = wallet.account.address;
const router = arbRouter(d);
const logFile = join(OUT_DIR, `arb-${pair}.jsonl`);
const replayUrl = envStr("REPLAY_URL", "http://127.0.0.1:8787");

async function marketPrice(): Promise<{ price: number; n: number } | null> {
  if (pair === "replay") return { price: await fetchReplayPrice(replayUrl), n: 1 };
  return aggregate(await fetchVenueQuotes());
}

// A pool with an arbitrage tx still pending is skipped: trading it again on the same stale state would
// revert (PriceLimitAlreadyExceeded) or overshoot.
const inflight = new Set<"V" | "S">();

async function onBlock(blockNumber: bigint): Promise<void> {
  const [m, s, bal] = await Promise.all([marketPrice(), readPairState(client, d, p, blockNumber), readBalances(client, p, me, router, blockNumber)]);
  if (!m) {
    appendJsonl(logFile, { ts: new Date().toISOString(), block: blockNumber, action: "skip", reason: "fewer than 3 venues" });
    console.log(`[arb ${pair}] block ${blockNumber}: skip (fewer than 3 venues)`);
    return;
  }
  for (const label of ["V", "S"] as const) {
    const pool = p[label];
    const feePips = label === "V" ? s.hookFee : s.S.lpFee;
    const dec = decideArb({ sqrtPriceX96: s[label].sqrtPriceX96, marketEthUsd: m.price, feePips, orientation: orientationOf(pool, d) });
    const base = {
      ts: new Date().toISOString(),
      block: blockNumber,
      pool: label,
      market: m.price,
      nVenues: m.n,
      poolEthUsd: dec.poolEthUsd,
      feePips,
      hookMode: s.hookMode,
      logGapBp: dec.logGap * 1e4,
      bandBp: dec.bandLog * 1e4,
    };
    const gap = `${label} pool ${dec.poolEthUsd.toFixed(2)} vs ${m.price.toFixed(2)} gap ${(dec.logGap * 1e4).toFixed(1)}bp band ${(dec.bandLog * 1e4).toFixed(1)}bp`;
    if (dec.action === "none") {
      appendJsonl(logFile, { ...base, action: "none" });
      console.log(`[arb ${pair}] block ${blockNumber} ${gap} -> none`);
      continue;
    }
    if (inflight.has(label)) {
      appendJsonl(logFile, { ...base, action: "skip", reason: "previous arbitrage pending" });
      continue;
    }
    const amountIn = dec.side === "buyEth" ? bal.usdToken : bal.ethToken;
    if (amountIn === 0n) {
      appendJsonl(logFile, { ...base, action: "skip", reason: `no ${dec.side === "buyEth" ? p.tUSD.symbol : p.tETH.symbol} balance` });
      continue;
    }
    try {
      // Spend up to the whole balance: the swap stops at the price limit, so only the needed amount moves.
      const { request } = await client.simulateContract({
        account: wallet.account,
        address: router,
        abi: poolSwapTestAbi,
        functionName: "swap",
        args: swapArgs(pool.key, dec.zeroForOne, amountIn, dec.sqrtPriceLimitX96),
      });
      const hash = await wallet.writeContract(request);
      inflight.add(label);
      appendJsonl(logFile, { ...base, action: dec.side, zeroForOne: dec.zeroForOne, targetEthUsd: dec.targetEthUsd, sqrtPriceLimitX96: dec.sqrtPriceLimitX96, txHash: hash });
      console.log(`[arb ${pair}] block ${blockNumber} ${gap} -> ${dec.side} tx ${hash}`);
      client
        .waitForTransactionReceipt({ hash })
        .then(
          (r) => appendJsonl(logFile, { ts: new Date().toISOString(), event: "receipt", pool: label, txHash: hash, status: r.status, block: r.blockNumber, gasUsed: r.gasUsed }),
          (e: unknown) => appendJsonl(logFile, { ts: new Date().toISOString(), event: "receipt-error", pool: label, txHash: hash, error: shortError(e) }),
        )
        .finally(() => inflight.delete(label));
    } catch (e) {
      // PriceLimitAlreadyExceeded (0x7c9c6e8f) in simulation: another swap moved the pool since this block was read.
      const error = shortError(e);
      const action = /PriceLimitAlreadyExceeded|0x7c9c6e8f/.test(error) ? "stale" : "error";
      appendJsonl(logFile, { ...base, action, error });
      console.error(`[arb ${pair}] block ${blockNumber} ${gap} -> ${action}: ${error}`);
    }
  }
}

let busy = false;
console.log(`[arb ${pair}] ${me} watching Sepolia blocks; V=${p.V.poolId} S=${p.S.poolId} router ${router}`);
if (d.routers.arb === null) {
  console.warn(`[arb ${pair}] routers.arb is not deployed: arbitrage goes through the shared PoolSwapTest and the app cannot tell it from retail flow`);
}
client.watchBlockNumber({
  emitMissed: false,
  pollingInterval: 2_000,
  onBlockNumber: (blockNumber) => {
    if (busy) return; // still handling the previous block: skip rather than queue stale work
    busy = true;
    onBlock(blockNumber)
      .catch((e: unknown) => console.error(`[arb ${pair}] block ${blockNumber} failed: ${shortError(e)}`))
      .finally(() => {
        busy = false;
      });
  },
  onError: (e) => console.error(`[arb ${pair}] watch error: ${shortError(e)}`),
});
