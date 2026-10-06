import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs vitest with bigint support", () => {
    expect(2n ** 64n).toBe(18446744073709551616n);
  });
});
