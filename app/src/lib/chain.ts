import { type Address, createPublicClient, fallback, type Hex, http, numberToHex, pad, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { climHookAbi, REPORT_PROCESSED_TOPIC, RISK_REPORTED_TOPIC, riskDeskAbi, stateViewAbi, SWAP_TOPIC } from "./abis";
import type { Deployments, Pair, PairDeployment } from "./deployments";
import type { RawLog } from "./encode";
import type { DeskState, FeeMode, Quote } from "./feeMath";

// Tenderly's public gateway serves full log history; publicnode only keeps about the last
// 10,000 blocks of logs ("pruned history unavailable") and caps eth_getLogs at 50,000 blocks.
export const PUBLIC_RPCS = ["https://sepolia.gateway.tenderly.co", "https://ethereum-sepolia-rpc.publicnode.com"];
export const LOG_CHUNK = 5_000;

export function rpcUrls(override: string | undefined = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL): string[] {
  return override ? [override, ...PUBLIC_RPCS] : PUBLIC_RPCS;
}

export function makeClient(urls: string[] = rpcUrls()): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: fallback(urls.map((u) => http(u, { timeout: 30_000, retryCount: 1 }))),
  });
}

export type LogFilter = { address: Address | Address[]; topics: (Hex | Hex[] | null)[] };
export type LogRequester = (f: LogFilter & { fromBlock: Hex; toBlock: Hex }) => Promise<RawLog[]>;

const RANGE_ERROR = /range|limit|too many|exceed|10000|response size/i;

/** Sequential chunked eth_getLogs; halves the chunk when a public RPC rejects the range. */
export async function getLogsChunked(
  request: LogRequester,
  filter: LogFilter,
  from: number,
  to: number,
  opts: { chunk?: number; minChunk?: number } = {},
): Promise<RawLog[]> {
  let chunk = opts.chunk ?? LOG_CHUNK;
  const minChunk = opts.minChunk ?? 100;
  const out: RawLog[] = [];
  let a = from;
  while (a <= to) {
    const b = Math.min(a + chunk - 1, to);
    try {
      out.push(...(await request({ ...filter, fromBlock: numberToHex(a), toBlock: numberToHex(b) })));
      a = b + 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!RANGE_ERROR.test(msg) || chunk <= minChunk) throw e;
      chunk = Math.max(minChunk, Math.floor(chunk / 2));
    }
  }
  return out;
}

export function mergeLogs(a: RawLog[], b: RawLog[]): RawLog[] {
  const byKey = new Map<string, RawLog>();
  for (const l of [...a, ...b]) byKey.set(`${l.transactionHash}:${Number(l.logIndex)}`, l);
  return [...byKey.values()].sort(
    (x, y) => Number(x.blockNumber) - Number(y.blockNumber) || Number(x.logIndex) - Number(y.logIndex),
  );
}

export function fillTimestamps(logs: RawLog[], anchor: { block: number; t: number }, blockSec = 12): RawLog[] {
  return logs.map((l) =>
    l.blockTimestamp ? l : { ...l, blockTimestamp: numberToHex(anchor.t - (anchor.block - Number(l.blockNumber)) * blockSec) },
  );
}

export type ChainSnapshot = {
  schema: "clim.chainSnapshot/1";
  pair: Pair;
  chainId: number;
  fromBlock: number;
  toBlock: number;
  generatedAt: string;
  deskLogs: RawLog[];
  swapLogs: RawLog[];
  forwarderLogs: RawLog[];
};

export function parseSnapshot(raw: unknown, pair: Pair): ChainSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as ChainSnapshot;
  if (s.schema !== "clim.chainSnapshot/1" || s.pair !== pair || !Array.isArray(s.deskLogs) || !Array.isArray(s.swapLogs)) return null;
  return { ...s, forwarderLogs: Array.isArray(s.forwarderLogs) ? s.forwarderLogs : [] };
}

export function requesterFor(client: PublicClient): LogRequester {
  return (f) => client.request({ method: "eth_getLogs", params: [f] }) as Promise<RawLog[]>;
}

export type PairLogs = { deskLogs: RawLog[]; swapLogs: RawLog[]; forwarderLogs: RawLog[] };

export async function fetchPairLogs(
  client: PublicClient,
  d: PairDeployment,
  dep: Pick<Deployments, "uniswap" | "chainlink">,
  from: number,
  to: number,
): Promise<PairLogs> {
  const request = requesterFor(client);
  const deskLogs = await getLogsChunked(request, { address: d.riskDesk, topics: [RISK_REPORTED_TOPIC] }, from, to);
  const swapLogs = await getLogsChunked(
    request,
    { address: dep.uniswap.poolManager, topics: [SWAP_TOPIC, [d.V.poolId, d.S.poolId]] },
    from,
    to,
  );
  const forwarders = [dep.chainlink.mockKeystoneForwarder, dep.chainlink.keystoneForwarder].filter((a): a is Address => !!a);
  const forwarderLogs = forwarders.length
    ? await getLogsChunked(request, { address: forwarders, topics: [REPORT_PROCESSED_TOPIC, pad(d.riskDesk.toLowerCase() as Hex, { size: 32 })] }, from, to)
    : [];
  return { deskLogs, swapLogs, forwarderLogs };
}

export type PairState = {
  desk: DeskState;
  quote: Quote;
  latestBlock: { number: number; timestamp: number };
  protocolFees: { V: number; S: number }; // must be 0: Swap.fee is then the LP fee alone
};

export async function readPairState(client: PublicClient, d: PairDeployment, stateView: Address): Promise<PairState> {
  const block = await client.getBlock({ blockTag: "latest" });
  const at = { blockNumber: block.number };
  const [state, quote, slotV, slotS] = await Promise.all([
    client.readContract({ address: d.riskDesk, abi: riskDeskAbi, functionName: "state", ...at }),
    client.readContract({ address: d.hook, abi: climHookAbi, functionName: "quoteFee", ...at }),
    client.readContract({ address: stateView, abi: stateViewAbi, functionName: "getSlot0", args: [d.V.poolId], ...at }),
    client.readContract({ address: stateView, abi: stateViewAbi, functionName: "getSlot0", args: [d.S.poolId], ...at }),
  ]);
  const [tObs, sigmaE9, kE4, flags, seq] = state;
  const [fee, mode] = quote;
  return {
    desk: { tObs, sigmaE9, kE4, flags, seq },
    quote: { feePips: fee, mode: mode as FeeMode },
    latestBlock: { number: Number(block.number), timestamp: Number(block.timestamp) },
    protocolFees: { V: slotV[2], S: slotS[2] },
  };
}
