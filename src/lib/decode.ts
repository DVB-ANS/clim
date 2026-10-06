import { type Address, decodeEventLog, getAddress, type Hex, hexToNumber } from "viem";
import { forwarderAbi, poolManagerAbi, REPORT_PROCESSED_TOPIC, RISK_REPORTED_TOPIC, riskDeskAbi, SWAP_TOPIC } from "./abis";
import type { RawLog, RiskReportedArgs } from "./encode";

type LogPosition = { blockNumber: number; blockTimestamp: number; txHash: Hex; logIndex: number };

/** One RiskReported event. latencySec = block time of inclusion minus the DON observation time. */
export type DeskReport = RiskReportedArgs & LogPosition & { latencySec: number };

export type SwapRow = LogPosition & {
  poolId: Hex;
  sender: Address;
  amount0: bigint; // swapper's delta: negative = paid into the pool
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  fee: number; // pips actually charged
};

function position(log: RawLog): LogPosition {
  return {
    blockNumber: hexToNumber(log.blockNumber),
    blockTimestamp: log.blockTimestamp ? hexToNumber(log.blockTimestamp) : Number.NaN,
    txHash: log.transactionHash,
    logIndex: hexToNumber(log.logIndex),
  };
}

function byChainOrder(a: LogPosition, b: LogPosition): number {
  return a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
}

export function decodeReports(logs: RawLog[]): DeskReport[] {
  return logs
    .filter((l) => l.topics[0]?.toLowerCase() === RISK_REPORTED_TOPIC)
    .map((l) => {
      const { args } = decodeEventLog({ abi: riskDeskAbi, eventName: "RiskReported", data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      const pos = position(l);
      return {
        seq: args.seq,
        tObs: args.tObs,
        sigmaApplied: args.sigmaApplied,
        sigmaReported: args.sigmaReported,
        rv15E9: args.rv15E9,
        dvolE2: args.dvolE2,
        refTick: args.refTick,
        dispBp: args.dispBp,
        nSources: args.nSources,
        kE4: args.kE4,
        zone: args.zone,
        ...pos,
        latencySec: pos.blockTimestamp - args.tObs,
      };
    })
    .sort(byChainOrder);
}

export function decodeSwaps(logs: RawLog[]): SwapRow[] {
  return logs
    .filter((l) => l.topics[0]?.toLowerCase() === SWAP_TOPIC)
    .map((l) => {
      const { args } = decodeEventLog({ abi: poolManagerAbi, eventName: "Swap", data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      return {
        poolId: args.id,
        sender: getAddress(args.sender),
        amount0: args.amount0,
        amount1: args.amount1,
        sqrtPriceX96: args.sqrtPriceX96,
        liquidity: args.liquidity,
        tick: args.tick,
        fee: args.fee,
        ...position(l),
      };
    })
    .sort(byChainOrder);
}

/** One delivery attempt by a Chainlink forwarder to our desk; accepted = false means RiskDesk rejected it. */
export type Delivery = LogPosition & { receiver: Address; accepted: boolean };

export function decodeDeliveries(logs: RawLog[]): Delivery[] {
  return logs
    .filter((l) => l.topics[0]?.toLowerCase() === REPORT_PROCESSED_TOPIC)
    .map((l) => {
      const { args } = decodeEventLog({ abi: forwarderAbi, eventName: "ReportProcessed", data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      return { receiver: getAddress(args.receiver), accepted: args.result, ...position(l) };
    })
    .sort(byChainOrder);
}

/** Index of the last row with blockNumber <= block in a chain-ordered array, or -1. */
export function lastAtOrBefore(rows: { blockNumber: number }[], block: number): number {
  let i = -1;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].blockNumber <= block) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return i;
}
