import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Abi, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { climHookAbi, poolSwapTestAbi, REPORT_PROCESSED_TOPIC, RISK_REPORTED_TOPIC, riskDeskAbi, SWAP_TOPIC } from "./abis";

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

describe("drift against shared/abis", () => {
  const desk = sharedAbi("RiskDesk");
  const hook = sharedAbi("ClimHook");
  it.skipIf(!desk)("RiskDesk.json contains RiskReported and state()", () => {
    const s = selectors(desk!);
    for (const want of selectors(riskDeskAbi)) expect(s).toContain(want);
  });
  it.skipIf(!hook)("ClimHook.json contains quoteFee()", () => {
    const s = selectors(hook!);
    for (const want of selectors(climHookAbi)) expect(s).toContain(want);
  });
});
