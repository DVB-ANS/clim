// Helpers for the CRE evidence collector and the secret scan: event decoding, block ranges, secrets, redaction.
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAbiItem, decodeEventLog } from "viem";

export const KICKOFF_TS = 1791259200; // 2026-10-06T04:00:00Z = 12:00 SGT, hackathon kickoff
export const CHUNK_BLOCKS = 5000;

export const RISK_REPORTED = parseAbiItem(
  "event RiskReported(uint32 indexed seq, uint40 tObs, uint32 sigmaApplied, uint32 sigmaReported, uint32 rv15E9, uint16 dvolE2, int24 refTick, uint16 dispBp, uint8 nSources, uint16 kE4, uint8 zone)",
);

// First block that can hold a post-kickoff transaction. Overestimates the block count (missed slots), so it starts early.
export function kickoffFromBlock(latestBlock, latestTimestamp, kickoffTs = KICKOFF_TS, blockTimeSec = 12) {
  const blocks = Math.ceil((latestTimestamp - kickoffTs) / blockTimeSec);
  return Math.max(0, latestBlock - blocks - 100);
}

export function blockRanges(from, to, size = CHUNK_BLOCKS) {
  const out = [];
  for (let a = from; a <= to; a += size) out.push([a, Math.min(a + size - 1, to)]);
  return out;
}

export function toReport(log) {
  const { args } = decodeEventLog({ abi: [RISK_REPORTED], topics: log.topics, data: log.data });
  return {
    seq: Number(args.seq),
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    tObs: Number(args.tObs),
    sigmaApplied: Number(args.sigmaApplied),
    sigmaReported: Number(args.sigmaReported),
    rv15E9: Number(args.rv15E9),
    dvolE2: Number(args.dvolE2),
    refTick: Number(args.refTick),
    dispBp: Number(args.dispBp),
    nSources: Number(args.nSources),
    kE4: Number(args.kE4),
    zone: Number(args.zone),
  };
}

export const ENV_FILES = [".env", "cre/.env", "cre/.env.replay", "bots/.env", "contracts/.env", "app/.env.local", "lab/.env"];

const SECRET_NAME = /KEY|SECRET|TOKEN|PASS|PRIVATE|MNEMONIC|SEED|AUTH/i;
const KEYED_URL = /\/v[23]\/[A-Za-z0-9_-]{16,}|[?&](?:api[_-]?key|key|token)=/i;

// Secret values of KEY=VALUE lines: any value of a key named like a secret, and URLs that embed an API key.
// Returned with and without a 0x prefix.
export function secretsFromEnv(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\s#]+)["']?/);
    if (!m || m[2].length < 16) continue;
    const [, name, value] = m;
    if (!SECRET_NAME.test(name) && !KEYED_URL.test(value)) continue;
    out.push(value);
    if (value.startsWith("0x")) out.push(value.slice(2));
  }
  return out;
}

export function loadSecrets(root) {
  return ENV_FILES.map((f) => path.join(root, f))
    .filter((f) => existsSync(f))
    .flatMap((f) => secretsFromEnv(readFileSync(f, "utf8")));
}

export function findSecrets(text, secrets) {
  return secrets.filter((s) => text.includes(s));
}

// Replaces the home directory (it carries the local user name) with ~.
export function redactHome(text, home = os.homedir()) {
  return text.split(home).join("~");
}

// Hides API keys embedded in RPC URLs (Alchemy /v2/<key>, Infura /v3/<key>, ?apikey=<key>).
export function redactUrls(text) {
  return text
    .replace(/(\/v[23]\/)[A-Za-z0-9_-]{16,}/g, "$1<redacted>")
    .replace(/([?&](?:api[_-]?key|key|token)=)[A-Za-z0-9_-]{8,}/gi, "$1<redacted>");
}
