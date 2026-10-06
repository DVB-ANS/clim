import { describe, expect, test } from "bun:test";
import { loopCommand, outcomeOf, receiptStatus, RunTracker, type RunResult } from "../src/lib/simParse";

const TX = "0x1013abc0b6f345fad15b19a56cabbbaab2a2aa94f81eb3a709058adf18a4f23f";

// Lines as printed by plan 02's cre/scripts/sim-loop.sh: "=== <UTC time>" before each run, then the workflow's
// [USER LOG] lines, any line containing "rror" and the CLI's failure lines marked "✗" (the script greps "USER LOG|rror|✗").
const APPLIED = `2026-10-07T03:00:09Z [USER LOG] REPORT applied seq=12 sigmaReported=33.4% sigmaApplied=33.4% flags=0 tx=${TX}`;

describe("outcomeOf: one workflow log line -> run outcome", () => {
  test("report outcomes carry the tx hash", () => {
    expect(outcomeOf(APPLIED)).toEqual({ status: "applied", txHash: TX, detail: APPLIED.trim() });
    expect(outcomeOf(`[USER LOG] REPORT sent, desk state unreadable after tx=${TX}`)?.status).toBe("sent");
    expect(outcomeOf(`[USER LOG] NOT APPLIED: RiskDesk state unchanged at the latest block after tx=${TX} (rejected inside the forwarder)`)?.status).toBe("not-applied");
    expect(outcomeOf(`[USER LOG] REJECTED by RiskDesk (onReport reverted) tx=${TX}`)).toMatchObject({ status: "rejected", txHash: TX });
  });
  test("the CRE template line printed before the final line is not an outcome", () => {
    expect(outcomeOf(`[USER LOG] Write report transaction succeeded: ${TX}`)).toBeNull();
  });
  test("skips and dry runs have no tx", () => {
    expect(outcomeOf("[USER LOG] clim: no report (quorum 2/4 < 3)")).toMatchObject({ status: "no-report", txHash: null });
    expect(outcomeOf("[USER LOG] DRY RUN: report encoded and simulated, not broadcast (sigmaE9=59492)")).toMatchObject({ status: "dry-run", txHash: null });
  });
  test("other lines are not outcomes", () => {
    expect(outcomeOf("[USER LOG] consensus: sigma=33.4%/yr sigmaE9=59492 n=4 disp=2bp")).toBeNull();
    expect(outcomeOf("[USER LOG] desk before: seq=11 tObs=1791342000 sigma=33.1%/yr flags=0")).toBeNull();
  });
});

describe("RunTracker: stream of loop lines -> one result per run", () => {
  function feed(lines: string[]): RunResult[] {
    const t = new RunTracker();
    const out: RunResult[] = [];
    for (const l of lines) {
      const r = t.push(l);
      if (r) out.push(r);
    }
    const last = t.flush();
    if (last) out.push(last);
    return out;
  }
  test("ignores the build output before the first run", () => {
    expect(feed(["Workflow compiled", "target=staging-settings broadcast=--broadcast interval=30s log=logs/x.log"])).toEqual([]);
  });
  test("one outcome per run, stamped with the run start", () => {
    const r = feed(["=== 2026-10-07T03:00:00Z", "[USER LOG] consensus: ...", APPLIED, "=== 2026-10-07T03:00:30Z", "[USER LOG] clim: no report (10 s since the last report < 20 s)"]);
    expect(r.map((x) => [x.startedAt, x.status, x.txHash])).toEqual([
      ["2026-10-07T03:00:00Z", "applied", TX],
      ["2026-10-07T03:00:30Z", "no-report", null],
    ]);
    expect(r[0]?.lines).toEqual(["=== 2026-10-07T03:00:00Z", "[USER LOG] consensus: ...", APPLIED]);
  });
  test("plan 02's order: the run ends on REPORT applied, after the CRE template line", () => {
    const r = feed(["=== 2026-10-07T03:00:00Z", `[USER LOG] Write report transaction succeeded: ${TX}`, APPLIED]);
    expect(r.map((x) => [x.status, x.txHash, x.lines.length])).toEqual([["applied", TX, 3]]);
  });
  test("a run with only errors is an error, a silent run is no-outcome", () => {
    const r = feed(["=== 2026-10-07T03:00:00Z", "Error: writeReport failed: status=1", "=== 2026-10-07T03:00:30Z", "=== 2026-10-07T03:01:00Z", APPLIED]);
    expect(r.map((x) => x.status)).toEqual(["error", "no-outcome", "applied"]);
    expect(r[0]?.detail).toBe("Error: writeReport failed: status=1");
  });
  test("a run that lost its final line keeps the tx of the CRE template line, for the receipt check", () => {
    const sent = `2026-10-06T17:18:03Z [USER LOG] Write report transaction succeeded: ${TX}`;
    const r = feed(["=== 2026-10-06T17:17:44Z", "[USER LOG] desk before: seq=66 tObs=1791307040 sigma=23.9%/yr flags=0", sent, "=== 2026-10-06T17:18:14Z", APPLIED]);
    expect(r.map((x) => [x.status, x.txHash, x.detail])).toEqual([
      ["no-outcome", TX, sent],
      ["applied", TX, APPLIED],
    ]);
  });
  test("a CRE CLI credential failure is an error that says so", () => {
    const r = feed([
      "=== 2026-10-06T17:03:12Z",
      "✗ Credential validation failed",
      "✗ authentication required: credential validation failed: authentication failed: unable to retrieve organization info. Your account may not be fully set up yet — please try again in a few minutes",
    ]);
    expect(r.map((x) => [x.status, x.txHash, x.detail])).toEqual([["error", null, "CRE CLI credential validation failed"]]);
  });
  test("any other CRE CLI failure line (marked ✗) is an error", () => {
    const failed = '✗ workflow execution failed: [2]Unknown: Post "https://ethereum-sepolia-rpc.publicnode.com": read tcp: can\'t assign requested address';
    const r = feed(["=== 2026-10-06T18:23:08Z", "[USER LOG] desk before: seq=159 tObs=1791310961 sigma=73.0%/yr flags=2", failed]);
    expect(r.map((x) => [x.status, x.detail])).toEqual([["error", failed]]);
  });
  test("a run that printed nothing says so", () => {
    expect(feed(["=== 2026-10-06T17:03:12Z"]).map((x) => [x.status, x.txHash, x.detail])).toEqual([["no-outcome", null, "no output"]]);
  });
});

describe("receiptStatus: the receipt is the ground truth for a run with a tx", () => {
  test("forwarder result true and a desk RiskReported mean applied, whatever the workflow printed", () => {
    expect(receiptStatus("not-applied", true, true)).toBe("applied");
    expect(receiptStatus("no-outcome", true, true)).toBe("applied");
    expect(receiptStatus("sent", true, true)).toBe("applied");
    expect(receiptStatus("applied", true, true)).toBe("applied");
  });
  test("never applied without both receipt facts", () => {
    expect(receiptStatus("not-applied", false, false)).toBe("not-applied");
    expect(receiptStatus("not-applied", true, false)).toBe("not-applied");
    expect(receiptStatus("no-outcome", null, true)).toBe("no-outcome");
    expect(receiptStatus("rejected", false, false)).toBe("rejected");
  });
});

describe("loop command", () => {
  test("delegates the loop to plan 02's script, always broadcasting", () => {
    expect(loopCommand("staging-settings")).toEqual(["bash", "scripts/sim-loop.sh", "staging-settings", "--broadcast"]);
  });
});
