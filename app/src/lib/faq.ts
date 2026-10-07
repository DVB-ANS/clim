// docs/faq.md (synced to src/generated/faq.ts) split into accordion rows for /how: the "# clim FAQ" title
// is dropped (the page has its own heading), the text before the first "## " is the intro, and each
// "## " question becomes one row whose id is the question's slug, so /how#<slug> links to it.

export type FaqItem = { id: string; question: string; answer: string };

/** "Can the owner change the fee?" -> "can-the-owner-change-the-fee" */
export function faqSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

export function splitFaq(md: string): { intro: string; items: FaqItem[] } {
  const [head, ...sections] = md.replace(/\r\n/g, "\n").split(/^## /m);
  const intro = head.replace(/^# .*$/m, "").trim();
  const items = sections.map((s) => {
    const nl = s.indexOf("\n");
    const question = (nl < 0 ? s : s.slice(0, nl)).trim();
    const answer = nl < 0 ? "" : s.slice(nl + 1).trim();
    return { id: faqSlug(question), question, answer };
  });
  return { intro, items };
}
