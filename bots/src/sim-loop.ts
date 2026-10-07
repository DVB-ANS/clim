// CRE simulation loop with an on-chain record of every run.
// Runs plan 02's loop (`cre/scripts/sim-loop.sh <target> --broadcast`: build the WASM once, then
// `cre workflow simulate --wasm ... --non-interactive --trigger-index 0 --broadcast` every 30 s) and echoes its output.
// For each run it writes the transcript to bots/out/cre-sim/<pair>-<run start>.log (plan 06 evidence input) and appends one
// line to bots/out/cre-runs.jsonl: status, tx hash, receipt, the forwarder's ReportProcessed.result and the decoded
// RiskReported event. The receipt decides `applied` (receiptStatus); statusFromReceipt says when it overrode the
// workflow's final line, which stays in `detail`.
// Usage: bun src/sim-loop.ts --pair live|replay [--target <cre target>] [--once]
import { loadDeployments, mockForwarderAbi, requireValue, riskDeskAbi } from "@clim/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventLogs } from "viem";
import { publicClientFor } from "./lib/chain";
import { argValue, envStr, hasFlag, pairArg } from "./lib/env";
import { appendJsonl, OUT_DIR, shortError } from "./lib/jsonl";
import { loopCommand, receiptStatus, RunTracker, type RunResult } from "./lib/simParse";

const pair = pairArg();
const DEFAULT_TARGET = { live: "staging-settings", replay: "replay-settings" } as const;
const target = argValue("--target") ?? DEFAULT_TARGET[pair];
const once = hasFlag("--once");
const creDir = envStr("CRE_PROJECT_DIR", join(import.meta.dir, "..", "..", "cre"));
const d = loadDeployments();
const desk = requireValue(d.riskDesks[pair], `riskDesks.${pair}`);
const client = publicClientFor();
const runsFile = join(OUT_DIR, "cre-runs.jsonl");
const transcriptDir = join(OUT_DIR, "cre-sim");
mkdirSync(transcriptDir, { recursive: true });

async function record(run: RunResult): Promise<void> {
  const { lines, ...result } = run;
  const transcript = `${pair}-${(run.startedAt ?? new Date().toISOString()).replace(/[:.]/g, "-")}.log`;
  writeFileSync(join(transcriptDir, transcript), `${lines.join("\n")}\n`);
  const base = { ts: new Date().toISOString(), pair, target, ...result, transcript: `cre-sim/${transcript}` };
  if (!run.txHash) {
    appendJsonl(runsFile, base);
    console.log(`[sim-loop ${pair}] run ${run.startedAt}: ${run.status}${run.detail ? ` (${run.detail})` : ""}`);
    return;
  }
  try {
    const r = await client.waitForTransactionReceipt({ hash: run.txHash, timeout: 180_000 });
    const reported = parseEventLogs({ abi: riskDeskAbi, eventName: "RiskReported", logs: r.logs }).filter((l) => l.address.toLowerCase() === desk.toLowerCase());
    const processed = parseEventLogs({ abi: mockForwarderAbi, eventName: "ReportProcessed", logs: r.logs });
    const ev = reported[0]?.args;
    const forwarderResult = processed[0]?.args.result ?? null;
    const status = receiptStatus(run.status, forwarderResult, reported.length > 0);
    const rec = {
      ...base,
      status,
      statusFromReceipt: status !== run.status,
      txStatus: r.status,
      blockNumber: r.blockNumber,
      gasUsed: r.gasUsed,
      from: r.from,
      forwarderResult,
      seq: ev?.seq ?? null,
      tObs: ev?.tObs ?? null,
      sigmaApplied: ev?.sigmaApplied ?? null,
      sigmaReported: ev?.sigmaReported ?? null,
      nSources: ev?.nSources ?? null,
      dispBp: ev?.dispBp ?? null,
      kE4: ev?.kE4 ?? null,
    };
    appendJsonl(runsFile, rec);
    const why = rec.statusFromReceipt ? ` (from the receipt; workflow: ${run.status})` : "";
    console.log(`[sim-loop ${pair}] run ${run.startedAt}: ${status}${why} tx ${run.txHash} block ${r.blockNumber} seq ${rec.seq} sigmaApplied ${rec.sigmaApplied} forwarderResult ${forwarderResult}`);
  } catch (e) {
    appendJsonl(runsFile, { ...base, receiptError: shortError(e) });
    console.error(`[sim-loop ${pair}] run ${run.startedAt}: tx ${run.txHash} receipt error: ${shortError(e)}`);
  }
}

const cmd = loopCommand(target);
console.log(`[sim-loop ${pair}] ${cmd.join(" ")} (cwd ${creDir}), recording to ${runsFile}`);
const proc = Bun.spawn(cmd, { cwd: creDir, stdout: "pipe", stderr: "inherit", env: process.env });
process.on("SIGINT", () => {
  proc.kill();
  process.exit(130);
});

const tracker = new RunTracker();
let pending: Promise<void> = Promise.resolve();
const handle = (run: RunResult | null): void => {
  if (!run) return;
  pending = pending.then(() => record(run));
  if (once) {
    pending.then(() => {
      proc.kill();
      process.exit(0);
    });
  }
};

const reader = proc.stdout.pipeThrough(new TextDecoderStream()).getReader();
let buf = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += value;
  let nl = buf.indexOf("\n");
  while (nl >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    console.log(line);
    handle(tracker.push(line));
    nl = buf.indexOf("\n");
  }
}
handle(tracker.flush());
await pending;
const code = await proc.exited;
console.error(`[sim-loop ${pair}] loop exited with code ${code}`);
process.exit(code === 0 ? 0 : 1);
