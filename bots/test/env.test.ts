import { describe, expect, test } from "bun:test";
import { argValue, botKey, envNum, pairArg } from "../src/lib/env";
import { toJsonLine } from "../src/lib/jsonl";

const KEY = `0x${"1".repeat(64)}` as const;

describe("env and CLI helpers", () => {
  test("argValue reads --flag value pairs", () => {
    expect(argValue("--pair", ["bun", "arb.ts", "--pair", "replay"])).toBe("replay");
    expect(argValue("--pair", ["bun", "arb.ts"])).toBeUndefined();
  });
  test("pairArg defaults to live and rejects unknown pairs", () => {
    expect(pairArg(["bun", "arb.ts"])).toBe("live");
    expect(pairArg(["bun", "arb.ts", "--pair", "replay"])).toBe("replay");
    expect(() => pairArg(["bun", "arb.ts", "--pair", "mainnet"])).toThrow(/--pair/);
  });
  test("botKey reads <ROLE>_<PAIR>_PRIVATE_KEY and checks the format", () => {
    expect(botKey("ARB", "live", { ARB_LIVE_PRIVATE_KEY: KEY })).toBe(KEY);
    expect(() => botKey("NOISE", "replay", {})).toThrow(/NOISE_REPLAY_PRIVATE_KEY/);
    expect(() => botKey("ARB", "live", { ARB_LIVE_PRIVATE_KEY: "1234" })).toThrow(/0x/);
  });
  test("envNum parses numbers with a fallback", () => {
    expect(envNum("X", 0.5, {})).toBe(0.5);
    expect(envNum("X", 0.5, { X: "2" })).toBe(2);
    expect(() => envNum("X", 0.5, { X: "abc" })).toThrow(/X/);
  });
});

describe("jsonl", () => {
  test("serialises bigints as strings, one line per record", () => {
    expect(toJsonLine({ block: 123n, ok: true })).toBe('{"block":"123","ok":true}\n');
  });
});
