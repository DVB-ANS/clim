import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toFunctionSelector, type AbiParameter } from "viem";
import { climHookAbi, mockForwarderAbi, poolSwapTestAbi, riskDeskAbi, stateViewAbi, testTokenMintAbi } from "../src/abis";

describe("external ABI fragments match the selectors deployed on Sepolia", () => {
  test("PoolSwapTest.swap = 0x2229d0b4 (present in 0x9B6b...6eEe bytecode)", () => {
    const swap = poolSwapTestAbi.find((x) => x.type === "function" && x.name === "swap");
    expect(swap && toFunctionSelector(swap)).toBe("0x2229d0b4");
  });
  test("StateView.getSlot0 = 0xc815641c (present in 0xE1Dd...7E4C bytecode)", () => {
    expect(toFunctionSelector(stateViewAbi[0])).toBe("0xc815641c");
  });
  test("MockKeystoneForwarder.report(address,bytes,bytes,bytes[])", () => {
    expect(toFunctionSelector(mockForwarderAbi[0])).toBe(toFunctionSelector("function report(address,bytes,bytes,bytes[])"));
  });
});

// Canonical signature of an ABI item, including outputs and indexed flags.
type Item = { type: string; name?: string; inputs?: readonly AbiParameter[]; outputs?: readonly AbiParameter[] };
function typeOf(p: AbiParameter): string {
  if (p.type.startsWith("tuple") && "components" in p && p.components) {
    return `(${p.components.map(typeOf).join(",")})${p.type.slice(5)}`;
  }
  return p.type;
}
function canonical(item: Item): string {
  const ins = (item.inputs ?? []).map((p) => `${typeOf(p)}${"indexed" in p && p.indexed ? " indexed" : ""}`);
  const outs = (item.outputs ?? []).map(typeOf);
  return `${item.type} ${item.name}(${ins.join(",")}) -> (${outs.join(",")})`;
}

const ABI_DIR = join(import.meta.dir, "..", "abis");
const OURS: Array<[string, readonly Item[]]> = [
  ["RiskDesk", riskDeskAbi],
  ["ClimHook", climHookAbi],
  ["TestToken", testTokenMintAbi],
];

describe("hand-written clim fragments match the compiled contracts (shared/abis/*.json)", () => {
  for (const [name, fragments] of OURS) {
    const file = join(ABI_DIR, `${name}.json`);
    test.skipIf(!existsSync(file))(`${name}: every fragment exists with the same signature`, () => {
      const compiled = JSON.parse(readFileSync(file, "utf8")) as Item[];
      const compiledSigs = new Set(compiled.map(canonical));
      for (const f of fragments) {
        expect(compiledSigs.has(canonical(f))).toBe(true);
      }
    });
  }
});
