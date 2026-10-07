"use client";

import { useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useChainSteps } from "@/hooks/useChainSteps";
import { useClimData } from "@/hooks/useClimData";
import { POOLS, useLpState } from "@/hooks/useLpState";
import { useTxFlow } from "@/hooks/useTxFlow";
import { deployments } from "@/lib/config";
import { amountsForLiquidity, approvalWithMargin, fullRangeParams, fullRangeTicks, liquidityForEth, type PositionView, positionView } from "@/lib/liquidity";
import { pnlExplain } from "@/lib/pnl";
import type { PoolName } from "@/lib/swap";
import { type FlowStep, mockStep, writeReadiness } from "@/lib/tx";
import { formatBp, pipsToBp } from "@/lib/units";
import { FaucetCard } from "./FaucetCard";
import { type AddQuote, LiquidityForm } from "./LiquidityForm";
import { PositionPanel } from "./PositionPanel";
import { type TxMode, TxModeSwitch } from "./TxModeSwitch";
import { TxSteps } from "./TxSteps";
import type { PoolOption } from "./dex";
import { ModeBadge } from "./ui";

const twin = (pool: PoolName): PoolName => (pool === "V" ? "S" : "V");

/** /lp: faucet, full-range liquidity on V or S through PoolModifyLiquidityTest, and the user's position. */
export function LiquidityBoard() {
  const data = useClimData("live");
  const ready = useMemo(() => writeReadiness(deployments, "lp"), []);
  const [mode, setMode] = useState<TxMode>(ready.ok ? "chain" : "mock");
  const lp = useLpState(mode, data);
  const flow = useTxFlow();
  const chain = useChainSteps();
  const { address } = useAccount();
  const runs = useRef(0);

  const pair = lp.pair;
  const token0IsEth = pair?.token0IsEth ?? true;
  const { tickLower, tickUpper } = fullRangeTicks(pair?.V.key.tickSpacing ?? 60);
  const router = deployments.uniswap.poolModifyLiquidityTest;
  const { tETH, tUSD } = deployments.tokens;
  const windowStart = data.reports[0]?.blockTimestamp ?? data.nowSec;

  /** The tETH and tUSD amounts behind `liquidity` at the pool's price. */
  function sides(pool: PoolName, liquidity: number): { eth: number; usd: number } | null {
    const level = lp.pools[pool];
    if (!level) return null;
    const { amount0, amount1 } = amountsForLiquidity(liquidity, level.sqrtP, tickLower, tickUpper);
    const [eth, usd] = token0IsEth ? [amount0, amount1] : [amount1, amount0];
    return { eth: eth / 1e18, usd: usd / 1e18 };
  }

  async function run(steps: FlowStep[], after: () => void) {
    const { ok } = await flow.start(steps);
    if (ok) after();
  }

  function faucet() {
    const n = ++runs.current;
    if (mode === "mock") return run([mockStep("Faucet tETH", n), mockStep("Faucet tUSD", n)], lp.mock.faucet);
    if (!tETH || !tUSD) return;
    return run([chain.faucet(tETH, "tETH"), chain.faucet(tUSD, "tUSD")], lp.refresh);
  }

  function quoteAdd(pool: PoolName, eth: number): AddQuote | null {
    const level = lp.pools[pool];
    if (!level || !(eth > 0)) return null;
    const liquidity = liquidityForEth(eth * 1e18, level.sqrtP, tickLower, tickUpper, token0IsEth);
    const s = sides(pool, liquidity);
    return s ? { liquidity, ...s } : null;
  }

  function add(pool: PoolName, eth: number) {
    const q = quoteAdd(pool, eth);
    if (!q || !pair) return;
    const n = ++runs.current;
    const label = `Add liquidity to pool ${pool}`;
    if (mode === "mock") {
      return run([mockStep("Approve tETH", n), mockStep("Approve tUSD", n), mockStep(label, n)], () => lp.mock.add(pool, q.liquidity, q.eth, q.usd));
    }
    if (!router || !tETH || !tUSD || !address) return;
    const params = fullRangeParams(pair[pool].key.tickSpacing, BigInt(Math.floor(q.liquidity)), address);
    return run(
      [
        chain.approve(tETH, "tETH", router, approvalWithMargin(q.eth)),
        chain.approve(tUSD, "tUSD", router, approvalWithMargin(q.usd)),
        chain.modifyLiquidity(router, pair[pool].key, params, label),
      ],
      () => {
        lp.rememberSince(pool, data.nowSec);
        lp.refresh();
      },
    );
  }

  function remove(pool: PoolName) {
    const pos = lp.positions[pool];
    if (!pos || !pair) return;
    const n = ++runs.current;
    const label = `Remove liquidity from pool ${pool}`;
    if (mode === "mock") {
      const s = sides(pool, pos.liquidity);
      return run([mockStep(label, n)], () => lp.mock.remove(pool, s?.eth ?? 0, s?.usd ?? 0));
    }
    if (!router || !address || pos.liquidityRaw === undefined) return;
    const params = fullRangeParams(pair[pool].key.tickSpacing, -pos.liquidityRaw, address);
    return run([chain.modifyLiquidity(router, pair[pool].key, params, label)], lp.refresh);
  }

  // The user's position in each pool, against the same liquidity in the twin pool (pnl.ts, pro rata to L).
  const { pools, positions } = lp;
  const { pair: dataPair, swaps, reports, arbRouter } = data;
  const views = (() => {
    const out: PositionView[] = [];
    if (!dataPair) return out;
    for (const name of POOLS) {
      const pos = positions[name];
      const level = pools[name];
      if (!pos || !level) continue;
      const other = twin(name);
      const otherLevel = pools[other];
      const since = pos.sinceSec ?? windowStart;
      const row = (p: PoolName) =>
        pnlExplain({
          swaps: swaps.filter((s) => s.blockTimestamp >= since),
          reports,
          poolId: dataPair[p].poolId,
          token0IsEth: dataPair.token0IsEth,
          arbRouter,
        });
      const price = level.sqrtP * level.sqrtP;
      out.push(
        positionView({
          pool: name,
          liquidity: pos.liquidity,
          poolLiquidity: level.liquidity,
          // the twin pool without the user's own position there, plus this liquidity
          otherPoolLiquidity: otherLevel ? otherLevel.liquidity - (positions[other]?.liquidity ?? 0) + pos.liquidity : undefined,
          sqrtP: level.sqrtP,
          tickLower,
          tickUpper,
          token0IsEth: dataPair.token0IsEth,
          ethUsd: dataPair.token0IsEth ? price : 1 / price,
          rowSame: row(name),
          rowOther: row(other),
          sinceSec: since,
          feesUsdOnChain: pos.feesUsdOnChain,
        }),
      );
    }
    return out;
  })();

  // the pool cards: what sets each fee, the fee now, and how deep the pool is at its price
  const quoteNow = data.state?.quote;
  const levelV = lp.pools.V;
  const ethUsd = levelV ? (token0IsEth ? levelV.sqrtP ** 2 : 1 / levelV.sqrtP ** 2) : undefined;
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const depth = (p: PoolName) => {
    const level = lp.pools[p];
    const s2 = level ? sides(p, level.liquidity) : null;
    // test tokens: the depth is shown in tokens, never as dollars
    return s2 ? `${compact.format(s2.eth)} tETH + ${compact.format(s2.usd)} tUSD in the pool` : "pool depth …";
  };
  const poolOptions: PoolOption<PoolName>[] = [
    {
      value: "V",
      title: "Pool V · clim",
      subtitle: depth("V"),
      fee: quoteNow ? formatBp(pipsToBp(quoteNow.feePips), 2) : "…",
      badge: quoteNow ? <ModeBadge mode={quoteNow.mode} /> : null,
    },
    { value: "S", title: "Pool S · static twin", subtitle: depth("S"), fee: pair ? formatBp(pipsToBp(pair.S.key.fee), 2) : "…" },
  ];

  return (
    <div className="space-y-6">
      <FaucetCard mode={mode} balances={lp.balances} busy={flow.running} onFaucet={faucet} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        <LiquidityForm mode={mode} busy={flow.running} balances={lp.balances} quote={quoteAdd} onAdd={add} pools={poolOptions} ethUsd={ethUsd}>
          <TxModeSwitch mode={mode} onChange={setMode} ready={ready} />
          <TxSteps steps={flow.steps} live={mode === "chain"} />
        </LiquidityForm>
        <PositionPanel mode={mode} views={views} busy={flow.running} onRemove={remove} />
      </div>
    </div>
  );
}
