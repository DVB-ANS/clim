// Pure helpers for sim-loop.ts, which runs plan 02's cre/scripts/sim-loop.sh and records every run.
// That script prints "=== <UTC time>" before each `cre workflow simulate` run and echoes the workflow's
// [USER LOG] lines plus any line containing "rror" or the CLI's failure mark "✗". The workflow (plan 02, workflow.ts)
// ends each run with one of:
//   REPORT applied ... tx=0x..    REPORT sent, desk state unreadable after tx=0x..    NOT APPLIED: ... tx=0x..
//   REJECTED by RiskDesk (onReport reverted) tx=0x..    clim: no report (<reason>)    DRY RUN: ...
// "Write report transaction succeeded: 0x.." (the CRE template wording) comes BEFORE the final line, so it is not
// an outcome: the run stays open and its transcript keeps both lines. The simulator sometimes loses the final line
// when it shuts down, so a run without one keeps that line's tx for the receipt check (sim-loop.ts, receiptStatus).
import type { Hex } from "viem";

export type RunStatus = "applied" | "sent" | "not-applied" | "rejected" | "no-report" | "dry-run" | "error" | "no-outcome";
/** One run of the loop; `lines` is its transcript (from its "===" line), kept for the evidence files of plan 06. */
export type RunResult = { startedAt: string | null; status: RunStatus; txHash: Hex | null; detail: string | null; lines: string[] };

const HASH = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/;
const SENT = /Write report transaction succeeded/;
const CLI_FAILED = /^\s*✗/;
const CREDENTIALS = /credential validation failed/i;
const RULES: Array<[RegExp, RunStatus]> = [
  [/REPORT applied/, "applied"],
  [/REPORT sent/, "sent"],
  [/NOT APPLIED/, "not-applied"],
  [/REJECTED by RiskDesk/, "rejected"],
  [/clim: no report/, "no-report"],
  [/DRY RUN/, "dry-run"],
];

export function outcomeOf(line: string): { status: RunStatus; txHash: Hex | null; detail: string } | null {
  for (const [re, status] of RULES) {
    if (re.test(line)) {
      const m = HASH.exec(line);
      return { status, txHash: m ? (m[0].toLowerCase() as Hex) : null, detail: line.trim() };
    }
  }
  return null;
}

/**
 * The receipt is the ground truth for a run with a tx: the forwarder's ReportProcessed.result true AND a RiskReported
 * from the desk in that tx mean the report was applied, whatever the workflow printed (its read-back of
 * RiskDesk.state() at `latest` can hit a lagging RPC node and print NOT APPLIED; its final line can be lost).
 * Any other receipt keeps the workflow's status: never `applied` without both facts.
 */
export function receiptStatus(parsed: RunStatus, forwarderResult: boolean | null, deskReported: boolean): RunStatus {
  return forwarderResult === true && deskReported ? "applied" : parsed;
}

/** Turns the loop's output stream into one RunResult per run. */
export class RunTracker {
  private startedAt: string | null = null;
  private open = false;
  private firstError: string | null = null;
  private sent: { txHash: Hex; line: string } | null = null;
  private lines: string[] = [];

  /** Feed one line; returns a finished run when this line completes one. */
  push(line: string): RunResult | null {
    const start = /^=== (\S+)/.exec(line);
    if (start) {
      const previous = this.flush();
      this.startedAt = start[1] ?? null;
      this.open = true;
      this.firstError = null;
      this.sent = null;
      this.lines = [line];
      return previous;
    }
    if (!this.open) return null;
    this.lines.push(line);
    const o = outcomeOf(line);
    if (o) {
      this.open = false;
      return { startedAt: this.startedAt, ...o, lines: this.lines };
    }
    const m = SENT.test(line) ? HASH.exec(line) : null;
    if (this.sent === null && m) this.sent = { txHash: m[0].toLowerCase() as Hex, line: line.trim() };
    if (this.firstError === null && (/error/i.test(line) || CLI_FAILED.test(line))) this.firstError = line.trim();
    return null;
  }

  /**
   * Closes the current run (no outcome line seen): an error if an error or CLI failure line was seen, else no-outcome.
   * It keeps the tx of the CRE template line, if any, for the receipt check.
   */
  flush(): RunResult | null {
    if (!this.open) return null;
    this.open = false;
    const detail = this.lines.some((l) => CREDENTIALS.test(l))
      ? "CRE CLI credential validation failed"
      : (this.firstError ?? this.sent?.line ?? (this.lines.length === 1 ? "no output" : null));
    return { startedAt: this.startedAt, status: this.firstError ? "error" : "no-outcome", txHash: this.sent?.txHash ?? null, detail, lines: this.lines };
  }
}

/** Plan 02's loop (build the WASM once, then `simulate --wasm` every 30 s), run from cre/. */
export function loopCommand(target: string): string[] {
  return ["bash", "scripts/sim-loop.sh", target, "--broadcast"];
}
