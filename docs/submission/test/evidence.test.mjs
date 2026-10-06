import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeEventTopics, encodeAbiParameters } from "viem";
import { RISK_REPORTED, kickoffFromBlock, blockRanges, toReport, secretsFromEnv, findSecrets, redactUrls, redactHome } from "../src/evidence.mjs";

test("toReport decodes a RiskReported log", () => {
  const topics = encodeEventTopics({ abi: [RISK_REPORTED], eventName: "RiskReported", args: { seq: 7 } });
  const nonIndexed = RISK_REPORTED.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(nonIndexed, [1791300000, 53419, 53500, 53500, 4800, -199990, 3, 4, 10000, 0]);
  const r = toReport({ topics, data, transactionHash: "0x" + "ab".repeat(32), blockNumber: 11850010n });
  assert.deepEqual(r, {
    seq: 7, txHash: "0x" + "ab".repeat(32), blockNumber: 11850010, tObs: 1791300000, sigmaApplied: 53419, sigmaReported: 53500,
    rv15E9: 53500, dvolE2: 4800, refTick: -199990, dispBp: 3, nSources: 4, kE4: 10000, zone: 0,
  });
});

test("kickoffFromBlock starts at or before the kickoff block", () => {
  // 1 day after kickoff at 12 s per block = 7200 blocks, plus a 100-block margin
  assert.equal(kickoffFromBlock(11_860_000, 1791259200 + 86_400), 11_860_000 - 7200 - 100);
  assert.equal(kickoffFromBlock(50, 1791259200 + 86_400), 0);
});

test("blockRanges covers the interval in inclusive chunks", () => {
  assert.deepEqual(blockRanges(10, 25, 10), [[10, 19], [20, 25]]);
  assert.deepEqual(blockRanges(10, 10, 10), [[10, 10]]);
});

test("secrets are read from env files and found in text", () => {
  const env = [
    "CRE_ETH_PRIVATE_KEY=0x" + "1f".repeat(32),
    "SHORT=abc",
    "# comment",
    'export RPC="https://x.io/v2/ABCDEFGHIJKLMNOPQRST"',
    "SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com",
    "ETHERSCAN_API_KEY=ABCDEFGHIJKLMNOP1234",
  ].join("\n");
  const secrets = secretsFromEnv(env);
  assert.deepEqual(secrets, ["0x" + "1f".repeat(32), "1f".repeat(32), "https://x.io/v2/ABCDEFGHIJKLMNOPQRST", "ABCDEFGHIJKLMNOP1234"]);
  assert.deepEqual(findSecrets("key " + "1f".repeat(32), secrets), ["1f".repeat(32)]);
  assert.deepEqual(findSecrets("tx 0x" + "ab".repeat(32), secrets), []);
});

test("redactHome replaces the home directory", () => {
  assert.equal(redactHome("at /Users/alice/dev/clim/cre", "/Users/alice"), "at ~/dev/clim/cre");
});

test("redactUrls hides keys in RPC URLs", () => {
  assert.equal(redactUrls("rpc https://eth-sepolia.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrSt done"), "rpc https://eth-sepolia.g.alchemy.com/v2/<redacted> done");
  assert.equal(redactUrls("https://api.x.io/q?apikey=SECRETSECRET&b=1"), "https://api.x.io/q?apikey=<redacted>&b=1");
});
