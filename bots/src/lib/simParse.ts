// Pure helpers for sim-loop.ts, which runs plan 02's cre/scripts/sim-loop.sh and records every run.
// That script prints "=== <UTC time>" before each `cre workflow simulate` run and echoes the workflow's
// [USER LOG] lines plus any line containing "rror". The workflow (plan 02, workflow.ts) ends each run with one of:
//   REPORT applied ... tx=0x..    REPORT sent, desk state unreadable after tx=0x..    NOT APPLIED: ... tx=0x..
//   REJECTED by RiskDesk (onReport reverted) tx=0x..    clim: no report (<reason>)    DRY RUN: ...
// "Write report transaction succeeded: 0x.." (the CRE template wording) comes BEFORE the final line, so it is not
// an outcome: the run stays open and its transcript keeps both lines.
import type { Hex } from "viem";

export type RunStatus = "applied" | "sent" | "not-applied" | "rejected" | "no-report" | "dry-run" | "error" | "no-outcome";
/** One run of the loop; `lines` is its transcript (from its "===" line), kept for the evidence files of plan 06. */
export type RunResult = { startedAt: string | null; status: RunStatus; txHash: Hex | null; detail: string | null; lines: string[] };

const HASH = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/;
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

/** Turns the loop's output stream into one RunResult per run. */
export class RunTracker {
  private startedAt: string | null = null;
  private open = false;
  private firstError: string | null = null;
  private lines: string[] = [];

  /** Feed one line; returns a finished run when this line completes one. */
  push(line: string): RunResult | null {
    const start = /^=== (\S+)/.exec(line);
    if (start) {
      const previous = this.flush();
      this.startedAt = start[1] ?? null;
      this.open = true;
      this.firstError = null;
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
    if (this.firstError === null && /error/i.test(line)) this.firstError = line.trim();
    return null;
  }

  /** Closes the current run (no outcome line seen): an error if an error line was seen, else no-outcome. */
  flush(): RunResult | null {
    if (!this.open) return null;
    this.open = false;
    return { startedAt: this.startedAt, status: this.firstError ? "error" : "no-outcome", txHash: null, detail: this.firstError, lines: this.lines };
  }
}

/** Plan 02's loop (build the WASM once, then `simulate --wasm` every 30 s), run from cre/. */
export function loopCommand(target: string): string[] {
  return ["bash", "scripts/sim-loop.sh", target, "--broadcast"];
}
