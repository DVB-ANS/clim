import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StepState } from "@/lib/tx";
import { TxSteps } from "./TxSteps";

const status = (steps: StepState[], live = true) =>
  renderToStaticMarkup(createElement(TxSteps, { steps, live })).match(/<p role="status" class="sr-only">(.*?)<\/p>/)?.[1];

describe("TxSteps", () => {
  it("keeps an empty status line mounted before the first step, and no list", () => {
    const html = renderToStaticMarkup(createElement(TxSteps, { steps: [], live: true }));
    expect(html).toBe('<p role="status" class="sr-only"></p>');
  });

  it("says the latest step that has started", () => {
    expect(status([{ label: "Approve tETH", status: "done" }, { label: "Swap", status: "signing" }, { label: "Read fee", status: "waiting" }])).toBe(
      "Swap: confirm in your wallet",
    );
    expect(status([{ label: "Swap", status: "pending" }], false)).toBe("Swap: simulated block");
    expect(status([{ label: "Swap", status: "failed", error: "user rejected" }])).toBe("Swap: failed. user rejected");
    expect(status([{ label: "Swap", status: "waiting" }])).toBe("");
  });
});
