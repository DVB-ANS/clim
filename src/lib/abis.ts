import { parseAbi, toEventSelector } from "viem";

// Canonical interfaces (docs/superpowers/plans/2026-10-06-clim-00-master.md). abis.test.ts checks
// them against shared/abis/*.json when those files exist.

export const riskDeskAbi = parseAbi([
  "event RiskReported(uint32 indexed seq, uint40 tObs, uint32 sigmaApplied, uint32 sigmaReported, uint32 rv15E9, uint16 dvolE2, int24 refTick, uint16 dispBp, uint8 nSources, uint16 kE4, uint8 zone)",
  "function state() view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq)",
]);

// Chainlink Keystone forwarders (MockKeystoneForwarder and KeystoneForwarder) emit this after every
// delivery attempt; result = false is the on-chain evidence of a rejected (e.g. forged) report.
export const forwarderAbi = parseAbi([
  "event ReportProcessed(address indexed receiver, bytes32 indexed workflowExecutionId, bytes2 indexed reportId, bool result)",
]);

export const climHookAbi = parseAbi(["function quoteFee() view returns (uint24 fee, uint8 mode)"]);

// Note: despite the v4-core natspec, Swap.amount0/amount1 are the SWAPPER's deltas
// (negative = paid into the pool, positive = received), see Pool.swap / PoolManager._swap.
export const poolManagerAbi = parseAbi([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export const poolSwapTestAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }",
  "struct TestSettings { bool takeClaims; bool settleUsingBurn; }",
  "function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256 delta)",
]);

export const testTokenAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

export const RISK_REPORTED_TOPIC = toEventSelector(riskDeskAbi[0]);
export const SWAP_TOPIC = toEventSelector(poolManagerAbi[0]);
export const REPORT_PROCESSED_TOPIC = toEventSelector(forwarderAbi[0]);
