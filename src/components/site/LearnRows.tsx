import Link from "next/link";

const ROWS = [
  { href: "/how", title: "How the desk works", text: "The CRE workflow, RiskDesk's checks and the fee formula, step by step." },
  { href: "/how#faq", title: "Questions a judge would ask", text: "Who pays the higher fee, what if a venue lags or lies, what if the desk stops." },
  { href: "/replay", title: "Replay the 4 Feb storm", text: "Pool V against pool S, report by report, on fixture data." },
  { href: "/lab", title: "The lab", text: "Backtests against a static fee, at equal average fee and at equal cost to traders." },
  { href: "https://docs.chain.link/cre", title: "Chainlink CRE ↗", text: "The runtime the risk desk's workflow runs on." },
  { href: "https://docs.uniswap.org/contracts/v4/overview", title: "Uniswap v4 hooks ↗", text: "How a hook sets a pool's fee inside every swap." },
];

const row = "group grid items-center gap-x-8 gap-y-1 border-t border-line py-7 md:grid-cols-[300px_minmax(0,1fr)_28px]";

function Arrow() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden className="hidden size-7 text-deep transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1 md:block">
      <path d="M6 14h15M15 8l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Go deeper": hairline rows into the app's own pages and the docs (after Uniswap's landing rows). */
export function LearnRows() {
  return (
    <section id="learn" aria-labelledby="learn-title" className="anchor mx-auto max-w-[1200px] px-4 py-24">
      <h2 id="learn-title" className="font-display text-[40px] font-normal leading-[1] tracking-[-0.02em] md:text-[52px]">
        Go deeper
      </h2>
      <ul className="mt-10 border-b border-line">
        {ROWS.map((r) => {
          const body = (
            <>
              <span className="font-display text-[22px] tracking-[-0.01em] decoration-signal decoration-1 underline-offset-4 group-hover:underline group-focus-visible:underline">{r.title}</span>
              <span className="text-[15px] text-fg-muted">{r.text}</span>
              <Arrow />
            </>
          );
          return (
            <li key={r.href}>
              {r.href.startsWith("http") ? (
                <a href={r.href} target="_blank" rel="noreferrer" className={row}>
                  {body}
                </a>
              ) : (
                <Link href={r.href} className={row}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
