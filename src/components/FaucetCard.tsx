"use client";

import { MOCK_FAUCET } from "@/hooks/useLpState";
import { formatAmount } from "@/lib/units";
import { ActionButton, type TxMode } from "./TxModeSwitch";
import { Panel, Stat } from "./ui";

/** TestToken.faucet() on tETH and tUSD, and the wallet's balances. */
export function FaucetCard({ mode, balances, busy, onFaucet }: {
  mode: TxMode;
  balances?: { tETH: number; tUSD: number };
  busy: boolean;
  onFaucet: () => void;
}) {
  return (
    <Panel
      title="Test tokens"
      subtitle={
        mode === "mock"
          ? `Simulated faucet: +${MOCK_FAUCET.tETH} tETH and +${formatAmount(MOCK_FAUCET.tUSD, 0)} tUSD per call.`
          : "TestToken.faucet() sends a fixed amount to your address, once per cooldown."
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Your tETH" value={balances ? formatAmount(balances.tETH, 4) : "–"} />
        <Stat label="Your tUSD" value={balances ? formatAmount(balances.tUSD, 2) : "–"} />
      </div>
      {mode === "chain" && !balances ? <p className="mt-2 text-xs text-fg-subtle">Connect a wallet on Sepolia to read your balances.</p> : null}
      <div className="mt-3">
        <ActionButton mode={mode} disabled={busy} onClick={onFaucet}>
          Get tETH and tUSD
        </ActionButton>
      </div>
    </Panel>
  );
}
