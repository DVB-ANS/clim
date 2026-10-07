// The guided first visit on /app ("Start here"): the constants a visitor needs to try clim with a wallet,
// and the "Verify it on chain" rows, each built from chain logs and contract reads with the Etherscan
// link that proves it. Pure: no React and no fetching, so the copy is tested (guide.test.ts).
import type { Hex } from "viem";
import { etherscanCode, etherscanRead, etherscanTxLogs, sourcifyAddress } from "./contracts";
import type { Delivery, DeskReport, SwapRow } from "./decode";
import type { PairDeployment } from "./deployments";
import { FeeMode, type FeeParams, type Quote, quoteFee } from "./feeMath";
import { FINISHED_AFTER_SEC } from "./finished";
import { utcStamp } from "./ledger";
import { CRE_EVIDENCE_URL, CRE_WORKFLOW_URL } from "./links";
import { deskStateOf, DISP_MAX_BP } from "./series";
import { formatAge, formatBp, pipsToBp, sigmaE9ToAnnualPct } from "./units";

// Faucet amounts: contracts/script/00_Tokens.s.sol:23-24 (TestToken faucetAmount); cooldown: contracts/src/test-tokens/TestToken.sol:11.
export const FAUCET = { tETH: 10, tUSD: 25_000, cooldownSec: 3_600 } as const;
// Gas used by run 1 of app/scripts/e2e-onchain.ts (receipts in docs/sessions/2026-10-07.md):
// faucet tETH 250,187 + faucet tUSD 250,187 + approve 128,310 + swap V 169,252 + approve 128,310 + swap S 156,660.
export const TEST_RUN_GAS = 1_082_906;
export const TEST_RUN_MAX_GWEI = 0.772; // the highest effective gas price among those receipts
// Public Sepolia faucets that answered on 2026-10-07. Not the Infura or MetaMask faucets: they redirect elsewhere.
export const GAS_FAUCETS = [
  { name: "QuickNode", href: "https://faucet.quicknode.com/ethereum/sepolia", note: "no account" },
  { name: "Google Cloud", href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia", note: "Google sign-in" },
  { name: "PoW faucet", href: "https://sepolia-faucet.pk910.de/", note: "mine in your browser" },
] as const;
/** The one sentence that says how the desk runs today. DeskPanel's RUNS_TODAY starts with it. */
export const CRE_RUNS_TODAY =
  "It runs in CRE's simulator on one node: our operator key sends each report through MockKeystoneForwarder, which checks no signature.";

export type GuideInput = {
  pair?: PairDeployment;
  reports: DeskReport[];
  swaps: SwapRow[];
  deliveries: Delivery[];
  state?: { quote: Quote };
  nowSec: number;
}; // ClimData is assignable to it
export type GuideLink = { label: string; href: string }; // external when href starts with "http"
export type VerifyRow = {
  id: "report" | "quote" | "swaps" | "storm" | "refused" | "source" | "workflow";
  title: string;
  detail: string;
  links: GuideLink[];
  mode?: FeeMode;
};
export type StormProof = { report: DeskReport; quote: Quote; swap?: SwapRow };

type ChainPos = { blockNumber: number; logIndex: number };

/** (blockNumber, logIndex) order: true when a comes after b. */
export function after(a: ChainPos, b: ChainPos): boolean {
  return a.blockNumber > b.blockNumber || (a.blockNumber === b.blockNumber && a.logIndex > b.logIndex);
}

/** The latest swap on poolId in chain order, or undefined. */
export function lastSwapOn(swaps: SwapRow[], poolId: Hex): SwapRow | undefined {
  let last: SwapRow | undefined;
  for (const s of swaps) if (s.poolId === poolId && (!last || after(s, last))) last = s;
  return last;
}

/**
 * The storm, on chain. Take the report with the highest sigmaApplied among those with dispBp <= DISP_MAX_BP.
 * Compute its quote: quoteFee(deskStateOf(r), r.blockTimestamp, params). Return undefined unless that quote is
 * Normal and above feeMinPips. Then take the first swap on V strictly after the report and strictly before the
 * next report, both in (blockNumber, logIndex) order.
 */
export function stormProof(reports: DeskReport[], swaps: SwapRow[], poolIdV: Hex, params: FeeParams): StormProof | undefined {
  let report: DeskReport | undefined;
  for (const r of reports) if (r.dispBp <= DISP_MAX_BP && (!report || r.sigmaApplied > report.sigmaApplied)) report = r;
  if (!report) return undefined;
  const quote = quoteFee(deskStateOf(report), report.blockTimestamp, params);
  if (quote.mode !== FeeMode.Normal || quote.feePips <= params.feeMinPips) return undefined;
  const peak = report;
  let next: DeskReport | undefined;
  for (const r of reports) if (after(r, peak) && (!next || after(next, r))) next = r;
  let swap: SwapRow | undefined;
  for (const s of swaps) {
    if (s.poolId !== poolIdV || !after(s, peak) || (next && !after(next, s))) continue;
    if (!swap || after(swap, s)) swap = s;
  }
  return { report: peak, quote, swap };
}

/** The last report's blockTimestamp when nowSec is more than silentSec (default FINISHED_AFTER_SEC) past it; else undefined. */
export function deskSilentSince(reports: DeskReport[], nowSec: number, silentSec = FINISHED_AFTER_SEC): number | undefined {
  const last = reports.at(-1);
  if (!last || nowSec - last.blockTimestamp <= silentSec) return undefined;
  return last.blockTimestamp;
}

/** The silent-desk note, or undefined when the desk is reporting. One wording for StartHere and Dashboard. */
export function silentNote(reports: DeskReport[], nowSec: number, params: FeeParams): string | undefined {
  const t = deskSilentSince(reports, nowSec);
  if (t === undefined) return undefined;
  return `The live desk has not reported since ${utcStamp(t)}. Its CRE workflow runs in the simulator on our machine, and so do the bots, so both stop when that machine does. By design, the hook now quotes at least the ${pipsToBp(params.feeSafePips)} bp safe fee (blind mode). The history, the 4 February replay and every explorer link below still work.`;
}

/** The landing hero's line while the desk is silent: since when, and the last report's number. */
export function silentLabel(silentSince: number, lastSeq: number): string {
  return `Desk silent since ${utcStamp(silentSince)} · last report #${lastSeq}`;
}

/** True when the hook quotes the floor in Normal mode. */
export function calmNow(quote: Quote | undefined, params: FeeParams): boolean {
  return quote !== undefined && quote.mode === FeeMode.Normal && quote.feePips <= params.feeMinPips;
}

const bp = (pips: number) => formatBp(pipsToBp(pips), 2);
const sigmaText = (r: DeskReport) => `${sigmaE9ToAnnualPct(r.sigmaApplied).toFixed(1)}%/yr`;
/** A pool id as Etherscan's log view starts it: "0x49cad216…". */
const idStart = (id: Hex) => `${id.slice(0, 10)}…`;

/** The Verify card's rows, in display order. [] without a pair. */
export function verifyRows(d: GuideInput, params: FeeParams, proof?: StormProof): VerifyRow[] {
  const pair = d.pair;
  if (!pair) return [];
  const rows: VerifyRow[] = [];
  const ago = (t: number) => formatAge(d.nowSec - t);

  const r = d.reports.at(-1);
  if (r) {
    rows.push({
      id: "report",
      title: `Last report: #${r.seq}, ${ago(r.tObs)} ago, from ${r.nSources} of 4 venues`,
      detail: `${CRE_RUNS_TODAY} On Etherscan, the transaction goes from our operator key to MockKeystoneForwarder. Its event log shows RiskDesk's RiskReported (seq ${r.seq}, nSources ${r.nSources}, sigmaApplied ${r.sigmaApplied}), then the forwarder's ReportProcessed with result true. sigmaApplied is σ per √second × 10⁹: divide it by 10⁹ and multiply by √31,536,000 (the seconds in a year) to get ${sigmaText(r)}.`,
      links: [
        { label: "Report transaction on Etherscan", href: etherscanTxLogs(r.txHash) },
        { label: "Desk panel", href: "#desk" },
      ],
    });
  }

  const q = d.state?.quote;
  if (q) {
    rows.push({
      id: "quote",
      title: `The hook quotes ${bp(q.feePips)} on pool V now${calmNow(q, params) ? ", its calm-weather floor" : ""}`,
      detail: `On Etherscan, ClimHook's Read Contract tab runs quoteFee with no wallet: it returns fee ${q.feePips} (in pips: 100 pips = 1 bp) and mode ${q.mode} (0 normal, 1 degraded, 2 blind). It can change with each report. RiskDesk's state() returns sigmaE9, the σ the hook reads now, in the same units as a report's sigmaApplied.`,
      links: [
        { label: "ClimHook, Read Contract", href: etherscanRead(pair.hook) },
        { label: "RiskDesk state(), Read Contract", href: etherscanRead(pair.riskDesk) },
      ],
      mode: q.mode,
    });
  }

  const v = lastSwapOn(d.swaps, pair.V.poolId);
  const s = lastSwapOn(d.swaps, pair.S.poolId);
  const one = v ? { name: "V", swap: v } : s ? { name: "S", swap: s } : undefined;
  if (one) {
    const title =
      v && s
        ? `Last swaps: pool V paid ${bp(v.fee)} ${ago(v.blockTimestamp)} ago, pool S paid ${bp(s.fee)} ${ago(s.blockTimestamp)} ago`
        : `Last swap on pool ${one.name}: paid ${bp(one.swap.fee)} ${ago(one.swap.blockTimestamp)} ago`;
    rows.push({
      id: "swaps",
      title,
      detail: `In a swap's event log, the Swap event's id is the pool (V: ${idStart(pair.V.poolId)}, S: ${idStart(pair.S.poolId)}), and its fee field is the fee paid, in pips. Our bots make most swaps: a retail bot sends every order to both pools, and an arbitrage bot trades both.`,
      links: [
        ...(v ? [{ label: "Pool V swap on Etherscan", href: etherscanTxLogs(v.txHash) }] : []),
        ...(s ? [{ label: "Pool S swap on Etherscan", href: etherscanTxLogs(s.txHash) }] : []),
        { label: "Recent swaps", href: "#recent-swaps" },
      ],
    });
  }

  if (proof) {
    const peak = `When σ peaked at ${sigmaText(proof.report)} (report #${proof.report.seq})`;
    const landed = utcStamp(proof.report.blockTimestamp);
    rows.push(
      proof.swap
        ? {
            id: "storm",
            title: `${peak}, the next swap on pool V paid ${bp(proof.swap.fee)}`,
            detail: `Read from that swap's Swap event; pool S stayed at its fixed ${bp(pair.S.key.fee)}. The report landed at ${landed}.`,
            links: [
              { label: "Report on Etherscan", href: etherscanTxLogs(proof.report.txHash) },
              { label: "Swap on Etherscan", href: etherscanTxLogs(proof.swap.txHash) },
              { label: "Weather chart", href: "#weather" },
            ],
          }
        : {
            id: "storm",
            title: `${peak}, the fee formula gives ${bp(proof.quote.feePips)} for pool V`,
            detail: `The peak report landed at ${landed}. No swap on pool V came before the next report.`,
            links: [
              { label: "Report on Etherscan", href: etherscanTxLogs(proof.report.txHash) },
              { label: "Weather chart", href: "#weather" },
            ],
          },
    );
  }

  const refused = d.deliveries.filter((x) => !x.accepted);
  const latest = refused.reduce<Delivery | undefined>((a, x) => (!a || after(x, a) ? x : a), undefined);
  if (latest) {
    rows.push({
      id: "refused",
      title: `Forged or invalid reports refused: ${refused.length}`,
      detail:
        "In simulation the desk takes reports only from transactions our operator key sends. A refused report's transaction still succeeds, but its event log shows ReportProcessed with result false and no RiskReported.",
      links: [
        { label: "Latest refusal on Etherscan", href: etherscanTxLogs(latest.txHash) },
        { label: "Safety panel", href: "#safety" },
      ],
    });
  }

  rows.push(
    {
      id: "source",
      title: "The source code is verified on Etherscan and Sourcify",
      detail: "Etherscan's Contract tab shows the code of RiskDesk, ClimHook, the test tokens and the arbitrage router.",
      links: [
        { label: "RiskDesk code", href: etherscanCode(pair.riskDesk) },
        { label: "ClimHook code", href: etherscanCode(pair.hook) },
        { label: "ClimHook on Sourcify", href: sourcifyAddress(pair.hook) },
        { label: "Every contract", href: "#contracts" },
      ],
    },
    {
      id: "workflow",
      title: "The CRE workflow's code is on GitHub",
      detail:
        "It reads the four venues, computes ETH's 15-minute volatility and builds each report (workflow.ts, with venues.ts and estimator.ts). The evidence folder lists every report the workflow wrote on Sepolia until it was collected on 7 October, each with its transaction.",
      links: [
        { label: "cre/risk-desk/workflow.ts", href: CRE_WORKFLOW_URL },
        { label: "CRE evidence: the reports and their transactions", href: CRE_EVIDENCE_URL },
      ],
    },
  );
  return rows;
}
