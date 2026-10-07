import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { Delivery, DeskReport } from "@/lib/decode";
import { SafetyPanel } from "./SafetyPanel";

// n + 1 reports, each landing after the previous one has been silent past tauKillSec: n blind episodes
function silentReports(n: number): DeskReport[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = 1_000 + i * (params.tauKillSec + 100);
    return {
      seq: i, tObs: t - 5, sigmaApplied: 500_000, sigmaReported: 500_000, rv15E9: 500_000, dvolE2: 6_000, refTick: 0,
      dispBp: 0, nSources: 4, kE4: 10_000, zone: 0, blockNumber: i, blockTimestamp: t, latencySec: 5,
      txHash: `0x${(i + 1).toString(16).padStart(64, "0")}`, logIndex: 0,
    };
  });
}

function rejections(n: number): Delivery[] {
  return Array.from({ length: n }, (_, i) => ({
    receiver: "0x0000000000000000000000000000000000000001", accepted: false, blockNumber: i, blockTimestamp: 1_000 + i,
    txHash: `0x${(i + 1).toString(16).padStart(64, "0")}`, logIndex: 0,
  }));
}

function render(reports: DeskReport[], deliveries: Delivery[]): string {
  const data: ClimData = {
    source: "mock", status: "ready", reports, swaps: [], deliveries, usedSnapshot: false,
    nowSec: reports.length ? reports[reports.length - 1].blockTimestamp + 10 : 0,
  };
  // the markup, without React's separators between adjacent text nodes
  return renderToStaticMarkup(createElement(SafetyPanel, { data })).replace(/<!-- -->/g, "");
}

const rows = (html: string) => html.match(/<li class="text-xs">/g)?.length ?? 0;

describe("SafetyPanel", () => {
  it("says when a list shows only the latest 5 of its count", () => {
    const html = render(silentReports(6), rejections(2));
    expect(html).toContain("bp): 6 (latest 5 listed)</span>");
    expect(html).toContain("rejected: 2</span>");
    expect(rows(html)).toBe(2 + 5);
  });

  it("adds no note when every row is listed", () => {
    const html = render(silentReports(5), rejections(7));
    expect(html).toContain("bp): 5</span>");
    expect(html).toContain("rejected: 7 (latest 5 listed)</span>");
    expect(rows(html)).toBe(5 + 5);
  });
});
