import { describe, expect, it } from "vitest";
import { LOGOS } from "./logos";

// LogoStrip and TokenIcon inject each body into their own <svg>: a body must hold the marks only
describe("LOGOS", () => {
  it("has no <svg> tags of its own in any body", () => {
    for (const [name, { body }] of Object.entries(LOGOS)) {
      expect(body, name).not.toMatch(/<\/?svg/);
      expect(body.length, name).toBeGreaterThan(0);
    }
  });
});
