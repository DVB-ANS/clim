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
 * The app's header: wordmark back to the landing (the "home" transition: the app fades out, the
 * landing rises in), the pages in Rare UI's gooey nav (its own row, scrolling sideways, below lg), the
 * network and the wallet. Solid white, so it snapshots cleanly in the launch transition.
 *
 * Nothing moves when the wallet button arrives. RainbowKit renders it only after hydration, so its
 * slot is reserved at the "Connect Wallet" button's size (146 x 40 px), and from lg the nav sits in
 * the middle track of a 1fr / auto / 1fr grid, centred whatever the wallet's width.
 */
export function AppHeader() {
  return (
    <header data-app-header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          transitionTypes={["home"]}
          aria-label="clim home"
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent lg:justify-self-start"
        >
          <Wordmark className="text-[26px]" />
        </Link>
        <GooeyNav
          aria-label="App"
          items={NAV}
          className="order-last w-full min-w-0 lg:order-none lg:w-auto"
        />
        <div className="flex shrink-0 items-center gap-4 lg:justify-self-end">
          <span className="text-sm text-fg-subtle">Sepolia</span>
          <div className="flex min-h-10 min-w-[146px] items-center justify-end">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
