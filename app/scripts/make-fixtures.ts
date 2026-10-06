// Writes shape-identical SYNTHETIC lab fixtures to src/fixtures/lab/. They only exercise the UI;
// every label says "fixture" so no number can be mistaken for a lab result. Run: npm run fixtures
import { mkdirSync, writeFileSync } from "node:fs";
import { feePips } from "@/lib/feeMath";
import type { LabPTradeBand, LabReplay, LabSummary } from "@/lib/lab";
import { mulberry32 } from "@/lib/mock";
import { annualPctToSigmaE9, SQRT_SECONDS_PER_YEAR } from "@/lib/units";

const OUT = new URL("../src/fixtures/lab/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const GENERATED_AT = "fixture (app/scripts/make-fixtures.ts)";
const write = (name: string, data: unknown) => writeFileSync(new URL(name, OUT), `${JSON.stringify(data)}\n`);
const round = (x: number, d = 4) => Number(x.toFixed(d));

/** A synthetic 4-hour storm (74% to 225%/yr) at P* = 20%, S at V's time-average fee. */
function replay(): { file: LabReplay; stats: { arbChangePct: number; feeSBp: number; feeVMin: number; feeVMax: number; pObsV: number } } {
  const rand = mulberry32(42);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const start = Date.parse("2026-02-04T12:00:00Z") / 1000;
  const n = (4 * 3_600) / 12;
  const vol = (i: number) => 74 + (225 - 74) / (1 + Math.exp(-(i / n - 0.6) * 14));
  const feeV: number[] = [];
  const lnm: number[] = [Math.log(2_650)];
  for (let i = 0; i < n; i++) {
    feeV.push(feePips(annualPctToSigmaE9(vol(i) * (1 + 0.1 * gauss())), 41_760, 2_449_490, 10_000, 500, 15_000) / 1e6);
    if (i > 0) lnm.push(lnm[i - 1] + (vol(i) / 100 / SQRT_SECONDS_PER_YEAR) * Math.sqrt(12) * gauss());
  }
  const feeS = feeV.reduce((a, b) => a + b, 0) / n; // equal time-average fee
  const pool = { V: lnm[0], S: lnm[0] };
  const arb = { V: 0, S: 0 };
  let tradesV = 0;
  const f: LabReplay = { fixture: true, window: { startUtc: "2026-02-04T12:00:00Z", endUtc: "2026-02-04T16:00:00Z" }, t: [], sigmaAnnualPct: [], feeVBp: [], feeSBp: round(feeS * 1e4, 2), arbCumVUsd: [], arbCumSUsd: [], price: [] };
  for (let i = 0; i < n; i++) {
    for (const [k, fee] of [["V", feeV[i]], ["S", feeS]] as const) {
      const z = lnm[i] - pool[k];
      if (Math.abs(z) > fee) {
        arb[k] += (0.5 * (Math.abs(z) - fee) ** 2 * 1e6) / 4; // CPMM: ARB ~ V/8 * d^2, for $1M of TVL
        pool[k] = lnm[i] - Math.sign(z) * fee;
        if (k === "V") tradesV++;
      }
    }
    f.t.push(start + i * 12);
    f.sigmaAnnualPct.push(round(vol(i), 2));
    f.feeVBp.push(round(feeV[i] * 1e4, 2));
    f.arbCumVUsd.push(round(arb.V, 2));
    f.arbCumSUsd.push(round(arb.S, 2));
    f.price?.push(round(Math.exp(lnm[i]), 2));
  }
  return {
    file: f,
    stats: { arbChangePct: round((arb.V / arb.S - 1) * 100, 1), feeSBp: f.feeSBp, feeVMin: Math.min(...f.feeVBp), feeVMax: Math.max(...f.feeVBp), pObsV: round(tradesV / n, 3) },
  };
}

function band(): LabPTradeBand {
  const N = 300;
  const grid = [];
  for (let k = 1; k <= 20; k++) {
    const p = k * 0.02;
    const sd = Math.sqrt(((p * (1 - p)) / N) * 2.5); // binomial variance x2.5 for clustering (fixture only)
    grid.push({ p: round(p, 2), lo95: round(Math.max(0, p - 1.96 * sd)), hi95: round(p + 1.96 * sd), lo99: round(Math.max(0, p - 2.576 * sd)), hi99: round(p + 2.576 * sd) });
  }
  return { fixture: true, generatedAt: GENERATED_AT, windowBlocks: N, method: "fixture: binomial band with variance x2.5, not the lab simulation", grid };
}

function summary(r: ReturnType<typeof replay>["stats"]): LabSummary {
  return {
    fixture: true,
    generatedAt: GENERATED_AT,
    setting: { pStar: 0.2, feeMinPips: 500 },
    comparisons: {
      equalAvgFee: [{ period: "Synthetic A (fixture)", arbChangePct: -15 }, { period: "Synthetic B (fixture)", arbChangePct: -10 }],
      equalTraderCost: [{ period: "Synthetic A (fixture)", arbChangePct: -5 }, { period: "Synthetic B (fixture)", arbChangePct: 3 }],
    },
    pTrade: [
      { period: "Synthetic A (fixture)", predicted: 0.2, observed: 0.19, blocks: 10_000 },
      { period: "Synthetic B (fixture)", predicted: 0.19, observed: 0.2, blocks: 10_000 },
    ],
    replay: {
      window: "Synthetic storm (fixture)", sigmaMinPct: 74, sigmaMaxPct: 225, feeVMinBp: r.feeVMin, feeVMaxBp: r.feeVMax, feeSBp: r.feeSBp,
      arbChangePct: r.arbChangePct, arbChangeRangePct: [r.arbChangePct, 0], pTradePredicted: 0.2, pTradeObserved: r.pObsV,
    },
    lpGain: { fullRangeEthPctPerYear: [0, 0], volatileAssetPctPerYearMax: 0, shareFromTop5WeeksPct: 0 },
    modelSeverityRatio: [1, 1],
    inPoolVolGainSharePct: [0, 0],
  };
}

const r = replay();
write("replay-2026-02-04.json", r.file);
write("ptrade-band.json", band());
write("summary.json", summary(r.stats));
console.log("wrote src/fixtures/lab/{replay-2026-02-04,ptrade-band,summary}.json");
