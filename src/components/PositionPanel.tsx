"use client";

import type { PositionView } from "@/lib/liquidity";
import type { PoolName } from "@/lib/swap";
import { utcTime } from "@/lib/theme";
import { formatAmount, formatUsdCents } from "@/lib/units";
import { ActionButton, type TxMode } from "./TxModeSwitch";
import { Panel, Stat } from "./ui";

const POOL_LABEL: Record<PoolName, string> = { V: "Pool V · clim", S: "Pool S · fixed fee" };
const DOT: Record<PoolName, string> = { V: "bg-v", S: "bg-s" };

/** "Your position": value, fees, and the P&L of the same liquidity in the twin pool. */
export function PositionPanel({ mode, views, busy, onRemove }: {
  mode: TxMode;
  views: PositionView[];
  busy: boolean;
  onRemove: (pool: PoolName) => void;
}) {
  return (
    <Panel
      title="Your position"
      subtitle={
        mode === "mock"
          ? "Simulated: valued at the pool price, with fees and P&L as your share of the pool's series over the whole simulated window."
          : "Liquidity and uncollected fees read from Uniswap v4's StateView; P&L is your share of the pool's series since you added liquidity."
      }
    >
      {views.length === 0 ? (
        <p className="text-sm text-fg-subtle">No position yet. Get test tokens, then add liquidity to pool V or pool S.</p>
      ) : (
        <div className="space-y-4">
          {views.map((v) => {
            const diff = v.pnlUsd - v.pnlOtherUsd;
            return (
              <div key={v.pool} className="rounded-md border border-line p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[v.pool]}`} />
                  {POOL_LABEL[v.pool]}
                  <span className="text-xs font-normal text-fg-subtle">since {utcTime(v.sinceSec)} UTC</span>
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Stat label="Share of the pool" value={`${formatAmount(v.share * 100, 3)}%`} />
                  <Stat label="Value" value={formatUsdCents(v.valueUsd)} hint={`${formatAmount(v.amountEth, 4)} tETH + ${formatAmount(v.amountUsd, 2)} tUSD`} />
                  <Stat
                    label="Fees earned"
                    value={formatUsdCents(v.feesUsd)}
                    hint={v.feesSource === "on-chain" ? "uncollected, on-chain" : "your share of the pool's fees"}
                  />
                  <Stat label="Your P&L" value={formatUsdCents(v.pnlUsd)} hint="retail fees − arbitrage, hedged" />
                  <Stat label={`If you had been in ${v.otherPool}`} value={formatUsdCents(v.pnlOtherUsd)} hint="same liquidity, same period" />
                </div>
                <p className="mt-2 text-sm text-fg-muted">
                  {Math.abs(diff) < 0.005
                    ? `Over this period, pool ${v.pool} and pool ${v.otherPool} paid this liquidity the same.`
                    : `Over this period, pool ${v.pool} paid this liquidity ${formatUsdCents(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than pool ${v.otherPool} would have.`}
                </p>
                <div className="mt-3">
                  <ActionButton mode={mode} disabled={busy} onClick={() => onRemove(v.pool)}>
                    Remove all liquidity from pool {v.pool}
                  </ActionButton>
                  {mode === "chain" ? <span className="ml-2 text-xs text-fg-subtle">Removing also collects the fees.</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
