"use client";

import { useState } from "react";
import { type ClimData, useClimData } from "@/hooks/useClimData";
import { deployments, EXPLORER, params } from "@/lib/config";
import type { Pair } from "@/lib/deployments";
import { finishedRun } from "@/lib/finished";
import type { LabPTradeBand } from "@/lib/lab";
import { MOCK_STATIC_FEE_PIPS } from "@/lib/mock";
import { utcTime } from "@/lib/theme";
import { pipsToBp, shortHash } from "@/lib/units";
import { DeskPanel } from "./DeskPanel";
import { PnlPanel } from "./PnlPanel";
import { PoolsKey } from "./PoolsKey";
import { RecentSwapsPanel } from "./RecentSwapsPanel";
import { QuotePanel } from "./QuotePanel";
import { SafetyPanel } from "./SafetyPanel";
import { ValidationPanel } from "./ValidationPanel";
import { VolQuadPanel } from "./VolQuadPanel";
import { Toggle } from "./ui";
import { WeatherChart } from "./WeatherChart";

/**
 * The desk, the hook and both pools of one pair, read from chain logs. `keyShownAbove`: the page already
 * shows the pools key for that pair (as /replay does), so the dashboard leaves its own out while on it.
 */
export function Dashboard({ band, initialPair = "live", keyShownAbove }: { band: LabPTradeBand; initialPair?: Pair; keyShownAbove?: Pair }) {
  const pairs: Pair[] = deployments.pairs.replay ? ["live", "replay"] : ["live"];
  const [pair, setPair] = useState<Pair>(initialPair);
  const data = useClimData(pair);
  // The replay pair ran once and stopped: its history ends with its last report and swaps, not "now".
  const run = data.source === "sepolia" && data.pair === deployments.pairs.replay && pair === "replay" ? finishedRun(data.reports, data.swaps, data.nowSec) : undefined;
  const history: ClimData = run
    ? { ...data, nowSec: run.endSec, state: data.state ? { ...data.state, latestBlock: { number: run.endBlock, timestamp: run.endSec } } : undefined }
    : data;
  const keyVariant = data.source === "mock" ? "mock" : pair;
  const staticFeePips = data.pair?.S.key.fee ?? (data.source === "mock" ? MOCK_STATIC_FEE_PIPS : deployments.pairs[pair]?.S.key.fee ?? MOCK_STATIC_FEE_PIPS);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {pairs.length > 1 ? (
          <Toggle<Pair> value={pair} options={pairs.map((p) => ({ value: p, label: p === "live" ? "Live pair" : "Replay pair (4 Feb 2026, finished)" }))} onChange={setPair} />
        ) : null}
        {data.source === "mock" ? (
          <span className="rounded-sm bg-notice-bg px-2 py-1 text-xs text-notice-fg">
            Mock data: this build is not reading the Sepolia deployment (not synced yet, or NEXT_PUBLIC_CLIM_SOURCE=mock). Same decoders and formulas as live.
          </span>
        ) : data.pair ? (
          <span className="text-xs text-fg-muted">
            {run ? "Finished replay on Sepolia" : "Live from Sepolia"}: RiskDesk{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.riskDesk}`} target="_blank" rel="noreferrer">{shortHash(data.pair.riskDesk)}</a>
            , hook{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.hook}`} target="_blank" rel="noreferrer">{shortHash(data.pair.hook)}</a>
            {data.usedSnapshot ? ", history from the frozen snapshot" : ""}
          </span>
        ) : null}
        {data.error ? <span className="text-xs text-danger">RPC error: {data.error}</span> : null}
      </div>
      {pair === keyShownAbove && keyVariant !== "mock" ? null : <PoolsKey variant={keyVariant} staticFeePips={staticFeePips} />}
      {run ? (
        <p className="max-w-4xl rounded-md bg-surface-2 px-4 py-3 text-sm leading-relaxed">
          This replay is over. Its desk published reports #{run.firstSeq} to #{run.lastSeq} on Sepolia from {utcTime(run.startSec)} to{" "}
          {utcTime(run.lastReportSec)} UTC on {new Date(run.startSec * 1000).toISOString().slice(0, 10)}, one every 30 s, replaying 12:00 to 16:00 UTC of
          4 February 2026; its last swap landed at {utcTime(run.endSec)} UTC. The charts and tables below are that on-chain history. Since then the desk
          has been silent, so its hook quotes the {pipsToBp(params.feeSafePips)} bp safe fee (blind mode): the desk and quote panels show it as read now.
        </p>
      ) : null}
      {data.status === "loading" ? (
        <LoadingGrid />
      ) : data.status === "error" ? (
        <p className="text-sm text-danger">Could not load chain data. Set NEXT_PUBLIC_SEPOLIA_RPC_URL or retry.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DeskPanel data={data} />
          <QuotePanel data={data} />
          <WeatherChart key={run ? "run" : pair} data={history} initialWindow={run ? "All" : "1 h"} />
          <ValidationPanel data={history} band={band} />
          <PnlPanel data={history} />
          <VolQuadPanel data={history} band={band} finished={run !== undefined} />
          <SafetyPanel data={data} />
          <RecentSwapsPanel data={history} />
        </div>
      )}
    </div>
  );
}

/**
 * While the first chain read runs: the ready grid's shape in flat blocks (two half-width cards, the three
 * full-width charts and tables, two half-width cards), so the page below does not jump when data lands.
 */
function LoadingGrid() {
  const block = "rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none";
  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">Loading desk reports and swaps…</p>
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
