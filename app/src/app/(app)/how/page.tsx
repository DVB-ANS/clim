import type { Metadata } from "next";
import Link from "next/link";
import { ContractsPanel } from "@/components/ContractsPanel";
import { FaqHashOpener } from "@/components/how/FaqHashOpener";
import { FaqList } from "@/components/how/FaqList";
import { FeeFormula, FeeTable } from "@/components/how/FeeFormula";
import { Panel } from "@/components/ui";
import { params } from "@/lib/config";
import { pipsToBp } from "@/lib/units";
import "./how.css";

export const metadata: Metadata = { title: "How it works" };

export default function HowPage() {
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
      <Panel id="premium" title="2. Every swap pays the weather's premium (Uniswap v4 hook)">
        <p className="text-sm">
          Nobody sends a transaction to change the fee. Inside every swap, Uniswap v4&apos;s PoolManager calls the hook&apos;s{" "}
          <code>beforeSwap</code>. The hook reads the desk&apos;s latest report from <code>RiskDesk.state()</code>, prices a premium from it
          and returns that premium as the swap&apos;s LP fee, flagged with <code>OVERRIDE_FEE_FLAG</code>. The premium is the same whichever
          way you trade and ignores the pool&apos;s own state, so splitting a trade or sandwiching it does not change it.
        </p>
        <p className="mt-2 text-sm">
          Why a premium: LPs lose money to arbitrageurs every time the market moves before the pool does, and they lose more when it moves
          fast. So the premium grows with volatility, like storm insurance: small in calm weather, larger in a storm.
        </p>
        <FeeFormula />
        <FeeTable />
        <p className="mt-6 text-sm">
          The{" "}
          <Link href="/app" className="text-link underline">
            dashboard
          </Link>{" "}
          checks the predicted share against the arbitrage it sees on pool V, block by block.
        </p>
      </Panel>
      <Panel title="3. When the stations go quiet">
        <p className="text-sm">
          If the desk has not reported for {params.tauKillSec} s, the hook is blind and quotes at least {pipsToBp(params.feeSafePips)} bp
          until a fresh report lands. A degraded report (venues disagree) also lifts the fee to at least {pipsToBp(params.feeSafePips)} bp.
        </p>
      </Panel>
      <ContractsPanel />
      <section id="faq" aria-labelledby="faq-title" className="pt-12">
        <FaqList />
        <FaqHashOpener />
      </section>
    </div>
  );
}
