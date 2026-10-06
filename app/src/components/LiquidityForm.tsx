"use client";

import { type ReactNode, useState } from "react";
import { parseAmount, type PoolName } from "@/lib/swap";
import { formatAmount } from "@/lib/units";
import { AmountBox, DetailRow, PoolCards, type PoolOption } from "./dex";
import { ActionButton, type TxMode } from "./TxModeSwitch";

export type AddQuote = { liquidity: number; eth: number; usd: number };

/** The full-range band from tick −887,220 to +887,220, drawn as a price axis with the pool price on it. */
function FullRange() {
  return (
    <div className="rounded-lg bg-surface-2 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-subtle">Price range</span>
        <span className="rounded-full bg-signal/12 px-2.5 py-0.5 text-xs font-medium text-signal">Full range</span>
      </div>
      <div className="relative mt-4 h-8">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-signal/25" />
        <div className="absolute left-1/2 top-0 h-8 w-0.5 -translate-x-1/2 rounded-full bg-fg" />
      </div>
      <div className="mt-1 flex justify-between text-xs text-fg-subtle">
        <span>0</span>
        <span>pool price</span>
        <span>∞</span>
      </div>
    </div>
  );
}

/** Full-range deposit on V or S: the tETH amount sets the liquidity, the tUSD side follows from the pool price. */
export function LiquidityForm({ mode, busy, balances, quote, onAdd, pools, ethUsd, children }: {
  mode: TxMode;
  busy: boolean;
  balances?: { tETH: number; tUSD: number };
  quote: (pool: PoolName, eth: number) => AddQuote | null;
  onAdd: (pool: PoolName, eth: number) => void;
  pools: PoolOption<PoolName>[];
  ethUsd?: number;
  children?: ReactNode;
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
  const value = q && ethUsd !== undefined ? q.eth * ethUsd + q.usd : undefined;

  return (
    <section aria-labelledby="add-title" className="rounded-lg bg-surface p-3 shadow-[var(--clim-shadow-lift)]">
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <h2 id="add-title" className="font-display text-[22px] tracking-[-0.02em]">
          Add liquidity
        </h2>
        <span className="text-xs text-fg-subtle">PoolModifyLiquidityTest · Sepolia</span>
      </div>
      <PoolCards value={pool} onChange={setPool} options={pools} />
      <div className="mt-2 space-y-2">
        <AmountBox
          id="lp-eth"
          label="Deposit"
          value={amount}
          onChange={setAmount}
          symbol="tETH"
          error={error}
          hint={balances ? `Balance ${formatAmount(balances.tETH, 4)} tETH` : " "}
        />
        <AmountBox
          id="lp-usd"
          label="And, at the pool price"
          value={q ? formatAmount(q.usd, 2) : ""}
          symbol="tUSD"
          hint={balances ? `Balance ${formatAmount(balances.tUSD, 2)} tUSD` : " "}
        />
        <FullRange />
      </div>
      <div className="mt-2 px-2">
        <DetailRow label="Position value">{value === undefined ? "…" : `≈ $${formatAmount(value, 2)}`}</DetailRow>
        <DetailRow label="Held by">the test router, salt = your address</DetailRow>
      </div>
      {short ? <p className="mt-1 px-2 text-sm text-degraded">Not enough test tokens for this deposit: use the faucet above.</p> : null}
      <div className="mt-3 space-y-3 px-1">
        <ActionButton mode={mode} block disabled={!q || short || busy} onClick={() => onAdd(pool, eth)}>
          {busy ? "Working…" : `Approve and add to pool ${pool}`}
        </ActionButton>
        {children}
        <p className="text-xs text-fg-subtle">
          The router keeps users apart by salt, which is not an access control: fine on a testnet with test tokens, not in production.
        </p>
      </div>
    </section>
  );
}
