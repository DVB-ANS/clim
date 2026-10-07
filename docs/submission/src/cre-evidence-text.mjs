// Prints the text for Builderbase's CRE-track field "Evidence of a successful CRE simulation or deployment",
// with the live desk's report count read on-chain at run time, and refuses anything over the field's 1,500 characters.
// Usage (from docs/submission): npm run evidence:text
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { P } from "./paths.mjs";
import { readJson } from "./inputs.mjs";

export const MAX_CHARS = 1500;
const STATE = parseAbi(["function state() view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq)"]);
const tx = (h) => `https://sepolia.etherscan.io/tx/${h}`;
const addr = (a) => `https://sepolia.etherscan.io/address/${a}`;

// facts: { liveDesk, replayDesk, liveSeq, replaySeq, readUtc, repoUrl, videoUrl? }
export function evidenceText(f) {
  return [
    "Chainlink CRE workflow (TypeScript SDK, cre CLI v1.37.0) run with `cre workflow simulate --broadcast` on Ethereum Sepolia every 30 s since 2026-10-06 16:26 UTC (real transactions). DON deploy access, requested 2026-10-06, was not granted during the hackathon: DON deployment cut.",
    "Each run, on one simulated node: cron trigger; 1-min ETH candles from Coinbase, Kraken, Binance, Hyperliquid (HTTP), 3 of 4 needed; 15-min realized volatility and dispersion; consensus API median; EVMClient.writeReport from our operator key via MockKeystoneForwarder (no DON signature) to RiskDesk.onReport. Our Uniswap v4 hook reads the desk each swap to set the LP fee.",
    `Live RiskDesk: ${addr(f.liveDesk)}`,
    `${f.liveSeq} reports applied (state().seq, read ${f.readUtc}); observation to block: median 14 s, p90 25 s.`,
    `Replay desk (4 Feb 2026 storm): ${f.replaySeq} reports: ${addr(f.replayDesk)}`,
    `First report: ${tx("0x6046552302b7711c4987ee7706d957538dc11ee77ca557b18c92261154e21cb6")}`,
    `Forged report, mined, ignored: ${tx("0x34ee46a6947d2831fdb3e5a09f831008589efd9cf099f61dca86dc4cdadc53d9")}`,
    "One run: consensus: sigma=12.4%/yr n=4 disp=3bp price=2694.85 > REPORT applied seq=227",
    `Transcripts and every tx: ${f.repoUrl}/tree/main/docs/evidence`,
    ...(f.videoUrl ? [`Demo video: ${f.videoUrl}`] : []),
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dep = readJson(P.deployments);
  const links = readJson(P.links);
  const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 3 }) });
  const read = (a) => client.readContract({ address: a, abi: STATE, functionName: "state" });
  const [live, replay] = await Promise.all([read(dep.riskDesks.live), read(dep.riskDesks.replay)]);
  const now = new Date();
  const readUtc = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;
  const text = evidenceText({ liveDesk: dep.riskDesks.live, replayDesk: dep.riskDesks.replay, liveSeq: live[4], replaySeq: replay[4], readUtc, repoUrl: links.repoUrl, videoUrl: links.videoUrl || null });
  if (text.length > MAX_CHARS) throw new Error(`evidence text is ${text.length} characters, over ${MAX_CHARS}`);
  console.log(text);
  console.error(`\n(${text.length} of ${MAX_CHARS} characters)`);
}
