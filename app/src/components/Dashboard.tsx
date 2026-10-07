"use client";

import { useState } from "react";
import { type ClimData, POLL_MS, useClimData } from "@/hooks/useClimData";
import { deployments, EXPLORER, params } from "@/lib/config";
import type { Pair } from "@/lib/deployments";
import { finishedRun } from "@/lib/finished";
import { silentNote } from "@/lib/guide";
import type { LabPTradeBand } from "@/lib/lab";
import { utcTime } from "@/lib/theme";
import { pipsToBp, shortHash } from "@/lib/units";
import { DeskPanel } from "./DeskPanel";
import { StartHere } from "./guide/StartHere";
import { PnlPanel } from "./PnlPanel";
import { PoolsKey } from "./PoolsKey";
import { RecentSwapsPanel } from "./RecentSwapsPanel";
import { QuotePanel } from "./QuotePanel";
import { SafetyPanel } from "./SafetyPanel";
import { ValidationPanel } from "./ValidationPanel";
import { VolQuadPanel } from "./VolQuadPanel";
import { type HeadingLevel, Toggle } from "./ui";
import { WeatherChart } from "./WeatherChart";

/**
 * The desk, the hook and both pools of one pair, read from chain logs. `keyShownAbove`: the page already
 * shows the pools key for that pair (as /replay does), so the dashboard leaves its own out while on it.
 * `guide`: /app's "Start here" card goes first, above the loading branch, so its anchors render on the
 * server; it reads this dashboard's data, never a second copy. `lockPair`: the page's heading names the
 * pair (/replay's section 2), so there is no Live/Replay toggle to show the other one under it.
 * `panelLevel`: the cards' heading level, 3 or 4 when the page groups them under its own h2 or h3.
 */
export function Dashboard({
  band,
  initialPair = "live",
  keyShownAbove,
  guide,
  lockPair,
  panelLevel,
}: {
  band: LabPTradeBand;
  initialPair?: Pair;
  keyShownAbove?: Pair;
  guide?: boolean;
  lockPair?: boolean;
  panelLevel?: HeadingLevel;
}) {
  const pairs: Pair[] = lockPair ? [initialPair] : deployments.pairs.replay ? ["live", "replay"] : ["live"];
  const [pair, setPair] = useState<Pair>(initialPair);
  const data = useClimData(pair);
  // The replay pair ran once and stopped: its history ends with its last report and swaps, not "now".
  const run = data.pair === deployments.pairs.replay && pair === "replay" ? finishedRun(data.reports, data.swaps, data.nowSec) : undefined;
  const history: ClimData = run
    ? { ...data, nowSec: run.endSec, state: data.state ? { ...data.state, latestBlock: { number: run.endBlock, timestamp: run.endSec } } : undefined }
    : data;
  const staticFeePips = (data.pair ?? deployments.pairs[pair])?.S.key.fee;
  // on /app, StartHere shows the silent-desk note instead
  const silent = !guide && !run && pair === "live" ? silentNote(data.reports, data.nowSec, params) : undefined;

  return (
    <div className="space-y-4">
      {guide ? <StartHere data={data} pair={pair} /> : null}
      <div id="dashboard" className="flex flex-wrap items-center gap-3">
        {pairs.length > 1 ? (
          <Toggle<Pair> value={pair} options={pairs.map((p) => ({ value: p, label: p === "live" ? "Live pair" : "Replay pair (4 Feb 2026, finished)" }))} onChange={setPair} />
        ) : null}
        {data.pair ? (
          <span className="text-xs text-fg-muted">
            {run ? "Finished replay on Sepolia" : "Live from Sepolia"}: RiskDesk{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.riskDesk}`} target="_blank" rel="noreferrer">{shortHash(data.pair.riskDesk)}</a>
            , hook{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.hook}`} target="_blank" rel="noreferrer">{shortHash(data.pair.hook)}</a>
            {data.usedSnapshot ? ", older history from a saved copy of the chain logs, new blocks read live" : ""}
          </span>
        ) : null}
        {data.status === "ready" && data.error ? (
          <span className="text-xs text-danger" title={data.error}>
            Sepolia read failed. Showing the last data read; retrying every {POLL_MS / 1000} s.
          </span>
        ) : null}
      </div>
      {pair === keyShownAbove || staticFeePips === undefined ? null : <PoolsKey variant={pair} staticFeePips={staticFeePips} />}
      {silent ? (
        <p role="note" className="max-w-4xl rounded-md bg-notice-bg px-4 py-3 text-sm leading-relaxed text-notice-fg">
          {silent}
        </p>
      ) : null}
      {run ? (
        <p className="max-w-4xl rounded-md bg-surface-2 px-4 py-3 text-sm leading-relaxed">
          This replay is over. Its desk published reports #{run.firstSeq} to #{run.lastSeq} on Sepolia from {utcTime(run.startSec)} to{" "}
          {utcTime(run.lastReportSec)} UTC on {new Date(run.startSec * 1000).toISOString().slice(0, 10)}, one every 30 s, replaying 12:00 to 16:00 UTC of
          4 February 2026; its last swap landed at {utcTime(run.endSec)} UTC. The charts and tables below are that on-chain history. Since then the desk
          has been silent, so its hook quotes the {pipsToBp(params.feeSafePips)} bp safe fee (blind mode): the desk and quote panels show it as read now.
        </p>
      ) : null}
      {data.status === "loading" ? (
        <LoadingGrid visible={!guide} />
      ) : data.status === "error" ? (
        <p className="text-sm text-danger">{`Could not reach Sepolia through the public RPCs. Retrying every ${POLL_MS / 1000} s.`}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DeskPanel data={data} level={panelLevel} />
          <QuotePanel data={data} level={panelLevel} />
          <WeatherChart key={run ? "run" : pair} data={history} initialWindow="All" level={panelLevel} />
          <ValidationPanel data={history} band={band} level={panelLevel} />
          <PnlPanel data={history} level={panelLevel} />
          <VolQuadPanel data={history} band={band} finished={run !== undefined} level={panelLevel} />
          <SafetyPanel data={data} level={panelLevel} />
          <RecentSwapsPanel data={history} level={panelLevel} />
        </div>
      )}
    </div>
  );
}

/**
 * While the first chain read runs: the ready grid's shape in flat blocks (two half-width cards, the three
 * full-width charts and tables, two half-width cards), so the page below does not jump when data lands.
 * `visible`: say so on screen too (on /app, StartHere's Verify card already does, so it stays sr-only).
 */
function LoadingGrid({ visible }: { visible?: boolean }) {
  const block = "rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none";
  return (
    <div>
      {visible ? (
        <p role="status" aria-live="polite" className="mb-3 text-sm text-fg-subtle">
          {`Reading the desk's reports and the pools' swaps from Sepolia. The first load takes a few seconds.`}
        </p>
      ) : (
        <p className="sr-only" role="status" aria-live="polite">Loading desk reports and swaps…</p>
      )}
      <div aria-hidden className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${block} h-[380px]`} />
        <div className={`${block} h-[380px]`} />
        <div className={`${block} h-[420px] lg:col-span-2`} />
        <div className={`${block} h-[360px] lg:col-span-2`} />
        <div className={`${block} h-[300px] lg:col-span-2`} />
        <div className={`${block} h-[400px]`} />
        <div className={`${block} h-[400px]`} />
      </div>
    </div>
  );
}
