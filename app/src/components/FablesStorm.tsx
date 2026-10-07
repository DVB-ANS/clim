"use client";

// /replay, under the 7 October storm: the same storm on Fables' ETH/USDG pool (Robinhood Chain), whose fee moves
// only when its keeper posts an override, against clim's pool V, whose fee no transaction sets. Fables' numbers
// come from the lab file (lib/fables.ts); clim's from the live pair's logs, read by LatestStorm.
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { type FablesStorm as FablesStormData, type FeeStep, mergeSteps } from "@/lib/fables";
import { weatherSeries } from "@/lib/series";
import type { StormStats } from "@/lib/storm";
import { COLORS, utcTime } from "@/lib/theme";
import { formatBp, pipsToBp, shortHash } from "@/lib/units";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";
import { ExtLink } from "./ui";

const bp = (pips: number) => formatBp(pipsToBp(pips), 2);

export function FablesStorm({ fables: f, data, stats }: { fables: FablesStormData; data: ClimData; stats: StormStats }) {
  const { start, end } = f.window;
  // pool V's fee as the hook quoted it, report by report (blind spells included), up to the window's end
  const clim: FeeStep[] = useMemo(
    () => weatherSeries(data.reports, params, end).filter((p) => p.t <= end).map((p) => ({ t: p.t, feePips: Math.round(p.feeVBp * 100) })),
    [data.reports, end],
  );
  const rows = useMemo(() => mergeSteps(f.steps, clim, start, end).map((r) => ({ t: r.t, fables: pipsToBp(r.a), clim: pipsToBp(r.b) })), [f.steps, clim, start, end]);

  const capFrom = f.steps.find((s) => s.feePips === f.config.capPips);
  const capTo = capFrom ? f.steps.find((s) => s.t > capFrom.t) : undefined;
  const firstMove = f.steps.find((s) => s.feePips !== f.config.flatPips);
  const keeper = f.keepers.length === 1 ? shortHash(f.keepers[0]) : `${f.keepers.length} addresses`;
  const v = stats.v;
  const tx = (hash: string) => `${f.explorer}/tx/${hash}`;

  const cells = [
    {
      label: "Fables · set by its keeper",
      value: `${bp(Math.min(...f.steps.map((s) => s.feePips)))} to ${bp(Math.max(...f.steps.map((s) => s.feePips)))}`,
      hint: `${f.pokes.length} overrides in this window, all sent by one address, ${keeper}${capFrom ? `; its ${bp(f.config.capPips)} cap from ${utcTime(capFrom.t)}${capTo ? ` to ${utcTime(capTo.t)}` : ""} UTC` : ""}.`,
      link: f.pokes[0] ? { label: "First override on the explorer", href: tx(f.pokes[0].tx) } : undefined,
    },
    {
      label: "Fables · swaps in that time",
      value: f.swaps.n.toLocaleString("en-US"),
      hint: `${f.swaps.matchKeeperRule === f.swaps.n ? `All ${f.swaps.n.toLocaleString("en-US")}` : `${f.swaps.matchKeeperRule.toLocaleString("en-US")} of them`} paid the fee rebuilt from the keeper's overrides; ${f.swaps.aboveFlat.toLocaleString("en-US")} paid more than its flat ${bp(f.config.flatPips)}.`,
      link: { label: `The ${bp(f.swaps.top.feePips)} swap on the explorer`, href: tx(f.swaps.top.tx) },
    },
    {
      label: "clim · set by a public formula",
      value: v ? `${bp(v.minPips)} to ${bp(v.maxPips)}` : "…",
      hint: `No transaction sets it: the hook computes it inside each swap from the σ the CRE desk publishes every 30 s (median of 4 exchanges)${v ? `; ${v.formula === v.n ? `all ${v.n}` : `${v.formula} of ${v.n}`} swaps on pool V paid the formula's fee` : ""}.`,
    },
    {
      label: "If the updates stop",
      value: `${Math.round(f.pokeTtlSec / 3600)} h against ${params.tauKillSec} s`,
      hint: `A Fables override stays live for ${Math.round(f.pokeTtlSec / 3600)} h, whatever the market does. clim's hook charges its ${pipsToBp(params.feeSafePips)} bp safe fee once the desk is ${params.tauKillSec} s late.`,
    },
  ];

  const text = `Fables' fee and clim pool V's fee, ${utcTime(start)} to ${utcTime(end)} UTC on 7 October: Fables from ${bp(f.config.flatPips)} to ${bp(f.config.capPips)} in ${f.pokes.length} keeper overrides; clim${v ? ` from ${bp(v.minPips)} to ${bp(v.maxPips)}` : ""}, set by its formula.`;

  return (
    <section id="fables" aria-labelledby="fables-title" className="space-y-4 border-t border-line pt-8">
      <h2 id="fables-title" className="font-display text-[26px] tracking-[-0.02em]">
        The same storm on Fables: its fee moves only when its keeper posts it
      </h2>
      <p className="max-w-3xl text-[15px] leading-relaxed text-fg-muted">
        {`Fables' ${f.pair} pool on ${f.chain} charges a flat ${bp(f.config.flatPips)} unless its keeper overrides it. On 7 October the keeper did, ${f.pokes.length} times: each move was a transaction from one address, carrying a fee chosen off-chain. No transaction sets clim's fee: the hook computes it in every swap from the σ the desk publishes, with a public formula anyone can check. Fables' keeper could read the same desk (our proposal, not an agreement).`}
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="text-[13px] text-fg-subtle">{c.label}</dt>
            <dd className="mt-1 font-display text-2xl font-medium tracking-tight tabular-nums">{c.value}</dd>
            <dd className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{c.hint}</dd>
            {c.link ? (
              <dd className="mt-1 text-[13px]">
                <ExtLink href={c.link.href}>{c.link.label}</ExtLink>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div className="h-72 w-full" role="img" aria-label={text}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={[start, end]} ticks={Array.from({ length: 7 }, (_, i) => start + i * 900)} tickFormatter={utcTime} tick={{ fontSize: 12, fill: COLORS.muted }} />
              <YAxis unit=" bp" tick={{ fontSize: 12, fill: COLORS.muted }} width={56} />
              <Tooltip {...TOOLTIP} content={<ChartTooltip only={["fables", "clim"]} labelFormat={(l) => `${utcTime(Number(l))} UTC`} valueFormat={(x) => `${x.toFixed(2)} bp`} />} />
              <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
              <Line type="stepAfter" dataKey="fables" name="Fables (keeper's overrides)" stroke={COLORS.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="clim" name="clim pool V (formula)" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-fg-subtle">
          {`Fees in bp, ${utcTime(start)} to ${utcTime(end)} UTC. Fables' keeper moved first${firstMove ? ` (${utcTime(firstMove.t)} UTC; clim at ${utcTime(stats.above.from)})` : ""} and went higher, to its own cap. The levels do not compare across chains: clim's formula scales with the block time (12 s on Sepolia), and each pool sets its own cap. What differs is how each fee moves. In this build clim's desk reports also come from one key (our operator, in CRE's simulator), but they carry a measurement, not the fee. Fables' fee is rebuilt from its keeper's FeePoked logs with its hook's verified rule (FablesRamp) and checked against every swap's fee; data and script: `}
          <a className="underline" href="/data/lab/fables-storm-2026-10-07.json">
            fables-storm-2026-10-07.json
          </a>
          {`, lab/scripts/fables_storm.py.`}
        </p>
      </div>
    </section>
  );
}
