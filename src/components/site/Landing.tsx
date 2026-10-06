"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { DeskReport } from "@/lib/decode";
import { deskChecks, reportStatuses } from "@/lib/desk";
import { quoteFee } from "@/lib/feeMath";
import { deskStateOf, DISP_MAX_BP, downsample, weatherSeries } from "@/lib/series";
import { MODE_STYLE } from "@/lib/theme";
import { pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";
import { type Kpi, DashboardPreview } from "./DashboardPreview";
import { DeskChecks } from "./DeskChecks";
import { HeroCards } from "./HeroCards";
import { IsobarCanvas } from "./IsobarCanvas";
import type { BootValues } from "./Launch";
import { LaunchLink } from "./LaunchLink";
import { LiveTicker, type TickerItem } from "./LiveTicker";
import { LogoStrip } from "./LogoStrip";
import { PipelineDiagram } from "./PipelineDiagram";
import { ServiceSection } from "./ServiceSection";
import { CtaPanel, pillDark, pillOutline, SiteFooter, SiteHeader } from "./SiteChrome";
import { VenueMap } from "./VenueMap";

/** The last report published at or before t (reports are in chain order). */
function reportAt(reports: DeskReport[], t: number): DeskReport | undefined {
  for (let i = reports.length - 1; i >= 0; i--) if (reports[i].blockTimestamp <= t) return reports[i];
  return undefined;
}

const feeAt = (r: DeskReport) => pipsToBp(quoteFee(deskStateOf(r), r.tObs, params).feePips);

/** clim's landing page, after Ventriloc: every number on it comes from the desk's logs (simulated until deployment). */
export function Landing() {
  const data = useClimData("live");
  const { reports, nowSec } = data;
  const last = reports.at(-1);
  const quote = data.state?.quote;
  const simulated = data.source === "mock";
  const sigmaPct = last ? sigmaE9ToAnnualPct(last.sigmaApplied) : undefined;
  const feeVBp = quote ? pipsToBp(quote.feePips) : undefined;
  const feeSBp = data.pair ? pipsToBp(data.pair.S.key.fee) : undefined;
  const modeLabel = quote ? MODE_STYLE[quote.mode].label.toLowerCase() : undefined;

  const points = useMemo(() => {
    const from = (reports.at(-1)?.blockTimestamp ?? 0) - 2 * 3600;
    return downsample(weatherSeries(reports.filter((r) => r.blockTimestamp >= from), params, nowSec), 160);
  }, [reports, nowSec]);

  const ticker: TickerItem[] = useMemo(
    () =>
      reports.slice(-12).reverse().map((r) => ({
        seq: r.seq,
        sigmaPct: sigmaE9ToAnnualPct(r.sigmaApplied),
        feeVBp: feeAt(r),
        feeSBp: feeSBp ?? 0,
        mode: r.dispBp > DISP_MAX_BP ? "degraded" : "normal",
      })),
    [reports, feeSBp],
  );

  const statuses = useMemo(() => reportStatuses(reports.slice(-48), params.tauKillSec), [reports]);
  const checks = last ? deskChecks(last, nowSec, params.tauKillSec) : [];

  const hourAgo = last ? reportAt(reports, last.blockTimestamp - 3600) : undefined;
  const signed = (x: number, digits: number, unit: string) => ({ up: x >= 0, text: `${Math.abs(x).toFixed(digits)}${unit}` });
  const kpis: Kpi[] = [
    {
      label: "σ applied",
      value: sigmaPct === undefined ? "…" : sigmaPct.toFixed(1),
      unit: "%/yr",
      delta: sigmaPct !== undefined && hourAgo ? signed(sigmaPct - sigmaE9ToAnnualPct(hourAgo.sigmaApplied), 1, " pts") : undefined,
      note: "median of the venues",
    },
    {
      label: "Fee · pool V",
      value: feeVBp === undefined ? "…" : feeVBp.toFixed(2),
      unit: "bp",
      delta: feeVBp !== undefined && hourAgo ? signed(feeVBp - feeAt(hourAgo), 2, " bp") : undefined,
      note: "quoteFee() now",
    },
    { label: "Fee · pool S", value: feeSBp === undefined ? "…" : feeSBp.toFixed(2), unit: "bp", note: "fixed in its PoolKey" },
    { label: "Venues", value: last ? `${last.nSources}/4` : "…", unit: "", note: last ? `dispersion ${last.dispBp} bp` : "" },
  ];

  const boot: BootValues = { block: data.state?.latestBlock.number, seq: last?.seq, sources: last?.nSources, sigmaPct, feeBp: feeVBp, mode: modeLabel, simulated };

  return (
    <div className="bg-surface">
      <SiteHeader boot={boot} />

      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-16 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h1 className="font-display text-[48px] font-normal leading-[0.94] tracking-[-0.02em] sm:text-[58px] lg:text-[66px]">
            Your Liquidity. Our Risk Desk. Fees That Follow The <span className="text-brass underline decoration-1 underline-offset-[10px]">Storm</span>.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.45] text-fg-muted">
            clim plugs a Chainlink CRE risk desk into a Uniswap v4 hook. Four exchanges measure ETH volatility every 30 seconds, and every swap
            pays the fee that weather sets: 5 bp in calm markets, more as the storm builds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LaunchLink boot={boot} className={pillDark}>
              Launch app
            </LaunchLink>
            <Link href="/how" className={pillOutline}>
              How it works
            </Link>
          </div>
        </div>
        <HeroCards live={{ points, feeVBp, feeSBp, sigmaPct, modeLabel, seq: last?.seq, simulated }} />
      </section>

      <LogoStrip />
      <LiveTicker items={ticker} simulated={simulated} />

      <div className="bg-bg px-2 pb-24 pt-16 md:px-4">
        <div className="mx-auto max-w-[1200px] space-y-6">
          <ServiceSection
            id="desk"
            index={0}
            title="Risk Desk"
            subtitle="Chainlink CRE · four venues · a signed median every 30 s"
            link={{ href: "/how", label: "How the desk works" }}
            mock={<PipelineDiagram live={{ seq: last?.seq, sigmaPct, dispBp: last?.dispBp, sources: last?.nSources, feeVBp, feeSBp }} />}
          >
            <p>
              Every 30 seconds a Chainlink CRE workflow reads one-minute ETH candles from Coinbase, Kraken, Binance and Hyperliquid, plus
              Deribit&apos;s DVOL. Each node computes the 15-minute realised volatility; the network signs the median and writes one report to
              RiskDesk on Sepolia.
            </p>
            <p>A venue whose last candle is older than 120 s is dropped; with fewer than three, there is no report.</p>
          </ServiceSection>

          <ServiceSection
            id="fee"
            index={1}
            title="Dynamic Fee"
            subtitle="Uniswap v4 hook · ClimHook.quoteFee() inside every swap"
            link={{ href: "/app", label: "Open the dashboard" }}
            mock={<DashboardPreview kpis={kpis} points={points} staticFeeBp={feeSBp ?? 0} />}
          >
            <p>
              Nobody sends a transaction to change the fee. On every swap the PoolManager calls the hook, which reads the latest report and
              returns η · σ · √(Δt/2), between 5 and 150 bp: the same fee in both directions, for any size.
            </p>
          </ServiceSection>

          <ServiceSection
            id="map"
            index={2}
            title="Storm Map"
            subtitle="Four stations, one forecast · the low deepens with σ"
            link={{ href: "/replay", label: "Watch the 4 Feb storm" }}
            mock={
              <div className="grid gap-4">
                <div className="relative overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--clim-line)]">
                  <IsobarCanvas sigmaPct={sigmaPct ?? 40} className="block h-40 w-full" />
                  <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs text-fg-muted">Isobars of σ · live</span>
                </div>
                <div className="rounded-md bg-surface px-3 py-2 shadow-[0_0_0_1px_var(--clim-line)]">
                  <VenueMap className="block h-auto max-h-64 w-full" />
                </div>
              </div>
            }
          >
            <p>
              In calm markets the fee rests on its 5 bp floor, cheaper than a fixed-fee pool. When volatility builds, the low deepens and the fee
              rises with it, so arbitrage pays for the risk it brings to LPs.
            </p>
          </ServiceSection>

          <ServiceSection
            id="safety"
            index={3}
            title="Safe Modes"
            subtitle="Degraded and blind, by design"
            link={{ href: "/how", label: "Read the safety rules" }}
            mock={<DeskChecks checks={checks} statuses={statuses} simulated={simulated} />}
          >
            <p>
              If the venues disagree by more than 25 bp, the report is flagged and the fee holds at 30 bp or more. If the desk goes silent for
              180 s, the hook quotes blind, at 30 bp or more, until a fresh report lands.
            </p>
            <p>The owner chooses who may report; nobody can set σ or the fee.</p>
          </ServiceSection>
        </div>
      </div>

      <div className="bg-bg px-2 pb-6 md:px-4">
        <CtaPanel boot={boot} />
      </div>
      <div className="bg-bg pt-2">
        <SiteFooter simulated={simulated} />
      </div>
    </div>
  );
}
