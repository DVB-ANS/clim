import type { LabReplay, LabSummary } from "@/lib/lab";
import { signed } from "@/lib/ledger";
import { replayWindowNote } from "@/lib/labText";
import { ReplayCharts } from "./ReplayCharts";
import { FixtureNote, Panel, Stat } from "./ui";

const sgn = (x: number) => `${signed(x, 1)}%`; // a true minus sign, as in the P&L ledger
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "12:00 to 16:00 UTC on 4 February 2026" from two ISO stamps (deterministic: no locale data). */
function windowText(startUtc: string, endUtc: string): string {
  const a = new Date(startUtc);
  const b = new Date(endUtc);
  const hm = (d: Date) => d.toISOString().slice(11, 16);
  const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${startUtc} to ${endUtc}`;
  return day(a) === day(b) ? `${hm(a)} to ${hm(b)} UTC on ${day(a)}` : `${hm(a)} UTC on ${day(a)} to ${hm(b)} UTC on ${day(b)}`;
}

/** The lab's Feb 4 2026 replay: the storm, V's fee leaving S's, and the cumulative arbitrage losses. */
export function ReplayPanel({ replay, summary }: { replay: LabReplay; summary: LabSummary }) {
  const r = summary.replay;
  return (
    <Panel title={`Replay: ${r.window}`} subtitle={`${windowText(replay.window.startUtc, replay.window.endUtc)}, P* = ${(summary.setting.pStar * 100).toFixed(0)}%, pool S fixed at ${r.feeSBp.toFixed(2)} bp, V's average over the window.`}>
      <FixtureNote show={replay.fixture || summary.fixture}>Synthetic fixture: the lab has not written lab/out/replay-2026-02-04.json and lab/out/summary.json yet.</FixtureNote>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lost to arbitrage, V against S" value={sgn(r.arbChangePct)} hint={`rolling 4 h windows: ${sgn(r.arbChangeRangePct[0])} to ${sgn(r.arbChangeRangePct[1])}`} />
        <Stat label="σ" value={`${r.sigmaMinPct.toFixed(0)}% to ${r.sigmaMaxPct.toFixed(0)}%`} />
        <Stat label="Fee on V" value={`${r.feeVMinBp.toFixed(1)} to ${r.feeVMaxBp.toFixed(1)} bp`} hint={`pool S: ${r.feeSBp.toFixed(2)} bp`} />
        <Stat label="Blocks arbitraged on V" value={`${pct(r.pTradePredicted)} / ${pct(r.pTradeObserved)}`} hint="predicted / observed" />
      </div>
      {replayWindowNote(r) ? <p className="mb-3 text-xs text-fg-muted">{replayWindowNote(r)}</p> : null}
      <ReplayCharts replay={replay} />
      <p className="mt-2 text-xs text-fg-subtle">Raw data: <a className="underline" href="/data/lab/replay-2026-02-04.json">/data/lab/replay-2026-02-04.json</a></p>
    </Panel>
  );
}
