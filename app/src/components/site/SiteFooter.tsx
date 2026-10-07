import Link from "next/link";
import { Wordmark } from "../Wordmark";
import { LaunchLink } from "./LaunchLink";

const FOOT = [
  { title: "app", links: [{ href: "/app", label: "Dashboard" }, { href: "/swap", label: "Swap" }, { href: "/lp", label: "Liquidity" }] },
  { title: "desk", links: [{ href: "/replay", label: "Replay" }, { href: "/lab", label: "Lab" }, { href: "/how", label: "How it works" }, { href: "/how#contracts", label: "Contracts" }] },
  {
    title: "built on",
    links: [
      { href: "https://docs.chain.link/cre", label: "Chainlink CRE ↗" },
      { href: "https://docs.uniswap.org/contracts/v4/overview", label: "Uniswap v4 ↗" },
      { href: "https://sepolia.etherscan.io", label: "Ethereum Sepolia ↗" },
    ],
  },
];

/** External links open a new tab; the way into the app opens it from the link, like "Launch app". */
function FootLink({ href, children, className = "" }: { href: string; children: string; className?: string }) {
  return href.startsWith("http") ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : href === "/app" ? (
    <LaunchLink className={className}>{children}</LaunchLink>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** The landing's footer, light like the rest: links, one discreet "Licenses" link to /credits, and the wordmark's giant degree sign in pink. */
export function SiteFooter({ simulated }: { simulated: boolean }) {
  return (
    <footer className="relative mx-2 mb-2 overflow-hidden rounded-lg bg-surface-2 px-6 pb-8 pt-12 text-fg md:px-14">
      <span aria-hidden className="degree-in pointer-events-none absolute -bottom-24 -right-6 hidden select-none sm:block font-display text-[360px] leading-none text-pink-soft md:-bottom-40 md:text-[560px]">
        °
      </span>
      <div className="relative flex flex-wrap items-center gap-4">
        <Wordmark className="text-[40px]" />
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-fg-muted">Ethereum Sepolia</span>
      </div>
      <div className="relative mt-10 flex flex-wrap gap-x-20 gap-y-8">
        {FOOT.map((c) => (
          <div key={c.title}>
            <p className="font-display text-[17px]">{c.title}</p>
            <ul className="mt-3 space-y-2 text-[15px] text-fg-muted">
              {c.links.map((l) => (
                <li key={l.href}>
                  <FootLink href={l.href} className="hover:text-fg">
                    {l.label}
                  </FootLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative mt-14 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-fg-muted">
        <span>© clim 2026 · TOKEN2049 Origins</span>
        <FootLink href="/credits" className="underline decoration-line underline-offset-2 hover:text-fg">
          Licenses
        </FootLink>
        {simulated ? <span>Simulated data</span> : null}
      </div>
    </footer>
  );
}
