"use client";

import { useState } from "react";
import { useClimData } from "@/hooks/useClimData";
import { deployments, EXPLORER } from "@/lib/config";
import type { Pair } from "@/lib/deployments";
import type { LabPTradeBand } from "@/lib/lab";
import { shortHash } from "@/lib/units";
import { DeskPanel } from "./DeskPanel";
import { PnlPanel } from "./PnlPanel";
import { RecentSwapsPanel } from "./RecentSwapsPanel";
import { QuotePanel } from "./QuotePanel";
import { SafetyPanel } from "./SafetyPanel";
import { ValidationPanel } from "./ValidationPanel";
import { VolQuadPanel } from "./VolQuadPanel";
import { WeatherChart } from "./WeatherChart";

export function Dashboard({ band, initialPair = "live" }: { band: LabPTradeBand; initialPair?: Pair }) {
  const pairs: Pair[] = deployments.pairs.replay ? ["live", "replay"] : ["live"];
  const [pair, setPair] = useState<Pair>(initialPair);
  const data = useClimData(pair);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {pairs.length > 1
          ? pairs.map((p) => (
              <button key={p} type="button" onClick={() => setPair(p)} className={`rounded-sm px-3 py-1 text-sm ${p === pair ? "bg-fg text-surface" : "bg-surface-2"}`}>
                {p === "live" ? "Live pair" : "Replay pair (4 Feb 2026)"}
              </button>
            ))
          : null}
        {data.source === "mock" ? (
          <span className="rounded-sm bg-notice-bg px-2 py-1 text-xs text-notice-fg">
            Mock data: contracts not deployed yet (or NEXT_PUBLIC_CLIM_SOURCE=mock). Same decoders and formulas as live.
          </span>
        ) : data.pair ? (
          <span className="text-xs text-fg-muted">
            Live from Sepolia: RiskDesk{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.riskDesk}`} target="_blank" rel="noreferrer">{shortHash(data.pair.riskDesk)}</a>
            , hook{" "}
            <a className="text-link underline" href={`${EXPLORER}/address/${data.pair.hook}`} target="_blank" rel="noreferrer">{shortHash(data.pair.hook)}</a>
            {data.usedSnapshot ? ", history from the frozen snapshot" : ""}
          </span>
        ) : null}
        {data.error ? <span className="text-xs text-danger">RPC error: {data.error}</span> : null}
      </div>
      {data.status === "loading" ? (
        <p className="text-sm text-fg-subtle">Loading desk reports and swaps…</p>
      ) : data.status === "error" ? (
        <p className="text-sm text-danger">Could not load chain data. Set NEXT_PUBLIC_SEPOLIA_RPC_URL or retry.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <DeskPanel data={data} />
          <QuotePanel data={data} />
          <WeatherChart data={data} />
          <ValidationPanel data={data} band={band} />
          <PnlPanel data={data} />
          <VolQuadPanel data={data} band={band} />
          <SafetyPanel data={data} />
          <RecentSwapsPanel data={data} />
        </div>
      )}
    </div>
  );
}
