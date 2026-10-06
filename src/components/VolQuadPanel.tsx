"use client";

import { useMemo } from "react";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { LabPTradeBand } from "@/lib/lab";
import { pnlExplain, sigmaBreakEvenAnnualPct } from "@/lib/pnl";
import { arbBlocksOf, pTradeTotals, makeBlockClock, makePredictor, sigmaArbAnnualPct } from "@/lib/ptrade";
import { timeAverageFeeBp, weatherSeries } from "@/lib/series";
import { dvolE2ToPct, formatPct, sigmaE9ToAnnualPct, tickToEthUsd } from "@/lib/units";
import { Panel, Stat } from "./ui";

export function VolQuadPanel({ data, band }: { data: ClimData; band: LabPTradeBand }) {
  const q = useMemo(() => {
    const last = data.reports.at(-1);
    if (!last || !data.pair || !data.state) return null;
    const pair = data.pair;
    const toBlock = data.state.latestBlock.number;
    const fromBlock = Math.max(data.reports[0].blockNumber, toBlock - band.windowBlocks + 1);
    const clock = makeBlockClock([...data.reports, ...data.swaps].map((x) => ({ block: x.blockNumber, t: x.blockTimestamp })));
    const obs = data.arbRouter
      ? pTradeTotals({ fromBlock, toBlock, arbBlocks: arbBlocksOf(data.swaps, pair.V.poolId, data.arbRouter), predictedAt: makePredictor(data.reports, params, clock) }).observed
      : Number.NaN;
    const from = clock(fromBlock);
    const feeBp = timeAverageFeeBp(weatherSeries(data.reports, params, data.nowSec).filter((p) => p.t >= from), data.nowSec);
    const vSwaps = data.swaps.filter((s) => s.poolId === pair.V.poolId);
    const pnl = pnlExplain({ swaps: data.swaps, reports: data.reports, poolId: pair.V.poolId, token0IsEth: pair.token0IsEth, arbRouter: data.arbRouter });
    const elapsed = vSwaps.length ? data.nowSec - vSwaps[0].blockTimestamp : 0;
    const be = vSwaps.length && elapsed > 0
      ? sigmaBreakEvenAnnualPct((pnl.feeRetailUsd + pnl.feeArbUsd) / elapsed, Number(vSwaps[vSwaps.length - 1].liquidity), tickToEthUsd(last.refTick, pair.token0IsEth))
      : Number.NaN;
    return {
      iv: last.dvolE2 === 0 ? Number.NaN : dvolE2ToPct(last.dvolE2),
      rv: sigmaE9ToAnnualPct(last.rv15E9),
      arb: sigmaArbAnnualPct(feeBp * 100, obs, params.sqrtHalfDtE6),
      be,
    };
  }, [data.reports, data.swaps, data.pair, data.state, data.arbRouter, data.nowSec, band.windowBlocks]);
  const fmt = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? "n/a" : formatPct(x));
  return (
    <Panel title="Volatility quad" subtitle="Implied (DVOL) and realised (RV15) from the desk; σ_arb reproduces the observed arbitrage frequency on V; above σ_BE, V's fee income is below its LVR.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="σ_IV (DVOL)" value={fmt(q?.iv)} />
        <Stat label="σ_RV (RV15)" value={fmt(q?.rv)} />
        <Stat label="σ_arb (V, last window)" value={fmt(q?.arb)} />
        <Stat label="σ_BE (V)" value={fmt(q?.be)} />
      </div>
    </Panel>
  );
}
