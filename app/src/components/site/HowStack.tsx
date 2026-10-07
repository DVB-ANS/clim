import { params } from "@/lib/config";
import type { DeskCheck, DeskStatus } from "@/lib/desk";
import { DISP_MAX_BP } from "@/lib/series";
import { windowLabel } from "@/lib/story";
import { formatAge, pipsToBp } from "@/lib/units";
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
 * measure, 02 the workflow takes one median (in CRE's one-node simulator; written for a DON, not deployed on one),
 * 03 the hook charges (an interactive dial on its real formula), 04 the safe modes, with what the desk
 * did over the window.
 */
export function HowStack({ live, sigmaPeak, checks, statuses, safety, simulated, silent = false }: {
  live: HowLive;
  sigmaPeak?: number;
  checks: DeskCheck[];
  statuses: DeskStatus[];
  safety?: SafetyCounts;
  simulated: boolean;
  silent?: boolean;
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
              Every 30 seconds a Chainlink CRE workflow reads one-minute ETH candles from four exchanges and computes the 15-minute realized
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
              Today it runs in CRE&apos;s simulator, on one node: our operator key sends each report through MockKeystoneForwarder, which checks no
              signature. It is written with CRE&apos;s consensus API for a DON, whose nodes would sign the report, but it has not run on one: DON
              deploy access, requested on 6 October, was not granted during the hackathon.
            </p>
            <p>
              No function sets σ or the fee. In this build the owner key is also the simulation operator, so until it disables simulation and
              renounces ownership it can post reports itself (through the mock forwarder, or later through a forwarder it sets), inside the same
              bounds as any report: σ ×2 up or ×0.8 down per report, 10% to 1000% a year, a fee of {FEE_MIN} to {FEE_MAX} bp.
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
              When prices move, the fastest traders, arbitrageurs racing to the pool&apos;s stale price, profit at the LPs&apos; expense. clim
              makes that speed cost more in a storm and charges the market&apos;s usual fee when it is calm.
            </p>
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
            mock={<DeskChecks checks={checks} statuses={statuses} simulated={simulated} silent={silent} />}
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
                {safety.blindGaps ? `, the longest ${formatAge(safety.longestBlindSec)}` : ""}.
              </p>
            ) : null}
          </ServiceSection>
        </div>
      </div>
    </div>
  );
}
