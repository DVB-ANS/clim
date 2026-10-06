"use client";

import { useState } from "react";
import { parseAmount, type PoolName } from "@/lib/swap";
import { formatAmount } from "@/lib/units";
import { ActionButton, type TxMode } from "./TxModeSwitch";
import { Panel, Toggle } from "./ui";

export type AddQuote = { liquidity: number; eth: number; usd: number };

/** Full-range deposit on V or S: the tETH amount sets the liquidity, the tUSD side follows from the pool price. */
export function LiquidityForm({ mode, busy, balances, quote, onAdd }: {
  mode: TxMode;
  busy: boolean;
  balances?: { tETH: number; tUSD: number };
  quote: (pool: PoolName, eth: number) => AddQuote | null;
  onAdd: (pool: PoolName, eth: number) => void;
}) {
  const [pool, setPool] = useState<PoolName>("V");
  const [amount, setAmount] = useState("1");

  let eth = 0;
  let error: string | null = null;
  try {
    eth = Number(parseAmount(amount)) / 1e18;
  } catch (e) {
    error = e instanceof Error ? e.message.replace(/^amount: /, "") : String(e);
  }
  const q = error ? null : quote(pool, eth);
  const short = q && balances ? q.eth > balances.tETH || q.usd > balances.tUSD : false;

  return (
    <Panel title="Add liquidity" subtitle="Full range, through Uniswap v4's PoolModifyLiquidityTest router on Sepolia.">
      <div className="space-y-3">
        <Toggle value={pool} onChange={setPool} options={[{ value: "V", label: "Pool V · clim" }, { value: "S", label: "Pool S · fixed fee" }]} />
        <label className="block text-sm">
          <span className="text-xs text-fg-subtle">You deposit (tETH)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-full rounded-sm border border-line bg-surface px-3 py-2 tabular-nums"
          />
        </label>
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : q ? (
          <p className="text-sm text-fg-muted">+ {formatAmount(q.usd, 2)} tUSD at the pool price, for both sides of a full-range position.</p>
        ) : (
          <p className="text-xs text-fg-subtle">Waiting for the pool price…</p>
        )}
        {short ? <p className="text-xs text-notice-fg">Not enough test tokens for this deposit: use the faucet first.</p> : null}
        <ActionButton mode={mode} disabled={!q || short || busy} onClick={() => onAdd(pool, eth)}>
          {busy ? "Working…" : `Approve and add to pool ${pool}`}
        </ActionButton>
        <p className="text-xs text-fg-subtle">
          The router holds the position under a salt equal to your address. That keeps users apart but is not an access control:
          fine on a testnet with test tokens.
        </p>
      </div>
    </Panel>
  );
}
