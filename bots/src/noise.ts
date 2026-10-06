// Retail (noise) bot: every new block, draw a Poisson number of small swaps (random side, log-normal USD size)
// and send each one to both pools (--routing mirror, default), to one at random (split) or to the cheaper one (cheapest).
// Usage: bun src/noise.ts --pair live|replay [--routing mirror|split|cheapest]      Log: bots/out/noise-<pair>.jsonl
import { loadDeployments, poolSwapTestAbi, resolvePair } from "@clim/shared";
import { join } from "node:path";
import { publicClientFor, readPairState, walletFor } from "./lib/chain";
import { argValue, botKey, envNum, pairArg } from "./lib/env";
import { appendJsonl, OUT_DIR, shortError } from "./lib/jsonl";
import { planBlockOrders, ROUTINGS, type NoiseConfig, type Routing } from "./lib/noise";
import { mulberry32 } from "./lib/rng";
import { inputAmountForUsd, noPriceLimit, swapArgs, zeroForOneFor } from "./lib/swap";

const pair = pairArg();
const routing = (argValue("--routing") ?? "mirror") as Routing;
if (!ROUTINGS.includes(routing)) throw new Error(`--routing must be one of ${ROUTINGS.join(", ")}, got ${routing}`);
const cfg: NoiseConfig = {
  ratePerBlock: envNum("NOISE_RATE_PER_BLOCK", 0.5),
  medianUsd: envNum("NOISE_MEDIAN_USD", 2_000),
  sigmaLn: envNum("NOISE_SIGMA_LN", 1),
  routing,
};
const seed = envNum("NOISE_SEED", 42);
const rand = mulberry32(seed);
const d = loadDeployments();
const p = resolvePair(d, pair);
const client = publicClientFor();
const wallet = walletFor(botKey("NOISE", pair));
const logFile = join(OUT_DIR, `noise-${pair}.jsonl`);

async function onBlock(blockNumber: bigint): Promise<void> {
  const s = await readPairState(client, d, p, blockNumber);
  const quotes = { V: { ethUsd: s.V.ethUsd, feePips: s.hookFee }, S: { ethUsd: s.S.ethUsd, feePips: s.S.lpFee } };
  for (const order of planBlockOrders(rand, cfg, quotes)) {
    const pool = p[order.pool];
    const zeroForOne = zeroForOneFor(order.side, pool.token0IsEth);
    const amountIn = inputAmountForUsd(order.side, order.usd, quotes[order.pool].ethUsd, p.tETH.decimals, p.tUSD.decimals);
    const base = { ts: new Date().toISOString(), block: blockNumber, pool: order.pool, side: order.side, usd: order.usd, feePips: quotes[order.pool].feePips, routing };
    try {
      const { request } = await client.simulateContract({
        account: wallet.account,
        address: d.uniswap.poolSwapTest,
        abi: poolSwapTestAbi,
        functionName: "swap",
        args: swapArgs(pool.key, zeroForOne, amountIn, noPriceLimit(zeroForOne)),
      });
      const hash = await wallet.writeContract(request);
      appendJsonl(logFile, { ...base, amountIn, txHash: hash });
      console.log(`[noise ${pair}] block ${blockNumber} ${order.side} $${order.usd.toFixed(0)} on ${order.pool} (fee ${quotes[order.pool].feePips} pips) tx ${hash}`);
    } catch (e) {
      appendJsonl(logFile, { ...base, error: shortError(e) });
      console.error(`[noise ${pair}] block ${blockNumber} ${order.pool} error: ${shortError(e)}`);
    }
  }
}

let busy = false;
console.log(`[noise ${pair}] ${wallet.account.address} rate ${cfg.ratePerBlock}/block median $${cfg.medianUsd} routing ${routing} seed ${seed}`);
client.watchBlockNumber({
  emitMissed: false,
  pollingInterval: 2_000,
  onBlockNumber: (blockNumber) => {
    if (busy) return;
    busy = true;
    onBlock(blockNumber)
      .catch((e: unknown) => console.error(`[noise ${pair}] block ${blockNumber} failed: ${shortError(e)}`))
      .finally(() => {
        busy = false;
      });
  },
  onError: (e) => console.error(`[noise ${pair}] watch error: ${shortError(e)}`),
});
