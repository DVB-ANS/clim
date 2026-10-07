import { type Hex, numberToHex } from "viem";
import { describe, expect, it } from "vitest";
import { etherscanRead, etherscanTxLogs } from "./contracts";
import { decodeDeliveries, decodeReports, decodeSwaps, type DeskReport, type SwapRow } from "./decode";
import { FeeMode, type FeeParams } from "./feeMath";
import {
  after,
  calmNow,
  deskSilentSince,
  type GuideInput,
  lastSwapOn,
  silentLabel,
  silentNote,
  stormProof,
  TEST_RUN_GAS,
  TEST_RUN_MAX_GWEI,
  verifyRows,
} from "./guide";
import { utcStamp } from "./ledger";
import { CRE_EVIDENCE_URL, CRE_WORKFLOW_URL } from "./links";
import { annualPctToSigmaE9, formatBp, pipsToBp, sigmaE9ToAnnualPct } from "./units";
import { makeMockWorld } from "@/test/world";

const params: FeeParams = { etaE4: 25_093, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000, feeSafePips: 3_000, tauKillSec: 180 };
const NOW = 1_791_300_000;
const V = "0x00000000000000000000000000000000000000000000000000000000000000a1" as Hex;
const S = "0x00000000000000000000000000000000000000000000000000000000000000b2" as Hex;
const T0 = 1_791_000_000;
const tsOf = (block: number) => T0 + (block - 100) * 12;
const hash = (block: number, logIndex: number) => numberToHex(block * 1_000 + logIndex, { size: 32 });

/** A RiskReported row at `block`, observed 20 s before it landed. */
function report(o: { seq: number; block: number; logIndex?: number; sigmaPct: number; dispBp?: number }): DeskReport {
  const t = tsOf(o.block);
  const sigma = annualPctToSigmaE9(o.sigmaPct);
  return {
    seq: o.seq, tObs: t - 20, sigmaApplied: sigma, sigmaReported: sigma, rv15E9: sigma, dvolE2: 0, refTick: 0,
    dispBp: o.dispBp ?? 3, nSources: 4, kE4: 10_000, zone: 0,
    blockNumber: o.block, blockTimestamp: t, txHash: hash(o.block, o.logIndex ?? 0), logIndex: o.logIndex ?? 0, latencySec: 20,
  };
}

const swap = (o: { pool: Hex; block: number; logIndex: number; fee: number }) =>
  ({ poolId: o.pool, blockNumber: o.block, blockTimestamp: tsOf(o.block), logIndex: o.logIndex, txHash: hash(o.block, o.logIndex), fee: o.fee }) as SwapRow;

describe("chain order", () => {
  it("puts a later block after, and a higher log index after within a block", () => {
    expect(after({ blockNumber: 11, logIndex: 0 }, { blockNumber: 10, logIndex: 9 })).toBe(true);
    expect(after({ blockNumber: 10, logIndex: 4 }, { blockNumber: 10, logIndex: 3 })).toBe(true);
    expect(after({ blockNumber: 10, logIndex: 3 }, { blockNumber: 10, logIndex: 4 })).toBe(false);
    expect(after({ blockNumber: 10, logIndex: 3 }, { blockNumber: 10, logIndex: 3 })).toBe(false);
  });

  it("finds the latest swap of a pool, whatever the array order", () => {
    const a = swap({ pool: V, block: 10, logIndex: 1, fee: 500 });
    const b = swap({ pool: V, block: 11, logIndex: 0, fee: 600 });
    const c = swap({ pool: V, block: 11, logIndex: 2, fee: 700 });
    const s = swap({ pool: S, block: 12, logIndex: 0, fee: 511 });
    expect(lastSwapOn([c, a, b, s], V)).toBe(c);
    expect(lastSwapOn([a, b], V)).toBe(b);
    expect(lastSwapOn([a, b, c], S)).toBeUndefined();
  });
});

describe("stormProof", () => {
  it("is undefined when every report's fee sits at the floor", () => {
    const calm = [report({ seq: 1, block: 100, sigmaPct: 20 }), report({ seq: 2, block: 103, sigmaPct: 30 })];
    expect(stormProof(calm, [], V, params)).toBeUndefined();
    expect(stormProof([], [], V, params)).toBeUndefined();
  });

  it("takes the highest σ among the normal reports and skips a higher, degraded one", () => {
    const reports = [
      report({ seq: 1, block: 100, sigmaPct: 40 }),
      report({ seq: 2, block: 103, sigmaPct: 150 }),
      report({ seq: 3, block: 106, sigmaPct: 300, dispBp: 31 }),
      report({ seq: 4, block: 109, sigmaPct: 60 }),
    ];
    const p = stormProof(reports, [], V, params);
    expect(p?.report.seq).toBe(2);
    expect(p?.quote.mode).toBe(FeeMode.Normal);
    expect(p?.quote.feePips).toBeGreaterThan(params.feeMinPips);
    expect(p?.swap).toBeUndefined();
  });

  it("takes the first swap on V after the report and before the next one, in (block, log index) order", () => {
    const reports = [report({ seq: 1, block: 100, logIndex: 5, sigmaPct: 150 }), report({ seq: 2, block: 103, logIndex: 0, sigmaPct: 40 })];
    const before = swap({ pool: V, block: 100, logIndex: 4, fee: 500 });
    const onS = swap({ pool: S, block: 100, logIndex: 6, fee: 511 });
    const sameBlock = swap({ pool: V, block: 100, logIndex: 7, fee: 1_642 });
    const later = swap({ pool: V, block: 101, logIndex: 0, fee: 1_642 });
    expect(stormProof(reports, [later, sameBlock, onS, before], V, params)?.swap).toBe(sameBlock);
    expect(stormProof(reports, [before, onS, later], V, params)?.swap).toBe(later);
    expect(stormProof(reports, [before, onS], V, params)?.swap).toBeUndefined();
  });

  it("finds no swap when the first one on V comes after the next report", () => {
    const reports = [report({ seq: 1, block: 100, sigmaPct: 150 }), report({ seq: 2, block: 103, logIndex: 2, sigmaPct: 40 })];
    const afterNext = swap({ pool: V, block: 103, logIndex: 3, fee: 500 });
    const p = stormProof(reports, [afterNext], V, params);
    expect(p).toBeDefined();
    expect(p?.swap).toBeUndefined();
  });
});

describe("the silent desk", () => {
  const reports = [report({ seq: 1, block: 100, sigmaPct: 40 }), report({ seq: 2, block: 103, sigmaPct: 40 })];
  const last = reports[1];

  it("is silent only more than 900 s after the last report landed", () => {
    expect(deskSilentSince(reports, last.blockTimestamp + 900)).toBeUndefined();
    expect(deskSilentSince(reports, last.blockTimestamp + 901)).toBe(last.blockTimestamp);
    expect(deskSilentSince([], last.blockTimestamp + 5_000)).toBeUndefined();
  });

  it("says since when, and that the hook quotes at least the safe fee", () => {
    const note = silentNote(reports, last.blockTimestamp + 1_000, params);
    expect(note).toContain(utcStamp(last.blockTimestamp));
    expect(note).toContain("at least the 30 bp safe fee");
    expect(silentNote(reports, last.blockTimestamp + 60, params)).toBeUndefined();
  });

  it("gives the landing's hero a silent label, never a live one, once the desk has stopped", () => {
    const since = deskSilentSince(reports, last.blockTimestamp + 3 * 3_600)!;
    const label = silentLabel(since, last.seq);
    expect(label).toBe(`Desk silent since ${utcStamp(last.blockTimestamp)} · last report #2`);
    expect(label).not.toMatch(/live/i);
  });
});

describe("calmNow", () => {
  it("is true only for the floor in normal mode", () => {
    expect(calmNow({ feePips: 500, mode: FeeMode.Normal }, params)).toBe(true);
    expect(calmNow({ feePips: 1_200, mode: FeeMode.Normal }, params)).toBe(false);
    expect(calmNow({ feePips: 3_000, mode: FeeMode.Blind }, params)).toBe(false);
    expect(calmNow(undefined, params)).toBe(false);
  });
});

describe("verifyRows (a deterministic test chain, read as if from Sepolia)", () => {
  const w = makeMockWorld({ nowSec: NOW, params });
  const input: GuideInput = {
    pair: w.pair,
    reports: decodeReports(w.deskLogs),
    swaps: decodeSwaps(w.swapLogs),
    deliveries: decodeDeliveries(w.forwarderLogs),
    state: { quote: w.quote },
    nowSec: NOW,
  };
  const proof = stormProof(input.reports, input.swaps, w.pair.V.poolId, params);
  const rows = verifyRows(input, params, proof);
  const byId = (id: string) => rows.find((r) => r.id === id);
  const last = input.reports.at(-1)!;
  const lastV = lastSwapOn(input.swaps, w.pair.V.poolId)!;
  const lastS = lastSwapOn(input.swaps, w.pair.S.poolId)!;
  const text = (rs: typeof rows) => rs.flatMap((r) => [r.title, r.detail]);

  it("lists the checks in display order", () => {
    expect(rows.map((r) => r.id)).toEqual(["report", "quote", "swaps", "storm", "refused", "source", "workflow"]);
  });

  it("links the last report's event log and names its number", () => {
    const r = byId("report")!;
    expect(r.title).toContain(`#${last.seq}`);
    expect(r.links[0].href).toBe(etherscanTxLogs(last.txHash));
  });

  it("lists the report's events in Etherscan's order and reads sigmaApplied in %/yr", () => {
    const d = byId("report")!.detail;
    expect(d.indexOf("RiskReported")).toBeLessThan(d.indexOf("ReportProcessed"));
    expect(d).toContain(`sigmaApplied ${last.sigmaApplied}`);
    expect(d).toContain(`${sigmaE9ToAnnualPct(last.sigmaApplied).toFixed(1)}%/yr`);
  });

  it("names each pool's id as the Swap event shows it", () => {
    const d = byId("swaps")!.detail;
    expect(d).toContain(`V: ${w.pair.V.poolId.slice(0, 10)}…`);
    expect(d).toContain(`S: ${w.pair.S.poolId.slice(0, 10)}…`);
  });

  it("opens the hook's and the desk's Read Contract tabs, with the hook's mode", () => {
    const q = byId("quote")!;
    expect(q.links.map((l) => l.href)).toEqual([etherscanRead(w.pair.hook), etherscanRead(w.pair.riskDesk)]);
    expect(q.mode).toBe(w.quote.mode);
  });

  it("gives the fee each pool's last swap paid, with its event log", () => {
    const s = byId("swaps")!;
    expect(s.title).toContain(formatBp(pipsToBp(lastV.fee), 2));
    expect(s.title).toContain(formatBp(pipsToBp(lastS.fee), 2));
    expect(s.links.slice(0, 2).map((l) => l.href)).toEqual([etherscanTxLogs(lastV.txHash), etherscanTxLogs(lastS.txHash)]);
  });

  it("says what the next swap paid at the storm's peak", () => {
    expect(proof?.swap).toBeDefined();
    expect(byId("storm")!.title).toContain("paid");
    expect(byId("storm")!.links.map((l) => l.href)).toContain(etherscanTxLogs(proof!.swap!.txHash));
  });

  it("links the workflow's code and the evidence folder, not a run log", () => {
    const wf = byId("workflow")!;
    expect(wf.links.map((l) => l.href)).toEqual([CRE_WORKFLOW_URL, CRE_EVIDENCE_URL]);
    // the workflow itself (main.ts only starts the runner) and docs/evidence, both on main
    expect(CRE_WORKFLOW_URL).toMatch(/\/blob\/main\/cre\/risk-desk\/workflow\.ts$/);
    expect(CRE_EVIDENCE_URL).toMatch(/\/tree\/main\/docs\/evidence$/);
    expect(wf.links.map((l) => l.label).join(" ")).not.toMatch(/run log/i);
  });

  it("dates the peak report itself when no swap on V followed it", () => {
    const peakOnly = stormProof(input.reports, [], w.pair.V.poolId, params)!;
    const row = verifyRows(input, params, peakOnly).find((r) => r.id === "storm")!;
    expect(row.detail).toBe(`The peak report landed at ${utcStamp(peakOnly.report.blockTimestamp)}. No swap on pool V came before the next report.`);
  });

  it("leaves out the refused row when every delivery was accepted, and the storm row when σ stayed low", () => {
    const accepted = verifyRows({ ...input, deliveries: input.deliveries.filter((d) => d.accepted) }, params, proof);
    expect(accepted.map((r) => r.id)).not.toContain("refused");
    const calm = [report({ seq: 1, block: 100, sigmaPct: 20 }), report({ seq: 2, block: 103, sigmaPct: 30 })];
    const calmProof = stormProof(calm, input.swaps, w.pair.V.poolId, params);
    expect(verifyRows({ ...input, reports: calm }, params, calmProof).map((r) => r.id)).not.toContain("storm");
  });

  it("shows nothing to check without a pair", () => {
    expect(verifyRows({ ...input, pair: undefined }, params, proof)).toEqual([]);
  });

  it("never says what it cannot show", () => {
    for (const s of text(rows)) expect(s).not.toMatch(/—|matches|Blockscout|every 30 s/);
  });

  it("still renders, with no cadence claim, while the desk is silent", () => {
    const silent = verifyRows({ ...input, nowSec: last.blockTimestamp + 1_000 }, params, proof);
    expect(silent.length).toBeGreaterThan(0);
    for (const s of text(silent)) expect(s).not.toContain("every 30 s");
  });
});

describe("the guide's constants", () => {
  it("puts a full try at under a thousandth of a Sepolia ETH", () => {
    expect(((TEST_RUN_GAS * TEST_RUN_MAX_GWEI) / 1e9).toFixed(4)).toBe("0.0008");
  });
});
