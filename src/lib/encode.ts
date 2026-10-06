import { type Address, encodeAbiParameters, encodeEventTopics, type Hex, numberToHex } from "viem";
import { forwarderAbi, poolManagerAbi, riskDeskAbi } from "./abis";

/** An eth_getLogs entry as returned by the RPC (hex strings), JSON-serialisable for snapshots. */
export type RawLog = {
  address: Hex;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockTimestamp?: Hex;
  transactionHash: Hex;
  logIndex: Hex;
};

export type RiskReportedArgs = {
  seq: number;
  tObs: number;
  sigmaApplied: number;
  sigmaReported: number;
  rv15E9: number;
  dvolE2: number;
  refTick: number;
  dispBp: number;
  nSources: number;
  kE4: number;
  zone: number;
};

export type SwapArgs = {
  poolId: Hex;
  sender: Address;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  fee: number;
};

export type LogMeta = {
  address: Hex;
  blockNumber: number;
  blockTimestamp: number;
  transactionHash: Hex;
  logIndex: number;
};

function meta(m: LogMeta) {
  return {
    address: m.address,
    blockNumber: numberToHex(m.blockNumber),
    blockTimestamp: numberToHex(m.blockTimestamp),
    transactionHash: m.transactionHash,
    logIndex: numberToHex(m.logIndex),
  };
}

export function encodeRiskReportedLog(a: RiskReportedArgs, m: LogMeta): RawLog {
  const topics = encodeEventTopics({ abi: riskDeskAbi, eventName: "RiskReported", args: { seq: a.seq } }) as Hex[];
  const data = encodeAbiParameters(
    [
      { type: "uint40" }, { type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" },
      { type: "int24" }, { type: "uint16" }, { type: "uint8" }, { type: "uint16" }, { type: "uint8" },
    ],
    [a.tObs, a.sigmaApplied, a.sigmaReported, a.rv15E9, a.dvolE2, a.refTick, a.dispBp, a.nSources, a.kE4, a.zone],
  );
  return { ...meta(m), topics, data };
}

export function encodeSwapLog(a: SwapArgs, m: LogMeta): RawLog {
  const topics = encodeEventTopics({
    abi: poolManagerAbi,
    eventName: "Swap",
    args: { id: a.poolId, sender: a.sender },
  }) as Hex[];
  const data = encodeAbiParameters(
    [
      { type: "int128" }, { type: "int128" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" },
      { type: "uint24" },
    ],
    [a.amount0, a.amount1, a.sqrtPriceX96, a.liquidity, a.tick, a.fee],
  );
  return { ...meta(m), topics, data };
}

export type ReportProcessedArgs = { receiver: Address; workflowExecutionId: Hex; reportId: Hex; result: boolean };

export function encodeReportProcessedLog(a: ReportProcessedArgs, m: LogMeta): RawLog {
  const topics = encodeEventTopics({
    abi: forwarderAbi,
    eventName: "ReportProcessed",
    args: { receiver: a.receiver, workflowExecutionId: a.workflowExecutionId, reportId: a.reportId },
  }) as Hex[];
  return { ...meta(m), topics, data: encodeAbiParameters([{ type: "bool" }], [a.result]) };
}
