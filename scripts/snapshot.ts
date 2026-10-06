// Freezes the pair's on-chain history (RiskReported + Swap logs) into public/data/chain/<pair>.json.
// The dashboard loads it first and only asks the RPC for newer blocks, so the live URL keeps working
// after the hackathon even on RPCs with pruned log history. Run: npm run snapshot -- live
import { mkdirSync, writeFileSync } from "node:fs";
import { type ChainSnapshot, fetchPairLogs, fillTimestamps, makeClient } from "@/lib/chain";
import { deployments } from "@/lib/config";
import { decodeDeliveries, decodeReports, decodeSwaps } from "@/lib/decode";
import { type Pair, PAIRS, SEPOLIA_CHAIN_ID } from "@/lib/deployments";

const CONFIRMATIONS = 3;

async function main() {
  const pair = (process.argv[2] ?? "live") as Pair;
  if (!PAIRS.includes(pair)) throw new Error(`unknown pair ${pair}, use one of ${PAIRS.join(", ")}`);
  const d = deployments.pairs[pair];
  if (!d) throw new Error(`pair ${pair} is not in src/generated/sepolia.json: run npm run sync after deploying`);
  const client = makeClient();
  const head = await client.getBlock({ blockTag: "latest" });
  const to = Number(head.number) - CONFIRMATIONS;
  const anchor = { block: Number(head.number), t: Number(head.timestamp) };
  const logs = await fetchPairLogs(client, d, deployments, d.startBlock, to);
  const snap: ChainSnapshot = {
    schema: "clim.chainSnapshot/1",
    pair,
    chainId: SEPOLIA_CHAIN_ID,
    fromBlock: d.startBlock,
    toBlock: to,
    generatedAt: new Date().toISOString(),
    deskLogs: fillTimestamps(logs.deskLogs, anchor),
    swapLogs: fillTimestamps(logs.swapLogs, anchor),
    forwarderLogs: fillTimestamps(logs.forwarderLogs, anchor),
  };
  mkdirSync("public/data/chain", { recursive: true });
  writeFileSync(`public/data/chain/${pair}.json`, JSON.stringify(snap));
  console.log(
    `public/data/chain/${pair}.json: blocks ${snap.fromBlock}..${snap.toBlock}, ${decodeReports(snap.deskLogs).length} reports, ${decodeSwaps(snap.swapLogs).length} swaps, ${decodeDeliveries(snap.forwarderLogs).filter((x) => !x.accepted).length} rejected deliveries`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
