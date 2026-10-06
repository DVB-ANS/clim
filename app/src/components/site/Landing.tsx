"use client";

import { ClosingBand } from "./ClosingBand";
import { FloatingNav } from "./FloatingNav";
import { HeroSection } from "./HeroSection";
import { HowStack } from "./HowStack";
import { LearnRows } from "./LearnRows";
import { LiveTicker } from "./LiveTicker";
import { LogoStrip } from "./LogoStrip";
import { PoolsSection } from "./PoolsSection";
import { ProblemSection } from "./ProblemSection";
import { SiteFooter } from "./SiteFooter";
import { useLandingData } from "./useLandingData";

/**
 * clim's landing, one beat per section: the promise and Launch app, who it is built on, the problem,
 * how it works (with the safe modes), two pools in one market, ways to go deeper, and the call to act.
 * Every number comes from the desk's logs and says "simulated" while the app reads the mock chain.
 */
export function Landing() {
  const d = useLandingData();
  return (
    <div className="bg-surface">
      <FloatingNav />
      <main>
        <HeroSection d={d} />
        <LogoStrip />
        <LiveTicker items={d.ticker} simulated={d.simulated} />
        <ProblemSection />
        <HowStack
          live={{ seq: d.last?.seq, sigmaPct: d.sigmaPct, dispBp: d.last?.dispBp, sources: d.last?.nSources, feeVBp: d.feeVBp, feeSBp: d.feeSBp, kE4: d.last?.kE4 }}
          sigmaPeak={d.storm?.peakSigma}
          checks={d.checks}
          statuses={d.statuses}
          safety={d.safety}
          simulated={d.simulated}
        />
        <PoolsSection d={d} />
        <LearnRows />
        <div className="bg-surface px-2 pb-6 md:px-4">
          <ClosingBand />
        </div>
      </main>
      <SiteFooter simulated={d.simulated} />
    </div>
  );
}
