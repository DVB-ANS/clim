import { describe, expect, it } from "vitest";
import { FAQ_MD } from "@/generated/faq";
import { faqSlug, splitFaq } from "./faq";

describe("splitFaq", () => {
  const faq = splitFaq(FAQ_MD);

  it("splits docs/faq.md into its 10 questions, in order", () => {
    expect(faq.items).toHaveLength(10);
    expect(faq.items[0].question).toBe("How is the fee computed?");
    expect(faq.items[9].question).toBe("Can the owner change the fee?");
  });

  it("gives every question a unique id, its slug", () => {
    const ids = faq.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("can-the-owner-change-the-fee");
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("keeps the intro, drops the page title, and leaves no heading in the answers", () => {
    expect(faq.intro).toMatch(/^Questions we were asked during TOKEN2049 Origins/);
    expect(faq.intro).not.toContain("# clim FAQ");
    for (const item of faq.items) {
      expect(item.answer.length).toBeGreaterThan(0);
      expect(item.answer).not.toMatch(/^#{1,2} /m);
      expect(item.question).not.toContain("\n");
    }
  });

  it("keeps the code block and the table inside their answers", () => {
    expect(faq.items[0].answer).toContain("```");
    expect(faq.items.find((i) => i.id === "can-a-pool-that-is-already-live-switch-to-clim")?.answer).toContain("| Who |");
  });

  it("works on a minimal document", () => {
    expect(splitFaq("# T\n\nHello.\n\n## A b?\n\nOne.\n\n## C, d!\n\nTwo.\n")).toEqual({
      intro: "Hello.",
      items: [
        { id: "a-b", question: "A b?", answer: "One." },
        { id: "c-d", question: "C, d!", answer: "Two." },
      ],
    });
  });
});

describe("faqSlug", () => {
  it("lowercases, drops punctuation and joins words with hyphens", () => {
    expect(faqSlug("Why Ethereum Sepolia? Why not Solana?")).toBe("why-ethereum-sepolia-why-not-solana");
    expect(faqSlug("Why not measure volatility inside the pool, on-chain?")).toBe("why-not-measure-volatility-inside-the-pool-on-chain");
    expect(faqSlug("  Is it profitable?  ")).toBe("is-it-profitable");
  });
});
