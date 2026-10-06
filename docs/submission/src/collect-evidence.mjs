// Collects CRE evidence for judges: RiskReported events from Sepolia plus curated `cre workflow simulate` transcripts.
// Usage: node src/collect-evidence.mjs [--logs <dir with *.log transcripts>] [--max-logs 3]
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { P, REPO_ROOT } from "./paths.mjs";
import { readJson, deskAddresses } from "./inputs.mjs";
import { RISK_REPORTED, kickoffFromBlock, blockRanges, toReport, loadSecrets, findSecrets, redactUrls, redactHome } from "./evidence.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const logsDir = path.resolve(REPO_ROOT, arg("--logs", "bots/out/cre-sim"));
const maxLogs = Number(arg("--max-logs", "3"));
const rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const client = createPublicClient({ chain: sepolia, transport: http(rpc, { retryCount: 3 }) });
const desks = deskAddresses(readJson(P.deployments));
if (desks.length === 0) throw new Error("No address under a key containing 'desk' in shared/deployments/sepolia.json");

const latest = await client.getBlock({ blockTag: "latest" });
const toBlock = Number(latest.number);
const fromBlock = kickoffFromBlock(toBlock, Number(latest.timestamp));

const out = { chainId: 11155111, collectedAt: new Date().toISOString(), fromBlock, toBlock, desks: [] };
for (const desk of desks) {
  const reports = [];
  for (const [a, b] of blockRanges(fromBlock, toBlock)) {
    const logs = await client.getLogs({ address: desk.address, event: RISK_REPORTED, fromBlock: BigInt(a), toBlock: BigInt(b) });
    reports.push(...logs.map(toReport));
  }
  reports.sort((x, y) => x.seq - y.seq);
  console.log(`${desk.label} ${desk.address}: ${reports.length} RiskReported events`);
  if (reports.length) out.desks.push({ label: desk.label, address: desk.address, reports });
}
if (out.desks.length === 0) throw new Error("No RiskReported event found since kickoff: run the CRE loop with --broadcast first");

mkdirSync(P.evidenceDir, { recursive: true });
writeFileSync(P.evidence, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${path.relative(REPO_ROOT, P.evidence)}`);

const secrets = loadSecrets(REPO_ROOT);

if (!existsSync(logsDir)) {
  console.log(`no transcript directory at ${path.relative(REPO_ROOT, logsDir)}: skipped transcripts`);
} else {
  const txLogs = readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => path.join(logsDir, f))
    .filter((f) => /0x[0-9a-fA-F]{64}/.test(readFileSync(f, "utf8")))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, maxLogs);
  for (const f of txLogs) {
    const text = redactHome(redactUrls(readFileSync(f, "utf8")));
    const leaked = findSecrets(text, secrets);
    if (leaked.length) throw new Error(`${f} contains ${leaked.length} value(s) from a .env file: not copied. Remove them and rerun.`);
    const dest = path.join(P.evidenceDir, `cre-simulate-${path.basename(f)}`);
    writeFileSync(dest, text);
    console.log(`copied ${path.relative(REPO_ROOT, dest)}`);
  }
}
