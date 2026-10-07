import { LOGOS } from "./logos";

// What clim runs on, in the order a report travels: the venues, the oracle, the chain, the DEX.
// Hyperliquid and Deribit have no open mark in @web3icons, so they stay wordmarks.
const STACK = ["Coinbase", "Kraken", "Binance", "Hyperliquid", "Deribit", "Chainlink", "Ethereum", "Uniswap"];

function Mark({ name }: { name: string }) {
  const logo = LOGOS[name];
  return (
    <li className="flex items-center gap-2.5 text-fg/75 transition-colors hover:text-fg">
      {logo ? (
        <svg viewBox={logo.viewBox} className="size-8" aria-hidden dangerouslySetInnerHTML={{ __html: logo.body }} />
      ) : null}
      <span className="font-display text-[22px] font-medium tracking-[-0.03em]">{name}</span>
    </li>
  );
}

/** Ventriloc's partner strip, with the stack's own marks: who measures, who takes the median, where it is charged. */
export function LogoStrip() {
  return (
    <section aria-label="Built on" className="rise-in mx-auto max-w-[1200px] px-4 py-12">
      <p className="text-[13px] text-deep">
        Measured on four venues (Deribit DVOL logged alongside) · their median taken by a <span className="font-medium">Chainlink CRE</span> workflow · charged in a{" "}
        <span className="font-medium">Uniswap v4</span> hook on <span className="font-medium">Ethereum</span>
      </p>
      <ul className="mt-6 flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
        {STACK.map((n) => (
          <Mark key={n} name={n} />
        ))}
      </ul>
    </section>
  );
}
