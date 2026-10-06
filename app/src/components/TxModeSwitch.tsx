"use client";

import { useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";

export type TxMode = "mock" | "chain";

/**
 * Real Sepolia transactions once the synced deployment has the live pair and the tokens: then on-chain is
 * the only mode, with no switch and no simulated label (production always builds from the synced
 * deployment). The simulated flow is a fallback for a build without contracts only.
 */
export function TxModeSwitch({ mode, onChange, ready }: { mode: TxMode; onChange: (m: TxMode) => void; ready: { ok: boolean; reason?: string } }) {
  if (ready.ok) return <p className="text-xs text-fg-subtle">Real transactions on Ethereum Sepolia, signed by your wallet; test tokens only.</p>;
  const tab = (m: TxMode, label: string, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      className={`rounded-full px-3.5 py-1.5 ${mode === m ? "bg-surface text-fg shadow-[0_0_0_1px_var(--clim-line)]" : "text-fg-muted hover:text-fg"} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="inline-flex gap-1 rounded-full bg-surface-2 p-1 text-sm">
        {tab("mock", "Simulated")}
        {tab("chain", "On-chain (Sepolia)", !ready.ok)}
      </div>
      {!ready.ok ? <p className="mt-1 text-xs text-notice-fg">{ready.reason}</p> : null}
      {mode === "mock" ? <p className="mt-1 text-xs text-fg-subtle">Simulated: the same steps and receipts, with fake hashes and no wallet needed.</p> : null}
    </div>
  );
}

/** The main action: asks to connect a wallet, then to switch to Sepolia, before running on-chain. */
export function ActionButton({ mode, disabled, block, onClick, children }: { mode: TxMode; disabled?: boolean; block?: boolean; onClick: () => void; children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const cls = `inline-flex items-center justify-center rounded-full bg-accent px-5 font-medium text-accent-fg transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${block ? "min-h-14 w-full text-[17px]" : "min-h-11 text-[15px]"}`;
  if (mode === "chain" && !isConnected) {
    return <button type="button" className={cls} onClick={openConnectModal}>Connect a wallet</button>;
  }
  if (mode === "chain" && chainId !== sepolia.id) {
    return <button type="button" className={cls} onClick={openChainModal}>Switch to Sepolia</button>;
  }
  return <button type="button" className={cls} disabled={disabled} onClick={onClick}>{children}</button>;
}
