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
// report every 30 s, as on Sepolia, without regenerating or re-decoding anything. Like the Sepolia
// cache below, it is shared by every page of the visit.
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

// Sepolia: the logs read so far for each pair, where the next read starts, and the last data shown.
// Shared by every page of the visit, so a page opened later (the landing's "Launch app" into /app)
// starts from the data the previous page already read, while the launch transition plays, and only
// reads the blocks since: the 2 MB snapshot is downloaded once per visit. Filled only in effects, so
// the server render and a hard reload both start at "loading" and hydrate without a mismatch.
type ChainLogs = Record<"deskLogs" | "swapLogs" | "forwarderLogs", RawLog[]>;
type ChainCache = { logs: ChainLogs; next: number; usedSnapshot: boolean; data: ClimData };
const chainCache: Partial<Record<Pair, ChainCache>> = {};

export function useClimData(pairName: Pair): ClimData {
  const source = dataSource(pairName);
  // a page opened later in the visit starts from what the first one read: the mock world it built,
  // or the Sepolia logs it fetched (never on the server, where both caches stay empty, so hydration
  // always starts from "loading")
  const [data, setData] = useState<ClimData>(() => {
    if (source === "mock" && mockCache) return mockAt(Math.floor(Date.now() / 1000));
    const cached = source === "sepolia" ? chainCache[pairName] : undefined;
    return cached ? cached.data : { source, status: "loading", ...EMPTY };
  });
  // the clock starts at "now" too when the data came from a cache, so the first tick below changes
  // nothing and the page is not rendered a second time while the launch transition opens it
  const [nowSec, setNowSec] = useState(() =>
    (source === "mock" ? mockCache : source === "sepolia" ? chainCache[pairName] : undefined) ? Math.floor(Date.now() / 1000) : 0,
  );

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
    // resume from the visit's cache when a previous page already read this pair: no snapshot again
    const cached = chainCache[pairName];
    const logs: ChainLogs = cached ? { ...cached.logs } : { deskLogs: [], swapLogs: [], forwarderLogs: [] };
    let next = cached?.next ?? pair.startBlock;
    let usedSnapshot = cached?.usedSnapshot ?? false;
    let first = !cached;
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
          const ready: ClimData = {
            source, status: "ready", pair, arbRouter: deployments.routers.arb,
            reports: decodeReports(logs.deskLogs), swaps: decodeSwaps(logs.swapLogs), deliveries: decodeDeliveries(logs.forwarderLogs),
            state, nowSec: state.latestBlock.timestamp, usedSnapshot,
          };
          setData(ready);
          chainCache[pairName] = { logs: { ...logs }, next, usedSnapshot, data: ready };
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
