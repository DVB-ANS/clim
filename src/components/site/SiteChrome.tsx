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

export const pillDark = "inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-5 text-[15px] text-surface hover:opacity-90";
export const pillOutline = "inline-flex min-h-11 items-center gap-2 rounded-full border border-fg px-5 text-[15px] text-fg hover:bg-fg hover:text-surface";

/** Ventriloc's header: wordmark, the navigation in an Ash pill, the network in Slate, a dark pill CTA. */
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
          <LaunchLink boot={boot} className={pillDark}>
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
    <span aria-hidden className={`pointer-events-none absolute select-none font-display leading-none text-ember ${className}`}>
      °
    </span>
  );
}

export function CtaPanel({ boot }: { boot: BootValues }) {
  return (
    <section aria-labelledby="cta-title" className="relative mx-auto max-w-[1200px] overflow-hidden rounded-lg bg-fg px-6 py-14 text-surface md:px-14 md:py-20">
      <GiantDegree className="-right-10 -top-28 text-[460px] md:text-[620px]" />
      <div className="relative max-w-xl">
        <h2 id="cta-title" className="font-display text-[44px] font-normal leading-[0.98] tracking-[-0.02em] md:text-[56px]">
          Read the weather. Then swap.
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-surface/75">
          The live desk, the fee before you pay it, and full-range liquidity on V or S, with a faucet for test tokens.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LaunchLink boot={boot} className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-[15px] text-fg hover:opacity-90">
            Launch app
          </LaunchLink>
          <Link href="/lp" className="inline-flex min-h-11 items-center rounded-full border border-surface/60 px-5 text-[15px] text-surface hover:bg-surface hover:text-fg">
            Provide liquidity
          </Link>
        </div>
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
    <footer className="relative mx-2 mb-2 overflow-hidden rounded-lg bg-fg px-6 pb-8 pt-12 text-surface md:px-14">
      <GiantDegree className="-bottom-24 -right-6 text-[360px] md:-bottom-40 md:text-[560px]" />
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
