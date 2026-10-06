"use client";

import { useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { useChainSteps } from "@/hooks/useChainSteps";
import { useClimData } from "@/hooks/useClimData";
import { useTxFlow } from "@/hooks/useTxFlow";
import { deployments, params } from "@/lib/config";
import type { SwapRow } from "@/lib/decode";
import { MOCK_ADDR } from "@/lib/mock";
import { postSwapEthUsd } from "@/lib/pnl";
import { estimateOut, feeReason, planSwap, type PoolName, type SwapPlan, swapResult, type SwapSide } from "@/lib/swap";
import { mockStep, mockSwapLogs, mockTxHash, writeReadiness } from "@/lib/tx";
import { formatAge, formatAmount, formatBp, pipsToBp, sigmaE9ToAnnualPct, tickToEthUsd } from "@/lib/units";
import { AmountBox, DetailRow, FlipButton, PoolCards, TokenIcon } from "./dex";
import { FeeCurveChart } from "./FeeCurveChart";
import { ActionButton, type TxMode, TxModeSwitch } from "./TxModeSwitch";
import { TxSteps } from "./TxSteps";
import { ModeBadge, Panel, Stat, TxLink } from "./ui";

/** /swap: the fee of V (clim) or S (static) before the swap, the weather that sets it, then the fee paid. */
export function SwapForm() {
  const data = useClimData("live");
  const ready = useMemo(() => writeReadiness(deployments, "swap"), []);
  const [mode, setMode] = useState<TxMode>(ready.ok ? "chain" : "mock");
  const [pool, setPool] = useState<PoolName>("V");
  const [side, setSide] = useState<SwapSide>("sell ETH");
  const [amount, setAmount] = useState("0.5");
  const [result, setResult] = useState<{ swap: SwapRow; live: boolean } | null>(null);
  const flow = useTxFlow();
  const chain = useChainSteps();
  const runs = useRef(0);

  // Writes go to the deployed pair; the weather, the quote and the price come from the data hook.
  const pair = mode === "chain" ? deployments.pairs.live : data.pair;
  const tETH = mode === "chain" ? deployments.tokens.tETH : MOCK_ADDR.tETH;
  const tUSD = mode === "chain" ? deployments.tokens.tUSD : MOCK_ADDR.tUSD;
  const router: Address = mode === "chain" ? deployments.uniswap.poolSwapTest : MOCK_ADDR.retailRouter;
  const token0IsEth = pair?.token0IsEth ?? true;
  const desk = data.state?.desk;
  const quote = data.state?.quote;
  const lastReport = data.reports.at(-1);
  const poolId = pair?.[pool].poolId;
  const lastSwap = poolId ? data.swaps.filter((s) => s.poolId === poolId).at(-1) : undefined;
  const ethUsd = lastSwap
    ? postSwapEthUsd(lastSwap.sqrtPriceX96, token0IsEth)
    : lastReport
      ? tickToEthUsd(lastReport.refTick, token0IsEth)
      : undefined;
  const staticFeePips = pair?.S.key.fee ?? 0;
  const feePips = pool === "V" ? quote?.feePips : staticFeePips;
  const sigmaPct = desk ? sigmaE9ToAnnualPct(desk.sigmaE9) : 0;

  let plan: SwapPlan | null = null;
  let planError: string | null = null;
  try {
    if (pair && tETH && tUSD) plan = planSwap({ pair, tETH, tUSD, pool, side, amount });
  } catch (e) {
    planError = e instanceof Error ? e.message.replace(/^amount: /, "") : String(e);
  }
  const amountIn = plan ? Number(plan.amountIn) / 1e18 : 0;
  const inSymbol = side === "sell ETH" ? "tETH" : "tUSD";
  const outSymbol = side === "sell ETH" ? "tUSD" : "tETH";
  const estimate = plan && ethUsd !== undefined && feePips !== undefined ? estimateOut({ side, amountIn, ethUsd, feePips }) : undefined;

  async function submit() {
    if (!plan || feePips === undefined || ethUsd === undefined) return;
    setResult(null);
    const n = ++runs.current;
    const live = mode === "chain";
    const swapLabel = `Swap on pool ${pool}`;
    const steps = live
      ? [chain.approve(plan.tokenIn, inSymbol, router, plan.amountIn), chain.swap(router, plan)]
      : [
          mockStep(`Approve ${inSymbol}`, n),
          mockStep(
            swapLabel,
            n,
            mockSwapLogs({
              plan,
              sender: router,
              feePips,
              ethUsd,
              token0IsEth,
              liquidity: lastSwap?.liquidity ?? 0n,
              poolManager: deployments.uniswap.poolManager,
              blockNumber: (data.state?.latestBlock.number ?? 0) + 1,
              t: data.nowSec,
              txHash: mockTxHash(swapLabel, n),
            }),
          ),
        ];
    const { ok, logs } = await flow.start(steps);
    const swap = ok ? swapResult(logs, plan.poolId) : undefined;
    if (swap) setResult({ swap, live });
  }

  const paid = result
    ? (() => {
        const eth = Number(token0IsEth ? result.swap.amount0 : result.swap.amount1) / 1e18;
        const usd = Number(token0IsEth ? result.swap.amount1 : result.swap.amount0) / 1e18;
        return eth < 0
          ? { paid: `${formatAmount(-eth, 6)} tETH`, got: `${formatAmount(usd, 2)} tUSD` }
          : { paid: `${formatAmount(-usd, 2)} tUSD`, got: `${formatAmount(eth, 6)} tETH` };
      })()
    : null;

  const flip = () => setSide(side === "sell ETH" ? "buy ETH" : "sell ETH");
  const usdOf = (x: number, symbol: string) => (ethUsd === undefined ? undefined : symbol === "tETH" ? x * ethUsd : x);
  const inUsd = plan ? usdOf(amountIn, inSymbol) : undefined;
  const feeVBp = quote ? pipsToBp(quote.feePips) : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <Panel title="The weather sets your fee" subtitle="Read on every swap by the hook from the latest Chainlink CRE report (ClimHook.quoteFee()).">
        {!desk || !quote ? (
          <p className="text-sm text-fg-subtle">Loading the risk desk…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="σ applied by the desk" value={`${sigmaPct.toFixed(1)}%/yr`} hint={lastReport ? `report #${lastReport.seq}, ${formatAge(data.nowSec - desk.tObs)} ago` : undefined} />
              <Stat label="Pool V (clim) now" value={formatBp(pipsToBp(quote.feePips), 2)} hint={<ModeBadge mode={quote.mode} />} />
              <Stat label="Pool S (fixed)" value={formatBp(pipsToBp(staticFeePips), 2)} hint="fixed in its PoolKey" />
            </div>
            <div className="mt-4">
              <FeeCurveChart sigmaNowPct={sigmaPct} feeNowBp={pipsToBp(quote.feePips)} staticFeeBp={pipsToBp(staticFeePips)} />
            </div>
            <p className="mt-2 rounded-md bg-surface-2 px-4 py-3 text-sm leading-relaxed">
              {feeReason({ pool, quote, sigmaPct, staticFeePips, feeMinPips: params.feeMinPips, feeSafePips: params.feeSafePips, tauKillSec: params.tauKillSec })}
            </p>
            <p className="mt-2 text-xs text-fg-subtle">
              No transaction changes the fee: it is computed inside your swap from the latest report, the same in both directions and for any size.
            </p>
          </>
        )}
      </Panel>

      <section aria-labelledby="swap-title" className="rounded-lg bg-surface p-3 shadow-[var(--clim-shadow-lift)]">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <h2 id="swap-title" className="font-display text-[22px] tracking-[-0.02em]">
            Swap
          </h2>
          <span className="text-xs text-fg-subtle">PoolSwapTest · Sepolia</span>
        </div>
        <PoolCards
          value={pool}
          onChange={setPool}
          options={[
            { value: "V", title: "Pool V · clim", subtitle: "fee set by the weather", fee: feeVBp === undefined ? "…" : formatBp(feeVBp, 2), badge: quote ? <ModeBadge mode={quote.mode} /> : null },
            { value: "S", title: "Pool S · fixed", subtitle: "fee fixed in its PoolKey", fee: formatBp(pipsToBp(staticFeePips), 2) },
          ]}
        />
        <div className="mt-2">
          <AmountBox
            id="swap-in"
            label="You pay"
            value={amount}
            onChange={setAmount}
            symbol={inSymbol}
            error={planError}
            hint={inUsd === undefined ? " " : `≈ $${formatAmount(inUsd, 2)}`}
          />
          <FlipButton onClick={flip} label={side === "sell ETH" ? "Buy tETH instead" : "Sell tETH instead"} />
          <AmountBox
            id="swap-out"
            label="You receive, before price impact"
            value={estimate === undefined ? "" : formatAmount(estimate, side === "sell ETH" ? 2 : 6)}
            symbol={outSymbol}
            hint={estimate === undefined ? " " : `≈ $${formatAmount(usdOf(estimate, outSymbol) ?? 0, 2)}`}
          />
        </div>
        <div className="mt-2 px-2">
          <DetailRow label="Fee">
            {feePips === undefined ? "…" : `${formatBp(pipsToBp(feePips), 2)} = ${formatAmount(amountIn * (feePips / 1e6), side === "sell ETH" ? 6 : 2)} ${inSymbol}`}
          </DetailRow>
          <DetailRow label="Price">{ethUsd === undefined ? "…" : `1 tETH ≈ ${formatAmount(ethUsd, 2)} tUSD`}</DetailRow>
          <DetailRow label="Route">
            <span className="inline-flex items-center gap-1.5">
              <TokenIcon symbol={inSymbol} className="size-4" />→ pool {pool} →<TokenIcon symbol={outSymbol} className="size-4" />
            </span>
          </DetailRow>
        </div>
        <div className="mt-3 space-y-3 px-1">
          <ActionButton mode={mode} block disabled={!plan || flow.running || estimate === undefined} onClick={submit}>
            {flow.running ? "Swapping…" : `Swap on pool ${pool}`}
          </ActionButton>
          <TxModeSwitch mode={mode} onChange={setMode} ready={ready} />
          <TxSteps steps={flow.steps} live={mode === "chain"} />
          {result && paid ? (
            <div className="rounded-md bg-surface-2 px-4 py-3 text-sm">
              <p className="font-medium">
                Fee paid: {formatBp(pipsToBp(result.swap.fee), 2)}, read from the Swap event{result.live ? "" : " (simulated)"}.
              </p>
              <p className="mt-0.5 text-fg-muted">
                You paid {paid.paid} and received {paid.got}. <TxLink hash={result.swap.txHash} live={result.live} />
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
