"use client";

import type { PositionView } from "@/lib/liquidity";
import type { PoolName } from "@/lib/swap";
import { utcTime } from "@/lib/theme";
import { formatAmount, formatTusdCents } from "@/lib/units";
import { TokenIcon } from "./dex";
import { ActionButton } from "./ChainNote";

const POOL_LABEL: Record<PoolName, string> = { V: "Pool V · clim", S: "Pool S · static twin" };

const BAR: Record<PoolName, string> = { V: "bg-v", S: "bg-s" };

/** Two bars on one scale, each in its pool's colour: this position's P&L and the same liquidity's in the twin pool. */
function Compare({ mine, other, pool, otherPool }: { mine: number; other: number; pool: PoolName; otherPool: PoolName }) {
  const max = Math.max(Math.abs(mine), Math.abs(other), 1e-9);
  const bar = (v: number, cls: string, label: string) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="text-fg-subtle">{label}</span>
      <span className="h-2.5 rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${cls}`} style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, opacity: v < 0 ? 0.45 : 1 }} />
      </span>
      <span className="whitespace-nowrap text-right tabular-nums">{formatTusdCents(v)}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      {bar(mine, BAR[pool], `Yours, in pool ${pool}`)}
      {bar(other, BAR[otherPool], `In pool ${otherPool}`)}
    </div>
  );
}

/** "Your positions": value, fees, and the P&L of the same liquidity in the twin pool. */
export function PositionPanel({ off, views, busy, onRemove }: {
  /** On-chain writes are off in this build (no live pair or tokens): ChainNote says why. */
  off?: boolean;
  views: PositionView[];
  busy: boolean;
  onRemove: (pool: PoolName) => void;
}) {
  return (
    <section aria-labelledby="positions-title" className="space-y-3">
      <div>
        <h2 id="positions-title" className="font-display text-[22px] tracking-[-0.02em]">
          Your positions
        </h2>
        <p className="text-sm text-fg-subtle">
          {"Liquidity and uncollected fees from Uniswap v4's StateView; P&L as your share of the pool's series since you added liquidity."}
        </p>
      </div>
      {views.length === 0 ? (
        <div className="grid place-items-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-lg">No position yet</p>
          <p className="mt-1 max-w-sm text-sm text-fg-subtle">Get test tokens, pick pool V or pool S, and add full-range liquidity: the position shows up here, live.</p>
        </div>
      ) : (
        views.map((v) => {
          const diff = v.pnlUsd - v.pnlOtherUsd;
          return (
            <article key={v.pool} className="rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--clim-line)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex -space-x-1.5">
                  <TokenIcon symbol="tETH" className="size-6 ring-2 ring-surface" />
                  <TokenIcon symbol="tUSD" className="size-6 ring-2 ring-surface" />
                </span>
                <span className="font-medium">{POOL_LABEL[v.pool]}</span>
                <span className="rounded-full bg-signal/12 px-2 py-0.5 text-xs text-signal">Full range</span>
                <span className="ml-auto text-xs text-fg-subtle">since {utcTime(v.sinceSec)} UTC</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-fg-subtle">Value</p>
                  <p className="font-display text-[26px] leading-tight tracking-[-0.02em] tabular-nums">{formatTusdCents(v.valueUsd)}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatAmount(v.amountEth, 4)} tETH + {formatAmount(v.amountUsd, 2)} tUSD
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">Fees earned</p>
                  <p className="font-display text-[26px] leading-tight tracking-[-0.02em] tabular-nums">{formatTusdCents(v.feesUsd)}</p>
                  <p className="text-xs text-fg-subtle">{v.feesSource === "on-chain" ? "uncollected, on-chain" : "your share of the pool's fees"}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-subtle">Share of the pool</p>
                  <p className="font-display text-[26px] leading-tight tracking-[-0.02em] tabular-nums">{formatAmount(v.share * 100, 3)}%</p>
                </div>
              </div>
              <div className="mt-5">
                <Compare mine={v.pnlUsd} other={v.pnlOtherUsd} pool={v.pool} otherPool={v.otherPool} />
                <p className="mt-3 text-sm text-fg-muted">
                  {Math.abs(diff) < 0.005
                    ? `Over this period, pool ${v.pool} and pool ${v.otherPool} paid this liquidity the same.`
                    : `Over this period, pool ${v.pool} paid this liquidity ${formatTusdCents(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than pool ${v.otherPool} would have (retail fees − arbitrage, hedged).`}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ActionButton disabled={off || busy} onClick={() => onRemove(v.pool)}>
                  Remove all liquidity
                </ActionButton>
                <span className="text-xs text-fg-subtle">Removing also collects the fees.</span>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
