"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";
import type { ClimData } from "@/hooks/useClimData";
import { deployments, params } from "@/lib/config";
import type { LabPTradeBand } from "@/lib/lab";
import { arbBlocksOf, makeBlockClock, makePredictor, pTradeTotals, rollingPTrade } from "@/lib/ptrade";
import { downsample } from "@/lib/series";
import { COLORS, utcTime } from "@/lib/theme";
import { dataTable, type HeadingLevel, Panel } from "./ui";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// From the replay arbitrage bot's log (bots/out/arb-replay.jsonl, pool V): 259 trades sent, 90 blocks skipped
// while a trade was pending, 837 inside the band, so 349 of the 1,186 blocks it processed were outside it.
const REPLAY_SKIPS =
  "On this replay it skipped 90 such blocks on V: counting them, the bot saw V outside the band in 349 of the 1,186 blocks it processed (29.4%), against the prediction above.";

export function ValidationPanel({ data, band, level }: { data: ClimData; band: LabPTradeBand; level?: HeadingLevel }) {
  const replay = !!deployments.pairs.replay && data.pair?.V.poolId === deployments.pairs.replay.V.poolId;
  const result = useMemo(() => {
    if (!data.pair || !data.arbRouter || data.reports.length === 0 || !data.state) return null;
    const anchors = [...data.reports, ...data.swaps].map((x) => ({ block: x.blockNumber, t: x.blockTimestamp }));
    const clock = makeBlockClock(anchors);
    const fromBlock = data.reports[0].blockNumber;
    const toBlock = data.state.latestBlock.number;
    const window = band.windowBlocks;
    const pools = [
      { name: "V", poolId: data.pair.V.poolId, predictedAt: makePredictor(data.reports, params, clock) },
      { name: "S", poolId: data.pair.S.poolId, predictedAt: makePredictor(data.reports, params, clock, data.pair.S.key.fee) },
    ] as const;
    const totals = pools.map((p) => ({ name: p.name, ...pTradeTotals({ fromBlock, toBlock, arbBlocks: arbBlocksOf(data.swaps, p.poolId, data.arbRouter!), predictedAt: p.predictedAt }) }));
    const step = Math.max(1, Math.floor((toBlock - fromBlock) / 600));
    const series = rollingPTrade({
      fromBlock, toBlock, window, step, arbBlocks: arbBlocksOf(data.swaps, pools[0].poolId, data.arbRouter), predictedAt: pools[0].predictedAt, clock, band,
    }).map((x) => ({ ...x, band95: [x.lo95, x.hi95] }));
    return { totals, series: downsample(series, 800), window };
  }, [data.pair, data.arbRouter, data.reports, data.swaps, data.state, band]);

  return (
    <Panel
      level={level}
      title="Validation: predicted vs observed arbitrage frequency"
      subtitle={
        <>
          Share of blocks with an arbitrage, against the model&apos;s prediction from the fee and σ (the formula is on{" "}
          <Link className="text-link underline" href="/how#premium">How it works</Link>). The table counts the whole run; the chart follows V
          over rolling {band.windowBlocks}-block windows, with a band where 95% of the model&apos;s simulated {band.windowBlocks}-block runs land.
        </>
      }
      className="col-span-full"
    >
      {!result ? (
        <p className="text-sm text-fg-subtle">{data.arbRouter ? "Waiting for desk reports and swaps." : "Arbitrage router unknown: add routers.arb to shared/deployments/sepolia.json."}</p>
      ) : (
        <>
          <div className="mb-3 max-w-xl overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Arbitrage frequency, observed against predicted" tabIndex={0}>
            <table className={dataTable}>
              <thead>
                <tr>
                  <th className="pr-4 text-left">Pool</th><th className="num hidden pl-3 sm:table-cell sm:pl-4">Blocks</th><th className="num pl-3 sm:pl-4">With arbitrage</th><th className="num pl-3 sm:pl-4">Observed</th><th className="num pl-3 sm:pl-4">Predicted</th>
                </tr>
              </thead>
              <tbody>
                {result.totals.map((t) => (
                  <tr key={t.name}>
                    <td className="whitespace-nowrap pr-4 font-medium" style={{ color: t.name === "V" ? COLORS.V : COLORS.S }}>Pool {t.name}</td>
                    <td className="num hidden pl-3 sm:table-cell sm:pl-4">{t.blocks.toLocaleString("en-US")}</td><td className="num pl-3 sm:pl-4">{t.arbBlocks.toLocaleString("en-US")}</td><td className="num pl-3 sm:pl-4">{pct(t.observed)}</td><td className="num pl-3 sm:pl-4">{pct(t.predicted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-3 text-xs text-fg-muted">
            Our arbitrage bot keeps one transaction in flight per pool: while a trade is pending, it skips the blocks where that pool is
            still outside its no-arbitrage band. The observed share is therefore a lower bound on what the model&apos;s arbitrageur would take.
            {replay ? ` ${REPLAY_SKIPS}` : ""}
          </p>
          {result.series.length === 0 ? (
            <p className="text-sm text-fg-subtle">Need at least {result.window} blocks of data for the rolling chart.</p>
          ) : (
            <div
              className="h-56 w-full"
              role="img"
              aria-label={`Rolling share of blocks with an arbitrage on V, observed against predicted, with the model's 95% band. Over the whole run: observed ${pct(result.totals[0].observed)}, predicted ${pct(result.totals[0].predicted)}.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart accessibilityLayer={false} data={result.series} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={utcTime} tick={{ fontSize: 12, fill: COLORS.muted }} />
                  <YAxis tickFormatter={(v) => pct(Number(v))} tick={{ fontSize: 12, fill: COLORS.muted }} width={56} />
                  <Tooltip {...TOOLTIP} content={<ChartTooltip only={["observed", "predicted", "band95"]} labelFormat={(t) => `${utcTime(Number(t))} UTC`} valueFormat={(v) => pct(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="band95" name="95% band (model)" stroke="none" fill={COLORS.band} isAnimationActive={false} />
                  <Line dataKey="predicted" name="Predicted" stroke={COLORS.ink} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="observed" name="Observed on V" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
