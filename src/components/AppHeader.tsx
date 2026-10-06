"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "Liquidity" },
  { href: "/replay", label: "Replay" },
  { href: "/lab", label: "Lab" },
  { href: "/how", label: "How it works" },
];

/** The app's header: wordmark back to the landing, the pages in a pill, the network and the wallet. */
export function AppHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" aria-label="clim home">
          <Wordmark className="text-[26px]" />
        </Link>
        <nav aria-label="App" className="flex flex-wrap items-center gap-1 rounded-full bg-surface-2 p-1 text-[15px] md:mx-auto">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 ${active ? "bg-surface text-fg shadow-[0_0_0_1px_var(--clim-line)]" : "text-fg-muted hover:text-fg"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm text-fg-subtle">Sepolia</span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
