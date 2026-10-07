import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmountBox } from "./dex";

describe("AmountBox", () => {
  it("marks an invalid amount for assistive tech: aria-invalid, the message as its description, an alert", () => {
    const html = renderToStaticMarkup(createElement(AmountBox, { id: "x", label: "You pay", value: "0", onChange: () => {}, symbol: "tETH", error: "must be greater than 0" }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="x-msg"');
    expect(html).toContain('id="x-msg"');
    expect(html).toContain('<span role="alert" class="text-danger">must be greater than 0</span>');
  });

  it("describes a valid field by its hint, with no alert", () => {
    const html = renderToStaticMarkup(createElement(AmountBox, { id: "x", label: "You pay", value: "0.5", onChange: () => {}, symbol: "tETH", hint: "Balance 2 tETH" }));
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('aria-describedby="x-msg"');
    expect(html).toContain("Balance 2 tETH");
  });
});
