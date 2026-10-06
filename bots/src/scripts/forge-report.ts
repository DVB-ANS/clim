// Safety demo 1 (forged report): a third party pushes sigma = 0 to RiskDesk through the permissionless
// MockKeystoneForwarder. The SIM guard (tx.origin must be the CRE operator) must reject it:
// the forwarder emits ReportProcessed(result=false) and the transaction carries no RiskReported.
// The verdict reads only this transaction's receipt: the live CRE loop keeps reporting every 30 s, so a
// legitimate report can land between the two state() reads, which are printed and logged for context only.
// Sends from NOISE_<PAIR>_PRIVATE_KEY, which must NOT be the CRE operator key.
// Usage: bun src/scripts/forge-report.ts --pair live
import { buildMockRawReport, loadDeployments, mockForwarderAbi, requireValue, riskDeskAbi } from "@clim/shared";
import { join } from "node:path";
import { keccak256, parseEventLogs, toHex } from "viem";
import { publicClientFor, walletFor } from "../lib/chain";
import { botKey, pairArg } from "../lib/env";
import { appendJsonl, OUT_DIR } from "../lib/jsonl";

const pair = pairArg();
const d = loadDeployments();
const desk = requireValue(d.riskDesks[pair], `riskDesks.${pair}`);
const client = publicClientFor();
const attacker = walletFor(botKey("NOISE", pair));

const before = await client.readContract({ address: desk, abi: riskDeskAbi, functionName: "state" });
const now = Math.floor(Date.now() / 1000);
const raw = buildMockRawReport(
  { tObs: now, sigmaE9: 0, rv15E9: 0, dvolE2: 0, refTick: 0, dispBp: 0, nSources: 4, kE4: 10_000, zone: 0 },
  { executionId: keccak256(toHex(`clim-forged-${now}`)), timestamp: now },
);
const hash = await attacker.writeContract({
  address: d.cre.mockForwarder,
  abi: mockForwarderAbi,
  functionName: "report",
  args: [desk, raw, "0x", []],
  gas: 500_000n,
});
const r = await client.waitForTransactionReceipt({ hash });
const result = parseEventLogs({ abi: mockForwarderAbi, eventName: "ReportProcessed", logs: r.logs })[0]?.args.result ?? null;
const reported = parseEventLogs({ abi: riskDeskAbi, eventName: "RiskReported", logs: r.logs }).filter((l) => l.address.toLowerCase() === desk.toLowerCase());
const after = await client.readContract({ address: desk, abi: riskDeskAbi, functionName: "state" });
const held = r.status === "success" && result === false && reported.length === 0;
const accepted = result === true || reported.length > 0;
appendJsonl(join(OUT_DIR, "security-demos.jsonl"), {
  ts: new Date().toISOString(),
  demo: "forge-report",
  pair,
  attacker: attacker.account.address,
  txHash: hash,
  txStatus: r.status,
  forwarderResult: result,
  riskReportedInTx: reported.length,
  seqBefore: before[4],
  seqAfter: after[4],
  sigmaBefore: before[1],
  sigmaAfter: after[1],
  held,
});
console.log(`forged report tx ${hash} from ${attacker.account.address}: status ${r.status}, forwarder result=${result}, RiskReported in tx: ${reported.length}`);
const moved = after[4] !== before[4] && reported.length === 0 ? " (another report landed in between, not this tx)" : "";
console.log(`desk seq ${before[4]} -> ${after[4]}, sigmaE9 ${before[1]} -> ${after[1]}${moved}`);
console.log(
  held
    ? "SIM guard held: forged report rejected"
    : accepted
      ? "FORGED REPORT ACCEPTED: investigate the RiskDesk SIM guard"
      : `NO VERDICT: tx status ${r.status}, forwarder result=${result}: the forwarder did not process the forged report`,
);
process.exit(held ? 0 : 1);
