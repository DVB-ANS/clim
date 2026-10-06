import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Abi, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  climHookAbi,
  poolModifyLiquidityTestAbi,
  poolSwapTestAbi,
  REPORT_PROCESSED_TOPIC,
  RISK_REPORTED_TOPIC,
  riskDeskAbi,
  stateViewAbi,
  SWAP_TOPIC,
  testTokenAbi,
} from "./abis";

describe("ABI fragments", () => {
  it("Swap topic matches PoolManager logs seen on Sepolia", () => {
    expect(SWAP_TOPIC).toBe("0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f");
  });
  it("PoolSwapTest.swap selector matches the deployed PoolSwapTest bytecode", () => {
    const swap = poolSwapTestAbi.find((x) => x.type === "function" && x.name === "swap");
    expect(swap && toFunctionSelector(swap)).toBe("0x2229d0b4");
  });
  it("ReportProcessed topic matches MockKeystoneForwarder logs seen on Sepolia", () => {
    expect(REPORT_PROCESSED_TOPIC).toBe("0x3617b009e9785c42daebadb6d3fb553243a4bf586d07ea72d65d80013ce116b5");
  });
  it("RiskReported topic is derived from the canonical signature", () => {
    expect(RISK_REPORTED_TOPIC).toBe(
      toEventSelector(
        "RiskReported(uint32,uint40,uint32,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8)",
      ),
    );
  });
});

// Drift guard: once plan 01 exports shared/abis/*.json, the hand-written fragments must match.
function sharedAbi(name: string): Abi | null {
  const path = fileURLToPath(new URL(`../../../shared/abis/${name}.json`, import.meta.url));
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return (Array.isArray(raw) ? raw : raw.abi) as Abi;
}
function selectors(abi: Abi): string[] {
  return abi.flatMap((x) =>
    x.type === "event" ? [toEventSelector(x)] : x.type === "function" ? [toFunctionSelector(x)] : [],
  );
}

/** "function name(types)" / "error name(types)" / "event name(types)": compares errors too, which have no selector helper. */
function signatures(abi: Abi): string[] {
  return abi.flatMap((x) =>
    x.type === "function" || x.type === "event" || x.type === "error" ? [`${x.type} ${x.name}(${x.inputs.map((i) => i.type).join(",")})`] : [],
  );
}

describe("drift against shared/abis", () => {
  const desk = sharedAbi("RiskDesk");
  const hook = sharedAbi("ClimHook");
  const token = sharedAbi("TestToken");
  it.skipIf(!desk)("RiskDesk.json contains RiskReported and state()", () => {
    const s = selectors(desk!);
    for (const want of selectors(riskDeskAbi)) expect(s).toContain(want);
  });
  it.skipIf(!hook)("ClimHook.json contains quoteFee()", () => {
    const s = selectors(hook!);
    for (const want of selectors(climHookAbi)) expect(s).toContain(want);
  });
  it.skipIf(!token)("TestToken.json contains the faucet, its cooldown error and the ERC-20 calls /lp uses", () => {
    const s = signatures(token!);
    for (const want of signatures(testTokenAbi)) expect(s).toContain(want);
    expect(signatures(testTokenAbi)).toContain("error FaucetCooldown(uint256)");
  });
});

// Scope upgrade (wallet, /swap, /lp): selectors read from the Sepolia bytecode on 2026-10-06.
describe("write-side fragments for /swap and /lp", () => {
  it("PoolModifyLiquidityTest.modifyLiquidity matches the deployed PoolModifyLiquidityTest (0x0C47…0B0A)", () => {
    const f = poolModifyLiquidityTestAbi.find((x) => x.type === "function" && x.name === "modifyLiquidity");
    expect(f && toFunctionSelector(f)).toBe("0x5a6bcfda");
  });
  it("StateView position reads match the deployed StateView (0xE1Dd…4C)", () => {
    const sel = (name: string) => {
      const f = stateViewAbi.find((x) => x.type === "function" && x.name === name);
      return f && toFunctionSelector(f);
    };
    expect(sel("getPositionInfo")).toBe("0xdacf1d2f");
    expect(sel("getFeeGrowthInside")).toBe("0x53e9c1fb");
    expect(sel("getSlot0")).toBe("0xc815641c");
  });
  it("TestToken exposes the public faucet() decided for plan 01 (no argument)", () => {
    const f = testTokenAbi.find((x) => x.type === "function" && x.name === "faucet");
    expect(f && toFunctionSelector(f)).toBe(toFunctionSelector("function faucet()"));
  });
});
