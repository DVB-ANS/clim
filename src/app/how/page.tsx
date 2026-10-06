import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel } from "@/components/ui";
import { FAQ_MD } from "@/generated/faq";
import { params } from "@/lib/config";
import { feePips } from "@/lib/feeMath";
import { predictedPTrade } from "@/lib/ptrade";
import { annualPctToSigmaE9, pipsToBp } from "@/lib/units";

const EXAMPLES = [25, 50, 100, 150, 225];

export default function HowPage() {
  const rows = EXAMPLES.map((s) => {
    const sigma = annualPctToSigmaE9(s);
    const fee = feePips(sigma, params.etaE4, params.sqrtHalfDtE6, 10_000, params.feeMinPips, params.feeMaxPips);
    return { s, fee, p: predictedPTrade(fee, sigma, params.sqrtHalfDtE6) };
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">How clim works</h1>
      <Panel title="1. Four weather stations must agree (Chainlink CRE)">
        <p className="text-sm">
          Every 30 seconds a Chainlink CRE workflow pulls one-minute ETH candles from Coinbase, Kraken, Binance and Hyperliquid, plus
          Deribit&apos;s DVOL. A venue whose last candle is older than 120 s is dropped; with fewer than 3 venues there is no report.
          Each node computes the median price per minute and the 15-minute realised volatility (RV15); the DON takes the median of
          every field and writes one signed report to <code>RiskDesk.onReport</code>.
        </p>
        <p className="mt-2 text-sm">
          RiskDesk only stores the number after checks: reports at least 20 s apart, at most 30 s in the future, at least 3 sources,
          and σ may move only between 0.8× and 2× its previous value per report (volatility rises fast, falls slowly). Dispersion
          between venues above 25 bp flags the report as degraded. No function sets σ or the fee: the owner only chooses which forwarder to trust, and every report stays inside these bounds.
        </p>
      </Panel>
      <Panel title="2. The toll booth reads the weather on every swap (Uniswap v4 hook)">
        <p className="text-sm">
          Nobody sends a transaction to change the fee. On every swap the Uniswap v4 PoolManager calls the hook&apos;s
          <code> beforeSwap</code>; the hook reads <code>RiskDesk.state()</code>, computes the fee and returns it with
          <code> OVERRIDE_FEE_FLAG</code>. The same fee applies in both directions and does not depend on the pool&apos;s own state,
          so splitting a trade or sandwiching it does not change it.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-sm bg-surface-2 p-2 text-xs">
          fee = clamp(η · σ · √(Δt/2) · k, {pipsToBp(params.feeMinPips)} bp, {pipsToBp(params.feeMaxPips)} bp),  η = 1/P* − 0.824 = {(params.etaE4 / 1e4).toFixed(3)},  Δt = 12 s,  k = 1
        </pre>
        <p className="mt-2 text-sm">
          η is chosen so that, when the floor does not bind, a share P* = {(params.pStar * 100).toFixed(0)}% of blocks gets
          arbitraged (Milionis-Moallemi-Roughgarden 2023, fixed-block form by Nezlobin-Tassy 2025). That prediction is checked
          continuously on the dashboard.
        </p>
        <table className="mt-3 text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-fg-subtle"><th className="pr-6">σ (annualised)</th><th className="pr-6">Fee</th><th>Predicted share of arbitraged blocks</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s}><td className="pr-6">{r.s}%</td><td className="pr-6">{pipsToBp(r.fee).toFixed(1)} bp</td><td>{(r.p * 100).toFixed(1)}%</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="3. When the stations go quiet">
        <p className="text-sm">
          If the desk has not reported for {params.tauKillSec} s, the hook is blind and quotes at least {pipsToBp(params.feeSafePips)} bp
          until a fresh report lands. A degraded report (venues disagree) also lifts the fee to at least {pipsToBp(params.feeSafePips)} bp.
        </p>
      </Panel>
      <Panel title="FAQ">
        <div className="text-sm [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_hr]:my-4 [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_td]:pr-4 [&_th]:pr-4 [&_th]:text-left">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{FAQ_MD}</ReactMarkdown>
        </div>
      </Panel>
    </div>
  );
}
