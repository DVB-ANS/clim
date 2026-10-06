// Deterministic mock chain (RiskReported + Swap logs) so the dashboard runs before the contracts
// are deployed. The logs are ABI-encoded exactly like the real ones and go through the same decoders.
import { type Address, type Hex, numberToHex } from "viem";
import { computePoolId, type PairDeployment } from "./deployments";
import { encodeReportProcessedLog, encodeRiskReportedLog, encodeSwapLog, type RawLog } from "./encode";
import { type DeskState, type FeeParams, FLAG_DEGRADED, type Quote, quoteFee } from "./feeMath";
import { DISP_MAX_BP } from "./series";
import { annualPctToSigmaE9, ethUsdToTick, SQRT_SECONDS_PER_YEAR } from "./units";

export const MOCK_STATIC_FEE_PIPS = 1_050;
export const MOCK_ADDR = {
  tETH: "0x1000000000000000000000000000000000000001",
  tUSD: "0x2000000000000000000000000000000000000002",
  arbRouter: "0x3000000000000000000000000000000000000003",
  riskDesk: "0x4000000000000000000000000000000000000004",
  hook: "0x5000000000000000000000000000000000001080",
  retailRouter: "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe",
  poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  forwarder: "0x15fC6ae953E024d975e77382eEeC56A9101f9F88",
} as const satisfies Record<string, Address>;

const SIGMA_MIN_E9 = 17_807;
const SIGMA_MAX_E9 = 1_780_724;
export const MOCK_BLOCK_SEC = 12;
const BLOCK_SEC = MOCK_BLOCK_SEC;
const REPORT_EVERY_SEC = 30;
const REPORT_LATENCY_SEC = 36;
const LIQUIDITY = 2e23; // full-range L in raw units: about $20M of TVL at $2,500
const Q96 = 2 ** 96;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type MockWorld = {
  pair: PairDeployment;
  arbRouter: Address;
  deskLogs: RawLog[];
  swapLogs: RawLog[];
  forwarderLogs: RawLog[];
  desk: DeskState;
  quote: Quote;
  latestBlock: { number: number; timestamp: number };
  protocolFees: { V: number; S: number };
};

type Pool = { poolId: Hex; s: number; dynamic: boolean };

export function makeMockWorld(o: { nowSec: number; params: FeeParams; seed?: number; hours?: number }): MockWorld {
  const rand = mulberry32(o.seed ?? 7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const nBlocks = Math.floor(((o.hours ?? 6) * 3_600) / BLOCK_SEC);
  const firstBlock = 9_000_000;
  const t0 = o.nowSec - nBlocks * BLOCK_SEC;

  const keyV = { currency0: MOCK_ADDR.tETH, currency1: MOCK_ADDR.tUSD, fee: 0x800000, tickSpacing: 60, hooks: MOCK_ADDR.hook };
  const keyS = { ...keyV, fee: MOCK_STATIC_FEE_PIPS, hooks: "0x0000000000000000000000000000000000000000" as Address };
  const pair: PairDeployment = {
    riskDesk: MOCK_ADDR.riskDesk,
    hook: MOCK_ADDR.hook,
    startBlock: firstBlock,
    token0IsEth: true,
    V: { poolId: computePoolId(keyV), key: keyV },
    S: { poolId: computePoolId(keyS), key: keyS },
  };

  // Vol regime (annualised %): calm 35%, a storm peaking at 180% around 55% of the run.
  const volPct = (t: number) => 35 + 145 * Math.exp(-((((t - t0) / (o.nowSec - t0) - 0.55) / 0.07) ** 2));
  const phase = (t: number) => (t - t0) / (o.nowSec - t0);
  const gap = (t: number) => phase(t) > 0.85 && phase(t) < 0.87; // CRE loop cut: no reports
  const degraded = (t: number) => phase(t) > 0.3 && phase(t) < 0.32; // venues disagree
  const forgedAt = t0 + Math.round(0.7 * (o.nowSec - t0)); // a third party pushes sigma = 0 through the mock forwarder

  // Market path, one log-price step per block.
  const lnm: number[] = [Math.log(2_500)];
  for (let b = 1; b <= nBlocks; b++) {
    const t = t0 + b * BLOCK_SEC;
    lnm.push(lnm[b - 1] + (volPct(t) / 100 / SQRT_SECONDS_PER_YEAR) * Math.sqrt(BLOCK_SEC) * gauss());
  }

  const deskLogs: RawLog[] = [];
  const swapLogs: RawLog[] = [];
  const forwarderLogs: RawLog[] = [];
  let forged = false;
  let desk: DeskState = { tObs: 0, sigmaE9: 0, kE4: 0, flags: 0, seq: 0 };
  let nextReport = t0 + REPORT_EVERY_SEC;
  const pools: Pool[] = [
    { poolId: pair.V.poolId, s: 50, dynamic: true },
    { poolId: pair.S.poolId, s: 50, dynamic: false },
  ];

  for (let b = 1; b <= nBlocks; b++) {
    const t = t0 + b * BLOCK_SEC;
    const block = firstBlock + b;
    let logIndex = 0;
    const meta = (address: Hex) => ({
      address,
      blockNumber: block,
      blockTimestamp: t,
      transactionHash: numberToHex(block * 1_000 + logIndex, { size: 32 }),
      logIndex: logIndex++,
    });

    const delivery = (result: boolean) =>
      encodeReportProcessedLog(
        { receiver: MOCK_ADDR.riskDesk, workflowExecutionId: numberToHex(block, { size: 32 }), reportId: "0x0001", result },
        meta(MOCK_ADDR.forwarder),
      );
    if (!forged && t >= forgedAt) {
      forged = true;
      forwarderLogs.push(delivery(false));
    }

    while (nextReport + REPORT_LATENCY_SEC <= t) {
      const tObs = nextReport;
      nextReport += REPORT_EVERY_SEC;
      if (gap(tObs)) continue;
      const reported = annualPctToSigmaE9(volPct(tObs) * (1 + 0.12 * gauss()));
      const prev = desk.sigmaE9;
      const lo = prev === 0 ? SIGMA_MIN_E9 : Math.max(SIGMA_MIN_E9, Math.floor(0.8 * prev));
      const hi = prev === 0 ? SIGMA_MAX_E9 : Math.min(SIGMA_MAX_E9, 2 * prev);
      const applied = Math.min(hi, Math.max(lo, reported));
      const dispBp = degraded(tObs) ? 31 : 2 + Math.floor(rand() * 4);
      const seq = desk.seq + 1;
      const bObs = Math.min(nBlocks, Math.max(0, Math.floor((tObs - t0) / BLOCK_SEC)));
      deskLogs.push(
        encodeRiskReportedLog(
          {
            seq, tObs, sigmaApplied: applied, sigmaReported: reported, rv15E9: reported,
            dvolE2: Math.round((volPct(tObs) * 1.05 + 3) * 100), refTick: ethUsdToTick(Math.exp(lnm[bObs]), true),
            dispBp, nSources: degraded(tObs) ? 3 : 4, kE4: 10_000, zone: 0,
          },
          meta(MOCK_ADDR.riskDesk),
        ),
      );
      forwarderLogs.push(delivery(true));
      desk = { tObs, sigmaE9: applied, kE4: 10_000, flags: dispBp > DISP_MAX_BP ? FLAG_DEGRADED : 0, seq };
    }

    const m = Math.exp(lnm[b]);
    const retail = rand() < 0.45 ? { buy: rand() < 0.5, usd: 500 * Math.exp(0.8 * gauss()) } : null;
    for (const pool of pools) {
      const feePips = pool.dynamic ? quoteFee(desk, t, o.params).feePips : MOCK_STATIC_FEE_PIPS;
      const f = feePips / 1e6;
      const emit = (sender: Address, s1: number) => {
        const s0 = pool.s;
        const dx = LIQUIDITY * (1 / s1 - 1 / s0); // token0 (ETH) into the pool, net of fee
        const dy = LIQUIDITY * (s1 - s0); // token1 (USD) into the pool, net of fee
        const amount0 = dx > 0 ? -dx / (1 - f) : -dx;
        const amount1 = dy > 0 ? -dy / (1 - f) : -dy;
        pool.s = s1;
        swapLogs.push(
          encodeSwapLog(
            {
              poolId: pool.poolId, sender, amount0: BigInt(Math.round(amount0)), amount1: BigInt(Math.round(amount1)),
              sqrtPriceX96: BigInt(Math.floor(s1 * Q96)), liquidity: BigInt(LIQUIDITY), tick: ethUsdToTick(s1 * s1, true), fee: feePips,
            },
            meta(MOCK_ADDR.poolManager),
          ),
        );
      };
      // Top of block: like the arb bot of plan 04, push the pool to the edge of the no-arbitrage band
      // [m(1 - f), m / (1 - f)].
      const p = pool.s * pool.s;
      if (p < m * (1 - f)) emit(MOCK_ADDR.arbRouter, Math.sqrt(m * (1 - f)));
      else if (p > m / (1 - f)) emit(MOCK_ADDR.arbRouter, Math.sqrt(m / (1 - f)));
      // Then retail flow, the same order on both pools.
      if (retail) {
        const s0 = pool.s;
        const s1 = retail.buy
          ? s0 + (retail.usd * 1e18 * (1 - f)) / LIQUIDITY
          : 1 / (1 / s0 + ((retail.usd / m) * 1e18 * (1 - f)) / LIQUIDITY);
        emit(MOCK_ADDR.retailRouter, s1);
      }
    }
  }

  return {
    pair,
    arbRouter: MOCK_ADDR.arbRouter,
    deskLogs,
    swapLogs,
    forwarderLogs,
    desk,
    quote: quoteFee(desk, o.nowSec, o.params),
    latestBlock: { number: firstBlock + nBlocks, timestamp: o.nowSec },
    protocolFees: { V: 0, S: 0 },
  };
}
