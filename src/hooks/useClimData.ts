"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { fetchPairLogs, fillTimestamps, makeClient, mergeLogs, type PairState, parseSnapshot, readPairState } from "@/lib/chain";
import { type DataSource, dataSource, deployments, params } from "@/lib/config";
import { type Delivery, type DeskReport, decodeDeliveries, decodeReports, decodeSwaps, type SwapRow } from "@/lib/decode";
import type { Pair, PairDeployment } from "@/lib/deployments";
import type { RawLog } from "@/lib/encode";
import { makeMockWorld } from "@/lib/mock";

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

export function useClimData(pairName: Pair): ClimData {
  const source = dataSource(pairName);
  const [data, setData] = useState<ClimData>({ source, status: "loading", ...EMPTY });
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
      const regenerate = () => {
        const now = Math.floor(Date.now() / 1000);
        const w = makeMockWorld({ nowSec: now, params });
        setData({
          source, status: "ready", pair: w.pair, arbRouter: w.arbRouter,
          reports: decodeReports(w.deskLogs), swaps: decodeSwaps(w.swapLogs), deliveries: decodeDeliveries(w.forwarderLogs),
          state: { desk: w.desk, quote: w.quote, latestBlock: w.latestBlock, protocolFees: w.protocolFees },
          nowSec: now, usedSnapshot: false,
        });
      };
      regenerate();
      const id = setInterval(regenerate, MOCK_REFRESH_MS);
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
