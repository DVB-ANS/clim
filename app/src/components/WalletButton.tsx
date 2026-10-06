"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/** Connect, account and network status; RainbowKit offers the switch to Sepolia on any other chain. */
export function WalletButton() {
  return <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />;
}
