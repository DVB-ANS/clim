"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { linkCls } from "./ui";

/**
 * The line above /swap's and /lp's actions: real Sepolia transactions, signed by the visitor's wallet. When
 * this build has no test tokens or routers (never in production, which builds from the synced deployment),
 * it says why the actions are off instead.
 */
export function ChainNote({ ready }: { ready: { ok: boolean; reason?: string } }) {
  if (!ready.ok) return <p className="text-xs text-notice-fg">{ready.reason}</p>;
  return (
    <p className="text-xs leading-relaxed text-fg-subtle">
      Real transactions on Ethereum Sepolia, signed by your wallet, with test tokens only. Gas is paid in Sepolia ETH:{" "}
      <Link className={linkCls} href="/swap#try">
        how to get some
      </Link>
      . No wallet?{" "}
      <Link className={linkCls} href="/app#verify">
        Check it on the dashboard
      </Link>
      .
    </p>
  );
}

/** The main action: asks to connect a wallet, then to switch to Sepolia, before running on-chain. */
export function ActionButton({ disabled, block, onClick, children }: { disabled?: boolean; block?: boolean; onClick: () => void; children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const cls = `inline-flex items-center justify-center rounded-full bg-accent px-5 font-medium text-accent-fg transition-[filter,opacity] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${block ? "min-h-14 w-full text-[17px]" : "min-h-11 text-[15px]"}`;
  if (!isConnected) {
    return <button type="button" className={cls} onClick={openConnectModal}>Connect a wallet</button>;
  }
  if (chainId !== sepolia.id) {
    return <button type="button" className={cls} onClick={openChainModal}>Switch to Sepolia</button>;
  }
  return <button type="button" className={cls} disabled={disabled} onClick={onClick}>{children}</button>;
}
