import Link from "next/link";
import { Wordmark } from "../Wordmark";
import type { BootValues } from "./Launch";
import { LaunchLink } from "./LaunchLink";

const NAV = [
  { href: "#desk", label: "desk" },
  { href: "#fee", label: "fee" },
  { href: "#map", label: "storm map" },
  { href: "#safety", label: "safe modes" },
  { href: "/replay", label: "replay" },
];

const pillBlue = "inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] text-accent-fg transition-[filter] hover:brightness-110";

/** Ventriloc's header: wordmark, the navigation in a pill, the network, and Chainlink's blue pill to enter the app. */
export function SiteHeader({ boot }: { boot: BootValues }) {
  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
        <Link href="/" aria-label="clim home">
          <Wordmark className="text-[30px]" />
        </Link>
        <nav aria-label="Site" className="flex flex-wrap items-center gap-0.5 rounded-full bg-surface-2 px-2 py-1 text-[15px] md:mx-auto">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-fg hover:bg-surface">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-5">
          <span className="text-sm text-fg-subtle">Sepolia</span>
          <LaunchLink boot={boot} className={pillBlue}>
            Launch app
          </LaunchLink>
        </div>
      </div>
    </header>
  );
}

/** The degree sign of the wordmark, blown up as Ventriloc does with its bracket. */
function GiantDegree({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute select-none font-display leading-none text-signal ${className}`}>
      °
    </span>
  );
}

/**
 * The closing panel, as at the bottom of Ventriloc: no button, the desk's dark ground growing to the
 * full width as it scrolls in while the giant degree sign turns into place.
 */
export function ClosingPanel() {
  return (
    <section aria-labelledby="closing-title" className="grow-in relative mx-auto max-w-[1200px] overflow-hidden rounded-lg bg-lcd-bg px-6 py-16 text-lcd-lit md:px-14 md:py-24">
      <GiantDegree className="degree-in -right-10 -top-28 text-[460px] md:text-[640px]" />
      <div className="relative max-w-xl">
        <h2 id="closing-title" className="font-display text-[44px] font-normal leading-[0.98] tracking-[-0.02em] text-surface md:text-[60px]">
          Every swap reads the weather.
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-lcd-lit/80">
          Four exchanges, one Chainlink median every 30 seconds, one fee inside every Uniswap v4 swap: cheap when the market is calm, paid
          for the risk when it storms.
        </p>
      </div>
    </section>
  );
}

const FOOT = [
  { title: "app", links: [{ href: "/app", label: "Dashboard" }, { href: "/swap", label: "Swap" }, { href: "/lp", label: "Liquidity" }] },
  { title: "desk", links: [{ href: "/replay", label: "Replay" }, { href: "/lab", label: "Lab" }, { href: "/how", label: "How it works" }] },
  {
    title: "built on",
    links: [
      { href: "https://docs.chain.link/cre", label: "Chainlink CRE ↗" },
      { href: "https://docs.uniswap.org/contracts/v4/overview", label: "Uniswap v4 ↗" },
      { href: "https://sepolia.etherscan.io", label: "Ethereum Sepolia ↗" },
    ],
  },
];

export function SiteFooter({ simulated }: { simulated: boolean }) {
  return (
    <footer className="relative mx-2 mb-2 overflow-hidden rounded-lg bg-lcd-bg px-6 pb-8 pt-12 text-surface md:px-14">
      <GiantDegree className="degree-in -bottom-24 -right-6 text-[360px] md:-bottom-40 md:text-[560px]" />
      <div className="relative flex flex-wrap items-center gap-4">
        <Wordmark tone="light" className="text-[40px]" />
        <span className="rounded-full bg-surface/10 px-3 py-1 text-xs text-surface/80">Ethereum Sepolia</span>
      </div>
      <div className="relative mt-10 flex flex-wrap gap-x-20 gap-y-8">
        {FOOT.map((c) => (
          <div key={c.title}>
            <p className="font-display text-[17px]">{c.title}</p>
            <ul className="mt-3 space-y-2 text-[15px] text-surface/60">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("http") ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="hover:text-surface">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="hover:text-surface">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative mt-16 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-surface/55">
        <span>© clim 2026 · TOKEN2049 Origins</span>
        {simulated ? <span>Simulated data until the contracts are on Sepolia</span> : null}
      </div>
    </footer>
  );
}
