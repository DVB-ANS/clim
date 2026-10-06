import Link from "next/link";
import { GooeyNav, type GooeyNavItem } from "./GooeyNav";
import { WalletButton } from "./WalletButton";
import { Wordmark } from "./Wordmark";

const NAV: GooeyNavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "Liquidity" },
  { href: "/replay", label: "Replay" },
  { href: "/lab", label: "Lab" },
  { href: "/how", label: "How it works" },
];

/**
 * The app's header: wordmark back to the landing, the pages in Rare UI's gooey nav (its own row,
 * scrolling sideways, below lg), the network and the wallet. Solid white, so it snapshots cleanly in
 * the launch transition.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 lg:flex-nowrap">
        <Link
          href="/"
          aria-label="clim home"
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <Wordmark className="text-[26px]" />
        </Link>
        <GooeyNav
          aria-label="App"
          items={NAV}
          className="order-last w-full min-w-0 lg:order-none lg:w-auto"
        />
        <div className="flex shrink-0 items-center gap-4">
          <span className="text-sm text-fg-subtle">Sepolia</span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
