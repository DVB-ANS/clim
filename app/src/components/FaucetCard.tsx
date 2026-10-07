"use client";

import { MOCK_FAUCET } from "@/hooks/useLpState";
import { FAUCET } from "@/lib/guide";
import { formatAmount } from "@/lib/units";
import { TokenIcon } from "./dex";
import { ActionButton, type TxMode } from "./TxModeSwitch";

/** TestToken.faucet() on tETH and tUSD, and the wallet's balances, as one strip above the pools. */
export function FaucetCard({ mode, balances, busy, onFaucet }: {
  mode: TxMode;
  balances?: { tETH: number; tUSD: number };
  busy: boolean;
  onFaucet: () => void;
}) {
  return (
    <section id="faucet" aria-label="Test tokens" className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--clim-line)] md:px-6">
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg tracking-[-0.02em]">Test tokens</p>
        <p className="text-xs text-fg-subtle">
          {mode === "mock"
            ? `Simulated faucet: +${MOCK_FAUCET.tETH} tETH and +${formatAmount(MOCK_FAUCET.tUSD, 0)} tUSD per call.`
            : `Two transactions: ${FAUCET.tETH} tETH, then ${formatAmount(FAUCET.tUSD, 0)} tUSD, once an hour per address. Gas is paid in Sepolia ETH.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {(["tETH", "tUSD"] as const).map((t) => (
          <span key={t} className="flex items-center gap-2">
            <TokenIcon symbol={t} className="size-7" />
            <span>
              <span className="block font-display text-lg leading-none tabular-nums">{balances ? formatAmount(balances[t], t === "tETH" ? 4 : 2) : "–"}</span>
              <span className="text-xs text-fg-subtle">{t}</span>
            </span>
          </span>
        ))}
      </div>
      <ActionButton mode={mode} disabled={busy} onClick={onFaucet}>
        Get tETH and tUSD
      </ActionButton>
      {mode === "chain" && !balances ? <p className="basis-full text-xs text-fg-subtle">Connect a wallet on Sepolia to read your balances.</p> : null}
    </section>
  );
}
