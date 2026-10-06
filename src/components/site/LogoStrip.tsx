const NAMES = ["Coinbase", "Kraken", "Binance", "Hyperliquid", "Deribit", "Chainlink", "Uniswap"];

/** Ventriloc's partner strip: who measures the weather, who agrees on it, where it is charged. */
export function LogoStrip() {
  return (
    <section aria-label="Built on" className="mx-auto max-w-[1200px] px-4 py-10">
      <p className="text-[13px] text-brass">Measured on four venues and Deribit · agreed by Chainlink CRE · charged in a Uniswap v4 hook</p>
      <ul className="mt-5 flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
        {NAMES.map((n) => (
          <li key={n} className="font-display text-[22px] font-medium tracking-[-0.03em] text-fg/80">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}
