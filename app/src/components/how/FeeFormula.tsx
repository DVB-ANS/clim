// /how section 2: the hook's fee formula, typeset in native MathML. A server component: no JavaScript ships,
// and on Apple systems and Windows no font either (they have STIX Two Math or Cambria Math, see how.css).
// Every value is read from params.json and the fee math, so the page always describes the deployed hook.
import { Noto_Sans_Math } from "next/font/google";
import type { ReactNode } from "react";
import { params } from "@/lib/config";
import { FEE_SCALE_EXP, feePips, K_E4_NEUTRAL } from "@/lib/feeMath";
import { NT_CONSTANT, predictedPTrade } from "@/lib/ptrade";
import { reachableFeeMaxBp, SIGMA_DESK_MAX_E9, sigmaAtFee } from "@/lib/story";
import { annualPctToSigmaE9, pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";

// The radical, the fences and the fraction bars need a font with a math table; Android and Linux may have
// none, so Noto Sans Math is the last fallback. It has no preloadable subset, so next/font never preloads
// it, and a browser downloads it only when no font before it in the stack is installed.
const mathFallback = Noto_Sans_Math({ weight: "400", variable: "--font-math-fallback", display: "swap", adjustFontFallback: false });

const eta = params.etaE4 / 1e4; // 2.5093, the value the hook uses
const pStarPct = Math.round(params.pStar * 100); // 30
const dtSec = Math.round(2 * (params.sqrtHalfDtE6 / 1e6) ** 2); // 12: sqrtHalfDtE6 is √(Δt/2) × 10⁶
const k = K_E4_NEUTRAL / 1e4; // 1
const floorBp = pipsToBp(params.feeMinPips); // 5
const capBp = pipsToBp(params.feeMaxPips); // 150
/** Digit groups split by a narrow no-break space ("15 000"), so they never read as argument commas. */
const g = (n: number) => n.toLocaleString("en-US").replaceAll(",", "\u202F");

/** An identifier, upright in Inter (an italic math letter would come from the math font instead); σ in pink ink. */
const V = ({ children, sigma }: { children: ReactNode; sigma?: boolean }) => (
  <mi mathvariant="normal" className={sigma ? "text-sigma-ink" : undefined}>
    {children}
  </mi>
);
const Comma = () => (
  <mo separator="true" rspace="0.4em">
    ,
  </mo>
);
/** U+2061, function application: "clamp" is read as a function of what follows. */
const Apply = () => <mo>{"\u2061"}</mo>;
const PStarMath = () => (
  <msup>
    <V>P</V>
    <mo lspace="0" rspace="0">
      {"\u2217"}
    </mo>
  </msup>
);
/** P* inside running text. */
export const PStar = () => (
  <math>
    <PStarMath />
  </math>
);
const Unit = ({ children }: { children: string }) => <mtext className="text-fg-subtle">{`\u2009${children}`}</mtext>;
/** x_En: x × 10ⁿ, stored as an integer. */
const E = ({ children, n }: { children: ReactNode; n: number }) => (
  <msub>
    {children}
    <mtext className="text-fg-subtle">E{n}</mtext>
  </msub>
);
/** A formula wider than a phone scrolls inside its own focusable region rather than the page. */
const Scroll = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
    {children}
  </div>
);

function Def({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-base text-fg">{term}</dt>
      <dd className="mt-1 mb-4 max-w-[72ch] text-[15px] leading-[1.6] text-fg-muted sm:m-0">{children}</dd>
    </>
  );
}

/** The policy in two display lines, what each symbol is, and the same formula in the hook's integers. */
export function FeeFormula() {
  return (
    <div className={`fee-math ${mathFallback.variable} mt-6`}>
      <div className="rounded-md bg-surface-2 px-3.5 py-5 sm:p-6">
        <Scroll label="Fee formula">
          <div className="fee-display flex flex-col items-start gap-3">
            <math display="block">
              <V>premium</V>
              <mo>=</mo>
              <V>η</V>
              <mo>⋅</mo>
              <V sigma>σ</V>
              <mo>⋅</mo>
              <msqrt>
                <mfrac>
                  <V>Δt</V>
                  <mn>2</mn>
                </mfrac>
              </msqrt>
              <mo>⋅</mo>
              <V>k</V>
            </math>
            <math display="block">
              <V>fee</V>
              <mo>=</mo>
              <V>clamp</V>
              <Apply />
              <mrow>
                <mo>(</mo>
                <V>premium</V>
                <Comma />
                <V>floor</V>
                <Comma />
                <V>cap</V>
                <mo>)</mo>
              </mrow>
            </math>
          </div>
        </Scroll>
      </div>

      <dl className="mt-6 sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-baseline sm:gap-x-8 sm:gap-y-2.5">
        <Def
          term={
            <math>
              <V sigma>σ</V>
            </math>
          }
        >
          ETH&apos;s volatility from the desk&apos;s latest report: per square root of a second in the formula, shown in % a year everywhere
          else.
        </Def>
        <Def
          term={
            <math displaystyle="true">
              <V>η</V>
              <mo>=</mo>
              <mfrac>
                <mn>1</mn>
                <PStarMath />
              </mfrac>
              <mo>−</mo>
              <mn>{NT_CONSTANT}</mn>
              <mo>=</mo>
              <mn>{eta.toFixed(3)}</mn>
            </math>
          }
        >
          Sets how much arbitrage the LP accepts: while the fee is above its floor, about <span className="whitespace-nowrap"><PStar /> = {pStarPct}%</span> of blocks carry an arbitrage
          (<PStar /> was chosen by the lab&apos;s backtest). {NT_CONSTANT} is Nezlobin and Tassy&apos;s (2025) correction for fixed block
          times to the model of Milionis, Moallemi and Roughgarden (2023).
        </Def>
        <Def
          term={
            <math>
              <V>Δt</V>
              <mo>=</mo>
              <mn>{dtSec}</mn>
              <Unit>s</Unit>
            </math>
          }
        >
          One Sepolia block.
        </Def>
        <Def
          term={
            <math>
              <V>k</V>
              <mo>=</mo>
              <mn>{k}</mn>
            </math>
          }
        >
          The desk&apos;s model-risk multiplier, between 1 and 2: it can only raise the premium. This build always sends {k}.
        </Def>
        <Def
          term={
            <math>
              <V>clamp</V>
              <Apply />
              <mrow>
                <mo>(</mo>
                <V>x</V>
                <Comma />
                <V>floor</V>
                <Comma />
                <V>cap</V>
                <mo>)</mo>
              </mrow>
            </math>
          }
        >
          Keeps x between the floor, {floorBp}&nbsp;bp ({floorBp / 100}% of the trade, the pair&apos;s usual fee tier), and the cap, {capBp}&nbsp;bp. Both are fixed in the hook for
          good.
        </Def>
      </dl>

      <details className="mt-6 border-y border-line">
        <summary className="flex cursor-pointer items-center justify-between gap-4 py-3 text-sm text-fg">
          The same formula as the contract computes it, in integers
          <span aria-hidden className="faq-plus faq-plus-sm" />
        </summary>
        <div className="pt-1 pb-5">
          <Scroll label="Fee formula in the hook's integers">
            <div className="fee-display-int flex flex-col items-start gap-2.5">
              <math display="block">
                <msub>
                  <V>premium</V>
                  <mtext className="text-fg-subtle">pips</mtext>
                </msub>
                <mo>=</mo>
                <mrow>
                  <mo>⌈</mo>
                  <mfrac>
                    <mrow>
                      <E n={9}>
                        <V sigma>σ</V>
                      </E>
                      <mo>⋅</mo>
                      <E n={4}>
                        <V>η</V>
                      </E>
                      <mo>⋅</mo>
                      <E n={6}>
                        <mrow>
                          <mo>(</mo>
                          <msqrt>
                            <mfrac>
                              <V>Δt</V>
                              <mn>2</mn>
                            </mfrac>
                          </msqrt>
                          <mo>)</mo>
                        </mrow>
                      </E>
                      <mo>⋅</mo>
                      <E n={4}>
                        <V>k</V>
                      </E>
                    </mrow>
                    <msup>
                      <mn>10</mn>
                      <mn>{FEE_SCALE_EXP}</mn>
                    </msup>
                  </mfrac>
                  <mo>⌉</mo>
                </mrow>
              </math>
              <math display="block">
                <msub>
                  <V>fee</V>
                  <mtext className="text-fg-subtle">pips</mtext>
                </msub>
                <mo>=</mo>
                <V>clamp</V>
                <Apply />
                <mrow>
                  <mo>(</mo>
                  <msub>
                    <V>premium</V>
                    <mtext className="text-fg-subtle">pips</mtext>
                  </msub>
                  <Comma />
                  <mn>{g(params.feeMinPips)}</mn>
                  <Comma />
                  <mn>{g(params.feeMaxPips)}</mn>
                  <mo>)</mo>
                </mrow>
              </math>
            </div>
          </Scroll>
          <p className="mt-3 max-w-[72ch] text-[14px] leading-[1.6] text-fg-subtle [&_sub]:text-[0.86em] [&_sup]:text-[0.86em]">
            x<sub>En</sub> is x × 10<sup>n</sup> stored as an integer: η<sub>E4</sub> = {g(params.etaE4)}, (√(Δt/2))<sub>E6</sub> ={" "}
            {g(params.sqrtHalfDtE6)} and k<sub>E4</sub> = {g(K_E4_NEUTRAL)}, and the desk posts <span className="text-sigma-ink">σ</span>
            <sub>E9</sub> every 30&nbsp;s. Fees are counted in pips: 1&nbsp;bp = 100&nbsp;pips.
          </p>
        </div>
      </details>
    </div>
  );
}

const SIGMA_EXAMPLES = [25, 50, 100, 150, 225]; // % a year

/** The fee and the predicted share of arbitraged blocks at a few volatilities, computed with the hook's own math. */
export function FeeTable() {
  const rows = SIGMA_EXAMPLES.map((s) => {
    const sigmaE9 = annualPctToSigmaE9(s);
    const fee = feePips(sigmaE9, params.etaE4, params.sqrtHalfDtE6, K_E4_NEUTRAL, params.feeMinPips, params.feeMaxPips);
    return { s, fee, floor: fee === params.feeMinPips, p: predictedPTrade(fee, sigmaE9, params.sqrtHalfDtE6) };
  });
  const floorSigma = Math.round(sigmaAtFee(floorBp + 0.01, params)); // 46: where the fee leaves its floor
  const ceilingPct = Math.round(sigmaE9ToAnnualPct(SIGMA_DESK_MAX_E9)); // 1,000: the highest σ the desk publishes
  const reachable = reachableFeeMaxBp(params); // 109.46 bp at k = 1
  const kMath = (
    <math>
      <V>k</V>
      <mo>=</mo>
      <mn>{k}</mn>
    </math>
  );
  return (
    <div className={`fee-math ${mathFallback.variable} mt-8`}>
      <h3 id="premium-table" className="font-display text-[15px] font-medium text-fg">
        The premium at a few volatilities
      </h3>
      <table aria-labelledby="premium-table" className="mt-2 w-full text-sm tabular-nums sm:w-auto sm:min-w-[520px]">
        <thead>
          <tr className="border-b border-line text-xs text-fg-subtle">
            <th scope="col" className="py-2 pr-4 text-right align-bottom font-normal">
              σ, % a year
            </th>
            <th scope="col" className="px-4 py-2 text-right align-bottom font-normal">
              Fee
            </th>
            <th scope="col" className="py-2 pl-4 text-right align-bottom font-normal">
              Blocks arbitraged, predicted
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s} className="border-b border-line">
              <th scope="row" className="py-2 pr-4 text-right font-normal whitespace-nowrap">
                {r.s}%
              </th>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {r.floor ? <span className="mr-2 rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted">floor</span> : null}
                {pipsToBp(r.fee).toFixed(2)} bp
              </td>
              <td className="py-2 pl-4 text-right whitespace-nowrap">{(r.p * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-[72ch] text-[13px] leading-[1.6] text-fg-subtle">
        Below {floorSigma}% a year the floor binds: the fee is higher than the formula asks, so fewer blocks than <PStar /> get arbitraged.
        Above it the share holds at <span className="whitespace-nowrap"><PStar /> = {pStarPct}%</span>.{" "}
        {reachable < capBp ? (
          <>
            At the desk&apos;s ceiling, {ceilingPct.toLocaleString("en-US")}% a year with {kMath}, the fee is {reachable.toFixed(2)}&nbsp;bp: the{" "}
            {capBp}&nbsp;bp cap only binds when k raises the premium.
          </>
        ) : (
          <>
            At the desk&apos;s ceiling, {ceilingPct.toLocaleString("en-US")}% a year with {kMath}, the fee reaches the {capBp}&nbsp;bp cap.
          </>
        )}
      </p>
    </div>
  );
}
