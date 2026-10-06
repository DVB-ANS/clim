import { describe, expect, it } from "vitest";
import { fillTimestamps, getLogsChunked, type LogFilter, mergeLogs, parseSnapshot, rpcUrls } from "./chain";
import type { RawLog } from "./encode";

const log = (block: number, logIndex: number, ts?: number): RawLog => ({
  address: "0x01",
  topics: ["0x02"],
  data: "0x",
  blockNumber: `0x${block.toString(16)}`,
  ...(ts === undefined ? {} : { blockTimestamp: `0x${ts.toString(16)}` as const }),
  transactionHash: `0x${block.toString(16).padStart(64, "0")}`,
  logIndex: `0x${logIndex.toString(16)}`,
});

describe("getLogsChunked", () => {
  const filter: LogFilter = { address: "0x0000000000000000000000000000000000000001", topics: ["0x02"] };

  it("walks the range sequentially and concatenates results", async () => {
    const seen: [number, number][] = [];
    const out = await getLogsChunked(async (f) => {
      const a = Number(f.fromBlock);
      const b = Number(f.toBlock);
      seen.push([a, b]);
      return [log(a, 0)];
    }, filter, 100, 250, { chunk: 100 });
    expect(seen).toEqual([[100, 199], [200, 250]]);
    expect(out).toHaveLength(2);
  });

  it("halves the chunk when the RPC rejects the range, then continues", async () => {
    const seen: [number, number][] = [];
    await getLogsChunked(async (f) => {
      const a = Number(f.fromBlock);
      const b = Number(f.toBlock);
      if (b - a + 1 > 50) throw new Error("exceed maximum block range: 50");
      seen.push([a, b]);
      return [];
    }, filter, 0, 119, { chunk: 100, minChunk: 10 });
    expect(seen).toEqual([[0, 49], [50, 99], [100, 119]]);
  });

  it("rethrows other errors", async () => {
    await expect(
      getLogsChunked(async () => {
        throw new Error("network down");
      }, filter, 0, 10),
    ).rejects.toThrow("network down");
  });
});

describe("mergeLogs", () => {
  it("dedupes on (tx hash, log index) and sorts in chain order", () => {
    const merged = mergeLogs([log(5, 1), log(3, 0)], [log(5, 1), log(4, 2), log(5, 0)]);
    expect(merged.map((l) => [Number(l.blockNumber), Number(l.logIndex)])).toEqual([[3, 0], [4, 2], [5, 0], [5, 1]]);
  });
});

describe("fillTimestamps", () => {
  it("keeps RPC timestamps and estimates missing ones at 12 s per block from an anchor", () => {
    const out = fillTimestamps([log(100, 0, 5_000), log(90, 0)], { block: 110, t: 5_130 });
    expect(Number(out[0].blockTimestamp)).toBe(5_000);
    expect(Number(out[1].blockTimestamp)).toBe(5_130 - 20 * 12);
  });
});

describe("parseSnapshot", () => {
  it("accepts a snapshot for the requested pair and rejects others", () => {
    const snap = { schema: "clim.chainSnapshot/1", pair: "live", chainId: 11155111, fromBlock: 1, toBlock: 2, generatedAt: "x", deskLogs: [], swapLogs: [] };
    expect(parseSnapshot(snap, "live")?.toBlock).toBe(2);
    expect(parseSnapshot(snap, "live")?.forwarderLogs).toEqual([]);
    expect(parseSnapshot(snap, "replay")).toBeNull();
    expect(parseSnapshot({ nope: 1 }, "live")).toBeNull();
  });
});

describe("rpcUrls", () => {
  it("puts an override first and keeps the public fallbacks", () => {
    expect(rpcUrls("https://my.rpc")).toEqual([
      "https://my.rpc",
      "https://sepolia.gateway.tenderly.co",
      "https://ethereum-sepolia-rpc.publicnode.com",
    ]);
    expect(rpcUrls(undefined)[0]).toBe("https://sepolia.gateway.tenderly.co");
  });
});
