"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fetchPairLogs, fillTimestamps, makeClient, mergeLogs, type PairState, parseSnapshot, readPairState } from "@/lib/chain";
import { deployments } from "@/lib/config";
import { type Delivery, type DeskReport, decodeDeliveries, decodeReports, decodeSwaps, type SwapRow } from "@/lib/decode";
import type { Pair, PairDeployment } from "@/lib/deployments";
import type { RawLog } from "@/lib/encode";

export const POLL_MS = 12_000;

export type ClimData = {
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

// Sepolia: the logs read so far for each pair, where the next read starts, and the last data shown.
// Shared by every page of the visit, so a page opened later (the landing's "Launch app" into /app)
// starts from the data the previous page already read, while the launch transition plays, and only
// reads the blocks since: the 2 MB snapshot is downloaded once per visit. Filled only in effects, so
// the server render and a hard reload both start at "loading" and hydrate without a mismatch.
type ChainLogs = Record<"deskLogs" | "swapLogs" | "forwarderLogs", RawLog[]>;
type ChainCache = { logs: ChainLogs; next: number; usedSnapshot: boolean; data: ClimData };
const chainCache: Partial<Record<Pair, ChainCache>> = {};

export function useClimData(pairName: Pair): ClimData {
  // a page opened later in the visit starts from the Sepolia logs the first one fetched (never on the
  // server, where the cache stays empty, so hydration always starts from "loading")
  const [data, setData] = useState<ClimData>(
    () => chainCache[pairName]?.data ?? (deployments.pairs[pairName] ? { status: "loading", ...EMPTY } : { status: "error", error: "pair not deployed", ...EMPTY }),
  );
  // the clock starts at "now" too when the data came from a cache, so the first tick below changes
  // nothing and the page is not rendered a second time while the launch transition opens it
  const [nowSec, setNowSec] = useState(() => (chainCache[pairName] ? Math.floor(Date.now() / 1000) : 0));

  useEffect(() => {
    const tick = () => setNowSec(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pair = deployments.pairs[pairName];
    if (!pair) return; // the initial state already says so
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
            status: "ready", pair, arbRouter: deployments.routers.arb,
            reports: decodeReports(logs.deskLogs), swaps: decodeSwaps(logs.swapLogs), deliveries: decodeDeliveries(logs.forwarderLogs),
            state, nowSec: state.latestBlock.timestamp, usedSnapshot,
          };
          setData(ready);
          chainCache[pairName] = { logs: { ...logs }, next, usedSnapshot, data: ready };
        }
      } catch (e) {
        const error = e instanceof Error ? e.message.split("\n")[0] : String(e);
        if (!cancelled) setData((d) => ({ ...d, pair, status: d.status === "ready" ? "ready" : "error", error }));
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
  }, [pairName]);

  return { ...data, nowSec: nowSec || data.nowSec };
}
