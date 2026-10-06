"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fetchPairLogs, fillTimestamps, makeClient, mergeLogs, type PairState, parseSnapshot, readPairState } from "@/lib/chain";
import { type DataSource, dataSource, deployments, params } from "@/lib/config";
import { type Delivery, type DeskReport, decodeDeliveries, decodeReports, decodeSwaps, type SwapRow } from "@/lib/decode";
import type { Pair, PairDeployment } from "@/lib/deployments";
import type { RawLog } from "@/lib/encode";
import { quoteFee } from "@/lib/feeMath";
import { makeMockWorld, MOCK_BLOCK_SEC } from "@/lib/mock";
import { deskStateOf } from "@/lib/series";

export const POLL_MS = 12_000;
export const MOCK_REFRESH_MS = 30_000;

export type ClimData = {
  source: DataSource;
  status: "loading" | "ready" | "error";
  error?: string;
  pair?: PairDeployment;
  arbRouter?: Address;
  reports: DeskReport[];
  swaps: SwapRow[];
  deliveries: Delivery[];
  state?: PairState;
  nowSec: number;
  usedSnapshot: boolean;
};

const EMPTY = { reports: [], swaps: [], deliveries: [], nowSec: 0, usedSnapshot: false };

// Mock mode: one simulated world per page load, generated 30 min ahead (so its storm, degraded
// window, forged report and blind gap are already in the past) and revealed as time passes: a new
// report every 30 s, as on Sepolia, without regenerating or re-decoding anything. The cache is shared
// by every page of the visit, so /app opens with its data while the launch transition plays.
const MOCK_LOOKAHEAD_SEC = 1_800;
const MOCK_HOURS = 6.5;
type MockCache = { endSec: number; t0: number; pair: PairDeployment; arbRouter: Address; reports: DeskReport[]; swaps: SwapRow[]; deliveries: Delivery[] };
let mockCache: MockCache | undefined;

function mockAt(now: number): ClimData {
  if (!mockCache || now > mockCache.endSec - 60) {
    const endSec = now + MOCK_LOOKAHEAD_SEC;
    const w = makeMockWorld({ nowSec: endSec, params, hours: MOCK_HOURS });
    mockCache = {
      endSec, t0: endSec - MOCK_HOURS * 3_600, pair: w.pair, arbRouter: w.arbRouter,
      reports: decodeReports(w.deskLogs), swaps: decodeSwaps(w.swapLogs), deliveries: decodeDeliveries(w.forwarderLogs),
    };
  }
  const c = mockCache;
  const landed = <T extends { blockTimestamp: number }>(rows: T[]) => rows.filter((r) => r.blockTimestamp <= now);
  const reports = landed(c.reports);
  const last = reports.at(-1);
  const desk = last ? deskStateOf(last) : { tObs: 0, sigmaE9: 0, kE4: 0, flags: 0, seq: 0 };
  return {
    source: "mock", status: "ready", pair: c.pair, arbRouter: c.arbRouter,
    reports, swaps: landed(c.swaps), deliveries: landed(c.deliveries),
    state: {
      desk, quote: quoteFee(desk, now, params),
      latestBlock: { number: c.pair.startBlock + Math.floor((now - c.t0) / MOCK_BLOCK_SEC), timestamp: now },
      protocolFees: { V: 0, S: 0 },
    },
    nowSec: now, usedSnapshot: false,
  };
}

export function useClimData(pairName: Pair): ClimData {
  const source = dataSource(pairName);
  // a page opened later in the visit starts from the mock world the first one built (never on the
  // server, where the cache stays empty, so hydration always starts from "loading")
  const [data, setData] = useState<ClimData>(() =>
    source === "mock" && mockCache ? mockAt(Math.floor(Date.now() / 1000)) : { source, status: "loading", ...EMPTY },
  );
  const [nowSec, setNowSec] = useState(0);

  useEffect(() => {
    const tick = () => setNowSec(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (source === "mock") {
      const reveal = () => setData(mockAt(Math.floor(Date.now() / 1000)));
      reveal();
      const id = setInterval(reveal, MOCK_REFRESH_MS);
      return () => clearInterval(id);
    }

    const pair = deployments.pairs[pairName];
    if (!pair) return;
    const client = makeClient();
    const logs: Record<"deskLogs" | "swapLogs" | "forwarderLogs", RawLog[]> = { deskLogs: [], swapLogs: [], forwarderLogs: [] };
    let next = pair.startBlock;
    let usedSnapshot = false;
    let first = true;
    let busy = false;

    async function load() {
      if (busy || !pair) return;
      busy = true;
      try {
        if (first) {
          first = false;
          const raw = await fetch(`/data/chain/${pairName}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const snap = parseSnapshot(raw, pairName);
          if (snap) {
            logs.deskLogs = snap.deskLogs;
            logs.swapLogs = snap.swapLogs;
            logs.forwarderLogs = snap.forwarderLogs;
            next = snap.toBlock + 1;
            usedSnapshot = true;
          }
        }
        const state = await readPairState(client, pair, deployments.uniswap.stateView);
        const to = state.latestBlock.number;
        if (next <= to) {
          const fresh = await fetchPairLogs(client, pair, deployments, next, to);
          const anchor = { block: to, t: state.latestBlock.timestamp };
          for (const k of ["deskLogs", "swapLogs", "forwarderLogs"] as const) logs[k] = mergeLogs(logs[k], fillTimestamps(fresh[k], anchor));
          next = to + 1;
        }
        if (!cancelled) {
          setData({
            source, status: "ready", pair, arbRouter: deployments.routers.arb,
            reports: decodeReports(logs.deskLogs), swaps: decodeSwaps(logs.swapLogs), deliveries: decodeDeliveries(logs.forwarderLogs),
            state, nowSec: state.latestBlock.timestamp, usedSnapshot,
          });
        }
      } catch (e) {
        const error = e instanceof Error ? e.message.split("\n")[0] : String(e);
        if (!cancelled) setData((d) => ({ ...d, source, pair, status: d.status === "ready" ? "ready" : "error", error }));
      } finally {
        busy = false;
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pairName, source]);

  return { ...data, nowSec: nowSec || data.nowSec };
}
