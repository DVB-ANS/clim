import Link from "next/link";
import { WordReveal } from "./WordReveal";

const SENTENCE =
  "A static pool charges the same fee in a calm and in a storm. When ETH lurches, arbitrageurs trade against the stale price, and the LPs pay for it. clim lets the fee read the weather.";

/** The first beat after the hero: why a fee should read the weather. No figures here, so nothing to fake. */
export function ProblemSection() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="anchor mx-auto max-w-[1200px] px-4 py-24 md:py-32">
      <p className="text-[13px] text-fg-subtle">The problem</p>
      <h2 id="problem-title" className="sr-only">
        Why clim
      </h2>
      <WordReveal
        text={SENTENCE}
        tone={{ storm: "text-sigma", clim: "text-signal" }}
        className="mt-5 max-w-[30ch] font-display text-[34px] leading-[1.08] tracking-[-0.02em] sm:text-[44px] md:text-[52px]"
      />
      <p className="mt-8 max-w-xl text-[13px] leading-relaxed text-fg-muted">
        The cost has a name: loss-versus-rebalancing (Milionis, Moallemi, Roughgarden &amp; Zhang, 2022).{" "}
        <Link href="/how" className="text-link text-fg underline">
          How clim prices it →
        </Link>
      </p>
    </section>
  );
}
