"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { LabPTradeBand } from "@/lib/lab";
import { arbBlocksOf, makeBlockClock, makePredictor, pTradeTotals, rollingPTrade } from "@/lib/ptrade";
import { downsample } from "@/lib/series";
import { COLORS, utcTime } from "@/lib/theme";
import { FixtureNote, Panel } from "./ui";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function ValidationPanel({ data, band }: { data: ClimData; band: LabPTradeBand }) {
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
      title="Validation: predicted vs observed arbitrage frequency"
      subtitle={`Share of blocks with an arbitrage on V, rolling ${band.windowBlocks} blocks. Model: P_trade = 1 / (η_eff + 0.824), η_eff = fee / (σ·√(Δt/2)). Band: the model's Monte Carlo paths with clustered arbitrage (${band.method.replace(/^model simulation: /, "")}).`}
      className="col-span-full"
    >
      <FixtureNote show={band.fixture}>The band is a fixture until the lab writes lab/out/ptrade-band.json.</FixtureNote>
      {!result ? (
        <p className="text-sm text-fg-subtle">{data.arbRouter ? "Waiting for desk reports and swaps." : "Arbitrage router unknown: add routers.arb to shared/deployments/sepolia.json."}</p>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto" role="region" aria-label="Arbitrage frequency, observed against predicted" tabIndex={0}>
            <table className="text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-fg-subtle">
                <th className="pr-6">Pool</th><th className="pr-6">Blocks</th><th className="pr-6">With arbitrage</th><th className="pr-6">Observed</th><th>Predicted</th>
              </tr>
            </thead>
            <tbody>
              {result.totals.map((t) => (
                <tr key={t.name}>
                  <td className="pr-6 font-medium" style={{ color: t.name === "V" ? COLORS.V : COLORS.S }}>{t.name}</td>
                  <td className="pr-6">{t.blocks}</td><td className="pr-6">{t.arbBlocks}</td><td className="pr-6">{pct(t.observed)}</td><td>{pct(t.predicted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {result.series.length === 0 ? (
            <p className="text-sm text-fg-subtle">Need at least {result.window} blocks of data for the rolling chart.</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={result.series} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={utcTime} tick={{ fontSize: 11, fill: COLORS.muted }} />
                  <YAxis tickFormatter={(v) => pct(Number(v))} tick={{ fontSize: 11, fill: COLORS.muted }} width={56} />
                  <Tooltip {...TOOLTIP} content={<ChartTooltip only={["observed", "predicted", "band95"]} labelFormat={(t) => `${utcTime(Number(t))} UTC`} valueFormat={(v) => pct(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area dataKey="band95" name="95% band (model)" stroke="none" fill={COLORS.band} isAnimationActive={false} />
                  <Line dataKey="predicted" name="Predicted" stroke={COLORS.ink} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="observed" name="Observed (V)" stroke={COLORS.V} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
