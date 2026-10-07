"use client";

import { useMemo } from "react";
import { useClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { DeskReport } from "@/lib/decode";
import { deskChecks, reportStatuses } from "@/lib/desk";
import { quoteFee } from "@/lib/feeMath";
import { deskSilentSince } from "@/lib/guide";
import { deskStateOf, DISP_MAX_BP, downsampleSteps, weatherSeries } from "@/lib/series";
import { poolsVerdict, safetyCounts, stormSummary } from "@/lib/story";
import { MODE_STYLE } from "@/lib/theme";
import { pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";
import type { TickerItem } from "./LiveTicker";

const feeAt = (r: DeskReport) => pipsToBp(quoteFee(deskStateOf(r), r.tObs, params).feePips);

/**
 * Everything the landing shows, from the desk's logs (simulated while the app reads the mock chain):
 * the numbers now, the last two hours for the hero, and the window's story (the storm, V against S,
 * the safe modes). The story moves with the reports, so it is recomputed every 30 s, not every second.
 */
export function useLandingData() {
  const { reports, swaps, pair, arbRouter, nowSec, state, source } = useClimData("live");
  const last = reports.at(-1);
  const quote = state?.quote;
  const simulated = source === "mock";
  const sigmaPct = last ? sigmaE9ToAnnualPct(last.sigmaApplied) : undefined;
  const feeVBp = quote ? pipsToBp(quote.feePips) : undefined;
  const feeSBp = pair ? pipsToBp(pair.S.key.fee) : undefined;
  const modeLabel = quote ? MODE_STYLE[quote.mode].label.toLowerCase() : undefined;
  const slow = Math.floor(nowSec / 30) * 30;
  // the desk's last report, when it is older than FINISHED_AFTER_SEC: the hero, the ticker and Desk checks then stop saying "Live"
  const silentSince = simulated ? undefined : deskSilentSince(reports, nowSec);

  const points = useMemo(() => {
    const from = (reports.at(-1)?.blockTimestamp ?? 0) - 2 * 3600;
    return downsampleSteps(weatherSeries(reports.filter((r) => r.blockTimestamp >= from), params, nowSec), 160);
  }, [reports, nowSec]);
  const windowPoints = useMemo(() => {
    // downsampled for the chart, but every mode change (each blind spell's 30 bp step) and the storm's
    // peak step are kept, so the safe fee shows at its true width and the peak's pink ring sits on the line
    const full = weatherSeries(reports, params, slow);
    const kept = new Set(downsampleSteps(full, 240));
    const peak = full.reduce((best, p, i) => (p.sigmaPct > full[best].sigmaPct ? i : best), 0);
    for (const i of [peak, peak + 1]) if (full[i]) kept.add(full[i]);
    return full.filter((p) => kept.has(p));
  }, [reports, slow]);

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
  const storm = useMemo(() => (pair ? stormSummary(reports, params, { staticFeePips: pair.S.key.fee, nowSec: slow }) : undefined), [reports, pair, slow]);
  const verdict = useMemo(() => (pair ? poolsVerdict(reports, params, { swaps, pair, arbRouter, nowSec: slow }) : undefined), [reports, swaps, pair, arbRouter, slow]);
  const safety = useMemo(() => safetyCounts(reports, params, slow), [reports, slow]);

  return { simulated, silentSince, last, sigmaPct, feeVBp, feeSBp, modeLabel, points, windowPoints, ticker, statuses, checks, storm, verdict, safety };
}

export type LandingData = ReturnType<typeof useLandingData>;
