// Health check of one pair: desk state, hook fee (checked against the shared/ mirror), pool prices, market
// price and bot balances. Exits 1 on a hard problem. --watch prints one line per block (blind-mode demo).
// Usage: bun src/scripts/status.ts --pair live|replay [--watch]
import {
  arbRouter,
  FeeMode,
  loadDeployments,
  loadParams,
  pipsToBp,
  quoteFeeMirror,
  resolvePair,
  sigmaE9ToAnnual,
  type FeeModeValue,
} from "@clim/shared";
import { formatEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClientFor, readBalances, readPairState } from "../lib/chain";
import { botKey, envStr, hasFlag, pairArg } from "../lib/env";
import { shortError } from "../lib/jsonl";
import { aggregate, fetchReplayPrice, fetchVenueQuotes } from "../lib/market";

const pair = pairArg();
const d = loadDeployments();
const p = resolvePair(d, pair);
const params = loadParams();
const client = publicClientFor();
const MODE_NAME: Record<number, string> = { [FeeMode.Normal]: "normal", [FeeMode.Degraded]: "degraded", [FeeMode.Blind]: "blind" };

async function market(): Promise<string> {
  try {
    if (pair === "replay") return `replay ${(await fetchReplayPrice(envStr("REPLAY_URL", "http://127.0.0.1:8787"))).toFixed(2)}`;
    const q = await fetchVenueQuotes();
    const m = aggregate(q);
    return m ? `${m.price.toFixed(2)} (${m.n} venues)` : `n/a (${q.length} venues)`;
  } catch (e) {
    return `n/a (${shortError(e)})`;
  }
}

async function snapshot(blockNumber: bigint): Promise<{ line: string; problems: string[] }> {
  const [s, block, m] = await Promise.all([readPairState(client, d, p, blockNumber), client.getBlock({ blockNumber }), market()]);
  const now = Number(block.timestamp);
  const mirror = quoteFeeMirror(s.desk, params, now);
  const problems: string[] = [];
  if (mirror.fee !== s.hookFee || mirror.mode !== (s.hookMode as FeeModeValue)) {
    problems.push(`hook quoteFee ${s.hookFee}/${s.hookMode} != shared mirror ${mirror.fee}/${mirror.mode} (params.json differs from the deployed hook?)`);
  }
  if (s.V.protocolFee !== 0 || s.S.protocolFee !== 0) problems.push(`protocol fee is not 0 (V ${s.V.protocolFee}, S ${s.S.protocolFee})`);
  const age = s.desk.seq === 0 ? "never" : `${now - s.desk.tObs}s`;
  const line =
    `block ${blockNumber} | desk seq ${s.desk.seq} age ${age} sigma ${(sigmaE9ToAnnual(s.desk.sigmaE9) * 100).toFixed(1)}%/yr k ${s.desk.kE4 / 1e4} flags ${s.desk.flags}` +
    ` | V fee ${s.hookFee} pips (${pipsToBp(s.hookFee).toFixed(2)} bp, ${MODE_NAME[s.hookMode] ?? s.hookMode})` +
    ` | S fee ${s.S.lpFee} pips | V ${s.V.ethUsd.toFixed(2)} S ${s.S.ethUsd.toFixed(2)} | market ${m}`;
  return { line, problems };
}

async function balances(): Promise<void> {
  for (const role of ["ARB", "NOISE"] as const) {
    let addr: `0x${string}`;
    try {
      addr = privateKeyToAccount(botKey(role, pair)).address;
    } catch {
      console.log(`${role}_${pair.toUpperCase()}: key not set`);
      continue;
    }
    const router = role === "ARB" ? arbRouter(d) : d.uniswap.poolSwapTest;
    const b = await readBalances(client, p, addr, router);
    const approved = b.ethAllowance > 0n && b.usdAllowance > 0n ? "approved" : "NOT APPROVED (run fund)";
    console.log(
      `${role}_${pair.toUpperCase()} ${addr}: ${formatEther(b.native)} ETH, ${formatUnits(b.ethToken, p.tETH.decimals)} ${p.tETH.symbol}, ${formatUnits(b.usdToken, p.tUSD.decimals)} ${p.tUSD.symbol}, ${approved}`,
    );
  }
}

const head = await client.getBlockNumber();
const first = await snapshot(head);
console.log(`pair ${pair}: hook ${p.hook} desk ${p.desk}`);
console.log(`params: P*=${params.pStar} etaE4=${params.etaE4} floor ${params.feeMinPips} cap ${params.feeMaxPips} safe ${params.feeSafePips} tauKill ${params.tauKillSec}s (${params.decidedBy})`);
console.log(first.line);
await balances();
for (const pr of first.problems) console.error(`PROBLEM: ${pr}`);

if (hasFlag("--watch")) {
  client.watchBlockNumber({
    emitMissed: false,
    pollingInterval: 2_000,
    onBlockNumber: (bn) => {
      snapshot(bn).then(
        (s) => console.log(`${new Date().toISOString()} ${s.line}${s.problems.length ? ` | PROBLEM: ${s.problems.join("; ")}` : ""}`),
        (e: unknown) => console.error(shortError(e)),
      );
    },
  });
} else {
  process.exit(first.problems.length === 0 ? 0 : 1);
}
