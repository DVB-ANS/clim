import { params } from "@/lib/config";
import type { DeskCheck, DeskStatus } from "@/lib/desk";
import { DISP_MAX_BP } from "@/lib/series";
import { windowLabel } from "@/lib/story";
import { pipsToBp } from "@/lib/units";
import { DeskChecks } from "./DeskChecks";
import { FeeDial } from "./FeeDial";
import { IsobarCanvas } from "./IsobarCanvas";
import { PipelineDiagram } from "./PipelineDiagram";
import { ServiceSection } from "./ServiceSection";
import { VenueMap } from "./VenueMap";

export type HowLive = { seq?: number; sigmaPct?: number; dispBp?: number; sources?: number; feeVBp?: number; feeSBp?: number; kE4?: number };
export type SafetyCounts = { hours: number; degraded: number; blindGaps: number; longestBlindSec: number };

const FEE_MIN = pipsToBp(params.feeMinPips), FEE_MAX = pipsToBp(params.feeMaxPips), FEE_SAFE = pipsToBp(params.feeSafePips);

/**
 * "How it works": Ventriloc's stacked service panels, numbered as the report travels. 01 the venues
 * measure, 02 the workflow agrees on one median, 03 the hook charges (an interactive dial on its real
 * formula), 04 the safe modes, with what the simulated desk did over the window.
 */
export function HowStack({ live, sigmaPeak, checks, statuses, safety, simulated }: {
  live: HowLive;
  sigmaPeak?: number;
  checks: DeskCheck[];
  statuses: DeskStatus[];
  safety?: SafetyCounts;
  simulated: boolean;
}) {
  return (
    <div id="how" className="anchor bg-bg px-2 pb-24 pt-20 md:px-4">
      <div className="mx-auto max-w-[1200px]">
        <p className="px-2 text-[13px] text-fg-subtle">How it works</p>
        <h2 className="mt-3 max-w-3xl px-2 font-display text-[40px] font-normal leading-[1] tracking-[-0.02em] md:text-[52px]">
          From four exchanges to every swap, every 30 seconds
        </h2>
        <div className="stack mt-12 space-y-6">
          <ServiceSection
            id="measure"
            index={0}
            step="01"
            title="Four venues, one forecast"
            subtitle="Coinbase · Kraken · Binance · Hyperliquid · Deribit DVOL"
            link={{ href: "/how", label: "How the desk works" }}
            mock={
              <div className="grid gap-4">
                <div className="relative overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--clim-line)]">
                  <IsobarCanvas sigmaPct={live.sigmaPct ?? 40} className="block h-40 w-full" />
                  <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs text-fg-muted">Isobars of σ · the low deepens with it</span>
                </div>
                <div className="rounded-md bg-surface px-3 py-2 shadow-[0_0_0_1px_var(--clim-line)]">
                  <VenueMap className="block h-auto max-h-64 w-full" />
                </div>
              </div>
            }
          >
            <p>
              Every 30 seconds a Chainlink CRE workflow reads one-minute ETH candles from four exchanges and computes the 15-minute realised
              volatility, σ. Deribit&apos;s DVOL is logged alongside, for comparison; it does not enter σ.
            </p>
            <p>A venue whose last candle is older than 120 s is dropped; with fewer than three, there is no report.</p>
          </ServiceSection>

          <ServiceSection
            id="agree"
            index={1}
            step="02"
            title="One median every 30 s"
            subtitle="Chainlink CRE workflow → RiskDesk on Ethereum Sepolia"
            link={{ href: "/how#faq", label: "Who can change what" }}
            mock={
              <PipelineDiagram
                simulated={simulated}
                live={{ seq: live.seq, sigmaPct: live.sigmaPct, dispBp: live.dispBp, sources: live.sources, feeVBp: live.feeVBp, feeSBp: live.feeSBp }}
              />
            }
          >
            <p>The workflow takes the median of each field with CRE&apos;s consensus API and writes one report to RiskDesk, which keeps the latest one for the hook.</p>
            <p>
              For the demo it runs in CRE&apos;s one-node simulator, and RiskDesk accepts simulated reports from our operator key only; on a DON the same
              workflow runs unchanged and the nodes sign it. No function sets σ or the fee: the owner only chooses which forwarder to trust.
            </p>
          </ServiceSection>

          <ServiceSection
            id="charge"
            index={2}
            step="03"
            title="The fee reads the weather"
            subtitle="ClimHook.quoteFee() inside every swap"
            link={{ href: "/app", label: "See it live in the app" }}
            mock={<FeeDial sigmaNow={live.sigmaPct} sigmaPeak={sigmaPeak} feeSBp={live.feeSBp} kE4={live.kE4} simulated={simulated} />}
          >
            <p>
              Nobody sends a transaction to change the fee. On every swap the PoolManager calls the hook, which reads the latest report and
              returns η · σ · √(Δt/2), between {FEE_MIN} and {FEE_MAX} bp.
            </p>
            <p>The same fee in both directions, for any size. Try it: drag σ and read the fee.</p>
          </ServiceSection>

          <ServiceSection
            id="safety"
            index={3}
            step="04"
            title="Safe modes, by design"
            subtitle="When the desk cannot be trusted, the fee does not guess"
            link={{ href: "/how", label: "Read the safety rules" }}
            mock={<DeskChecks checks={checks} statuses={statuses} simulated={simulated} />}
          >
            <p>
              <span aria-hidden className="text-degraded">▲</span> <span className="text-fg">Degraded:</span> the venues disagree by more than {DISP_MAX_BP} bp,
              so the fee holds at {FEE_SAFE} bp or more.
            </p>
            <p>
              <span aria-hidden className="text-blind">■</span> <span className="text-fg">Blind:</span> the desk is silent for {params.tauKillSec} s, so the
              hook quotes at {FEE_SAFE} bp or more until a fresh report lands.
            </p>
            {safety ? (
              <p className="text-[14px]">
                Over the last {windowLabel(safety.hours)}{simulated ? " (simulated)" : ""}: {safety.degraded} degraded report{safety.degraded === 1 ? "" : "s"},{" "}
                {safety.blindGaps} blind gap{safety.blindGaps === 1 ? "" : "s"}
                {safety.blindGaps ? `, the longest ${Math.round(safety.longestBlindSec)} s` : ""}.
              </p>
            ) : null}
          </ServiceSection>
        </div>
      </div>
    </div>
  );
}
