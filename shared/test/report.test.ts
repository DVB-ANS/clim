import { describe, expect, test } from "bun:test";
import type { Hex } from "viem";
import { buildMockRawReport, decodeRiskReport, encodeRiskReport, MOCK_FORWARDER_METADATA_LENGTH, type RiskReport } from "../src/report";

const SAMPLE: RiskReport = {
  tObs: 1_791_280_000,
  sigmaE9: 85_475,
  rv15E9: 85_000,
  dvolE2: 4_800,
  refTick: -79_072,
  dispBp: 3,
  nSources: 4,
  kE4: 10_000,
  zone: 0,
};

// cast abi-encode "f(uint40,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8)" -- 1791280000 85475 85000 4800 -79072 3 4 10000 0
const SAMPLE_HEX = (
  "0x000000000000000000000000000000000000000000000000000000006ac4c380" +
  "0000000000000000000000000000000000000000000000000000000000014de3" +
  "0000000000000000000000000000000000000000000000000000000000014c08" +
  "00000000000000000000000000000000000000000000000000000000000012c0" +
  "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffecb20" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "0000000000000000000000000000000000000000000000000000000000000004" +
  "0000000000000000000000000000000000000000000000000000000000002710" +
  "0000000000000000000000000000000000000000000000000000000000000000"
) as Hex;

describe("CRE report ABI (abi.encode of 9 static fields)", () => {
  test("encodes exactly like Solidity abi.encode / cast abi-encode", () => {
    expect(encodeRiskReport(SAMPLE)).toBe(SAMPLE_HEX);
  });
  test("decodes back to the same fields (negative refTick included)", () => {
    expect(decodeRiskReport(SAMPLE_HEX)).toEqual(SAMPLE);
  });
});

describe("MockKeystoneForwarder raw report", () => {
  test("is 109 bytes of metadata followed by the abi-encoded report", () => {
    const raw = buildMockRawReport(SAMPLE, { executionId: `0x${"ab".repeat(32)}`, timestamp: 1_791_280_000 });
    const bytes = (raw.length - 2) / 2;
    expect(MOCK_FORWARDER_METADATA_LENGTH).toBe(109);
    expect(bytes).toBe(109 + 9 * 32);
    expect(raw.slice(0, 4)).toBe("0x01"); // version byte
    expect(raw.slice(4, 4 + 64)).toBe("ab".repeat(32)); // workflow_execution_id
    expect(`0x${raw.slice(2 + 109 * 2)}`).toBe(SAMPLE_HEX); // payload after metadata
  });
});
