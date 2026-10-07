"use client";

// /replay's lead: the 7 October 2026 storm on the live desk. It reads the live pair through useClimData, so
// it shares the visit's copy of the logs with /app (or loads the same static snapshot). Only the window is
// fixed (LATEST_STORM_WINDOW); every number is computed from the logs by stormStats.
import { type ReactNode, useMemo } from "react";
import { POLL_MS, useClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { etherscanTxLogs } from "@/lib/contracts";
import { spanLabel } from "@/lib/ledger";
import { LATEST_STORM_WINDOW, type StormStats, stormStats } from "@/lib/storm";
import { utcTime } from "@/lib/theme";
import { formatBp, pipsToBp } from "@/lib/units";
import { ExtLink } from "./ui";
import { WeatherChart } from "./WeatherChart";

const bp = (pips: number) => formatBp(pipsToBp(pips), 2);

type Item = { key: string; swatch: "sigma" | "v"; label: string; value: string; hint: string; link?: { label: string; href: string } };

/** The four stats, in reading order: the peak, how long the fee was up, what V's swaps paid then, how many. */
function items(st: StormStats, staticFeePips: number, arbRouter?: string): Item[] {
  const { peak, above, v, s } = st;
  const floor = pipsToBp(params.feeMinPips);
  const out: Item[] = [
    {
      key: "peak",
      swatch: "sigma",
      label: "Volatility peak (σ)",
      value: `${peak.sigmaPct.toFixed(1)}%/yr`,
      hint: `Report #${peak.report.seq}, landed at ${utcTime(peak.report.blockTimestamp)} UTC. It set pool V's fee to ${bp(peak.feePips)}.`,
      link: { label: `Report #${peak.report.seq} on Etherscan`, href: etherscanTxLogs(peak.report.txHash) },
    },
    {
      key: "above",
      swatch: "v",
      label: `V's fee above its ${floor} bp floor`,
      value: spanLabel(above.sec),
      hint: `From ${utcTime(above.from)} to ${utcTime(above.to)} UTC: ${st.reports.aboveFloor} of the ${st.reports.n} reports in that time set it above the floor.`,
    },
  ];
  if (!v) return out;
  const sFee = s ? (s.minPips === s.maxPips ? `${bp(s.minPips)} on all ${s.n} of its swaps` : `${bp(s.minPips)} to ${bp(s.maxPips)}`) : `fixed at ${bp(staticFeePips)}`;
  const kind = arbRouter && v.top.sender.toLowerCase() === arbRouter.toLowerCase() ? "an arbitrage swap" : "a retail swap";
  const where = v.top.blockNumber === peak.report.blockNumber ? `in report #${peak.report.seq}'s block` : `at ${utcTime(v.top.blockTimestamp)} UTC`;
  out.push(
    {
      key: "fees",
      swatch: "v",
      label: "Fees paid on pool V in that time",
      value: `${pipsToBp(v.minPips).toFixed(2)} to ${bp(v.maxPips)}`,
      hint: `${bp(v.maxPips)} by ${kind} ${where}. Pool S: ${sFee}.`,
      link: { label: `The ${bp(v.maxPips)} swap on Etherscan`, href: etherscanTxLogs(v.top.txHash) },
    },
    {
      key: "swaps",
      swatch: "v",
      label: "Swaps on pool V in that time",
      value: `${v.aboveFloor} of ${v.n}`,
      hint: `paid more than the floor. ${v.formula === v.n ? `All ${v.n}` : `${v.formula} of the ${v.n}`} paid exactly the fee the hook's formula gives for the report in force.`,
    },
  );
  return out;
}

export function LatestStorm() {
  const data = useClimData("live");
  const { reports, swaps, pair } = data;
  const stats = useMemo(
    () => (pair ? stormStats({ reports, swaps, poolIdV: pair.V.poolId, poolIdS: pair.S.poolId, params, window: LATEST_STORM_WINDOW }) : undefined),
    [reports, swaps, pair],
  );

  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <p className="text-sm text-danger">{`Could not reach Sepolia through the public RPCs. Retrying every ${POLL_MS / 1000} s.`}</p>;
  if (!stats || !pair) return <Note>The live desk&apos;s logs read so far do not cover this storm.</Note>;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-4">
        {items(stats, pair.S.key.fee, data.arbRouter).map((it) => (
          <div key={it.key} className="min-w-0">
            <dt className="flex items-center gap-2 text-[13px] text-fg-subtle">
              <span aria-hidden className={`h-0.5 w-4 shrink-0 rounded-full ${it.swatch === "sigma" ? "bg-sigma" : "bg-v"}`} />
              {it.label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-medium tracking-tight tabular-nums">{it.value}</dd>
            <dd className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{it.hint}</dd>
            {it.link ? (
              <dd className="mt-1 text-[13px]">
                <ExtLink href={it.link.href}>{it.link.label}</ExtLink>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
      {/* the window is in the past: its end stands for "now", so the chart's series and blind shading stop there */}
      <WeatherChart id="storm-weather" data={{ ...data, nowSec: LATEST_STORM_WINDOW[1] }} fixed={LATEST_STORM_WINDOW} initialWindow="All" />
      <p className="max-w-4xl text-xs leading-relaxed text-fg-subtle">
        σ is the 15-minute realized volatility of ETH&apos;s median price on four exchanges, annualized, as RiskDesk applied it. Our bots made
        the swaps: a retail bot sends every order to both pools, and an arbitrage bot trades both. Every number here is computed in your browser
        from the live desk&apos;s RiskReported events and the pools&apos; Swap events; the formula check recomputes each swap&apos;s fee from
        the report in force. The desk&apos;s CRE workflow runs in CRE&apos;s simulator on one node: our operator key sends each report through
        MockKeystoneForwarder, which checks no signature.
      </p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-4xl rounded-md bg-notice-bg px-4 py-3 text-sm leading-relaxed text-notice-fg">{children}</p>;
}

/** While the first chain read runs: the stats band and the chart's shape, so the page below does not jump. */
function Loading() {
  const block = "rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none";
  return (
    <div>
      <p role="status" aria-live="polite" className="mb-3 text-sm text-fg-subtle">
        {`Reading the live desk's reports and the pools' swaps from Sepolia. The first load takes a few seconds.`}
      </p>
      <div aria-hidden className="space-y-4">
        <div className={`${block} h-[150px]`} />
        <div className={`${block} h-[640px]`} />
      </div>
    </div>
  );
}
