import type { Metadata } from "next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ContractsPanel } from "@/components/ContractsPanel";
import { Panel } from "@/components/ui";
import { FAQ_MD } from "@/generated/faq";
import { params } from "@/lib/config";
import { feePips } from "@/lib/feeMath";
import { predictedPTrade } from "@/lib/ptrade";
import { annualPctToSigmaE9, pipsToBp } from "@/lib/units";

export const metadata: Metadata = { title: "How it works" };

const EXAMPLES = [25, 50, 100, 150, 225];

// The FAQ sits under this page's "FAQ" panel (an h2): its own "# clim FAQ" title is dropped, its questions
// become h3, and its code blocks and tables, which scroll sideways on a phone, take keyboard focus.
/** react-markdown hands each component its syntax-tree `node`, which must not reach the DOM. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const FAQ_COMPONENTS: Components = {
  h1: () => null,
  h2: (p) => <h3 {...dom(p)} />,
  h3: (p) => <h4 {...dom(p)} />,
  pre: (p) => <pre role="region" aria-label="FAQ code block" tabIndex={0} {...dom(p)} />,
  table: (p) => (
    <div className="mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="FAQ table" tabIndex={0}>
      <table {...dom(p)} />
    </div>
  ),
};

export default function HowPage() {
  const rows = EXAMPLES.map((s) => {
    const sigma = annualPctToSigmaE9(s);
    const fee = feePips(sigma, params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips);
    return { s, fee, p: predictedPTrade(fee, sigma, params.sqrtHalfDtE6) };
  });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">How clim works</h1>
      <Panel title="1. Four weather stations must agree (Chainlink CRE)">
        <p className="text-sm">
          Every 30 seconds a Chainlink CRE workflow pulls one-minute ETH candles from Coinbase, Kraken, Binance and Hyperliquid, plus
          Deribit&apos;s DVOL. A venue whose last candle is older than 120 s is dropped; with fewer than 3 venues there is no report.
          The workflow computes the median price per minute and the 15-minute realised volatility (RV15), takes the median of every
          field with CRE&apos;s consensus API and writes one report to <code>RiskDesk.onReport</code>.
        </p>
        <p className="mt-2 text-sm">
          What runs today: CRE&apos;s simulator, on one node. Our operator key sends each report through MockKeystoneForwarder, which checks
          no signature, and RiskDesk accepts simulated reports from that key only. The target is a Chainlink DON: the same workflow, run by
          several nodes, whose median report they sign and deliver through the KeystoneForwarder.
        </p>
        <p className="mt-2 text-sm">
          RiskDesk only stores the number after checks: reports at least 20 s apart, at most 30 s in the future, at least 3 sources, σ
          between 10% and 1000% a year, and σ may move only between 0.8× and 2× its previous value per report (volatility rises fast, falls
          slowly). Dispersion between venues above 25 bp flags the report as degraded.
        </p>
        <p className="mt-2 text-sm">
          No function sets σ or the fee. The owner chooses which forwarder to trust, and in this build the owner key is also the live
          desk&apos;s simulation operator, so until <code>disableSim()</code> it can post reports itself, inside these same bounds: the fee
          stays between {pipsToBp(params.feeMinPips)} and {pipsToBp(params.feeMaxPips)} bp. On a DON, only the nodes&apos; signed reports count.
        </p>
      </Panel>
      <Panel title="2. The hook reads the weather on every swap (Uniswap v4 hook)">
        <p className="text-sm">
          Nobody sends a transaction to change the fee. On every swap the Uniswap v4 PoolManager calls the hook&apos;s
          <code> beforeSwap</code>; the hook reads <code>RiskDesk.state()</code>, computes the fee and returns it with
          <code> OVERRIDE_FEE_FLAG</code>. The same fee applies in both directions and does not depend on the pool&apos;s own state,
          so splitting a trade or sandwiching it does not change it.
        </p>
        <pre role="region" aria-label="Fee formula" tabIndex={0} className="mt-2 overflow-x-auto rounded-sm bg-surface-2 p-2 text-xs focus-visible:outline-2 focus-visible:outline-accent">
          fee = clamp(η · σ · √(Δt/2) · k, {pipsToBp(params.feeMinPips)} bp, {pipsToBp(params.feeMaxPips)} bp),  η = 1/P* − 0.824 = {(params.etaE4 / 1e4).toFixed(3)},  Δt = 12 s,  k = 1
        </pre>
        <p className="mt-2 text-sm">
          η is chosen so that, when the floor does not bind, a share P* = {(params.pStar * 100).toFixed(0)}% of blocks gets
          arbitraged (Milionis-Moallemi-Roughgarden 2023, fixed-block form by Nezlobin-Tassy 2025). That prediction is checked
          continuously on the dashboard.
        </p>
        <div className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Fee and predicted arbitrage at several volatilities" tabIndex={0}>
        <table className="text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-fg-subtle"><th className="pr-6">σ (annualised)</th><th className="pr-6">Fee</th><th>Predicted share of arbitraged blocks</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s}><td className="pr-6">{r.s}%</td><td className="pr-6">{pipsToBp(r.fee).toFixed(2)} bp</td><td>{(r.p * 100).toFixed(1)}%</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>
      <Panel title="3. When the stations go quiet">
        <p className="text-sm">
          If the desk has not reported for {params.tauKillSec} s, the hook is blind and quotes at least {pipsToBp(params.feeSafePips)} bp
          until a fresh report lands. A degraded report (venues disagree) also lifts the fee to at least {pipsToBp(params.feeSafePips)} bp.
        </p>
      </Panel>
      <ContractsPanel />
      <Panel id="faq" title="FAQ">
        <div className="text-sm [&_pre]:mt-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-surface-2 [&_pre]:p-2 [&_pre:focus-visible]:outline-2 [&_pre:focus-visible]:outline-accent [&_code]:text-xs [&_code]:wrap-anywhere [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-4 [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_td]:pr-4 [&_th]:pr-4 [&_th]:text-left">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={FAQ_COMPONENTS}>
            {FAQ_MD}
          </ReactMarkdown>
        </div>
      </Panel>
    </div>
  );
}
