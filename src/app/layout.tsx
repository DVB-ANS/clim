import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { WalletProviders } from "@/components/WalletProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "clim: storm insurance for Uniswap v4 LPs",
  description: "A Chainlink CRE risk desk publishes ETH volatility on-chain; a Uniswap v4 hook turns it into the LP fee on every swap.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/replay", label: "Replay" },
  { href: "/lab", label: "Lab" },
  { href: "/how", label: "How it works" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "Liquidity" },
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <WalletProviders>
          <header className="border-b border-line bg-surface">
            <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold">clim</Link>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-sm text-fg-muted hover:text-fg">{n.label}</Link>
              ))}
              <span className="ml-auto text-xs text-fg-subtle">Ethereum Sepolia · Chainlink CRE · Uniswap v4</span>
              <WalletButton />
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </WalletProviders>
      </body>
    </html>
  );
}
