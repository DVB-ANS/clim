// The FAQ on /how as hairline accordion rows (native <details>, after the maintainer's reference): the
// heading and intro on the left (sticky from lg), the questions on the right, every answer collapsed.
// The questions and answers come from docs/faq.md; the intro is the app's own, so it says which
// questions were really asked at the event (faq.test.ts keeps those rows first).
// Rows open independently (no `name`), so nothing above the visitor moves. Each row's id is its
// question's slug, so /how#can-the-owner-change-the-fee opens that row (FaqHashOpener); the browser's
// find-in-page opens a row by itself. The open and close motion is in how.css.
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FAQ_MD } from "@/generated/faq";
import { splitFaq } from "@/lib/faq";

const FAQ = splitFaq(FAQ_MD);

/** react-markdown hands each component its syntax-tree `node`, which must not reach the DOM. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

// The questions are the rows' h3, so a heading inside an answer drops a level; code blocks and tables,
// which scroll sideways on a phone, take keyboard focus.
const FAQ_COMPONENTS: Components = {
  h1: () => null,
  h2: (p) => <h3 {...dom(p)} />,
  h3: (p) => <h4 {...dom(p)} />,
  pre: (p) => <pre role="region" aria-label="FAQ code block" tabIndex={0} {...dom(p)} />,
  table: (p) => (
    <div className="faq-table" role="region" aria-label="FAQ table" tabIndex={0}>
      <table {...dom(p)} />
    </div>
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={FAQ_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export function FaqList() {
  const last = FAQ.items.length - 1;
  return (
    <div className="faq-list lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-16">
      <div className="lg:sticky lg:top-[calc(var(--clim-app-header)+24px)] lg:self-start">
        <h2 id="faq-title" className="font-display text-[28px] leading-[1.1] font-normal tracking-[-0.02em] text-fg sm:text-[32px]">
          Frequently asked questions
        </h2>
        <div className="faq-answer mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-fg-muted">
          <p>
            Questions about clim, with precise answers. At TOKEN2049 Origins on 6 October, a Chainlink mentor asked two of them: how the fee
            is changed and computed (the first two answers) and whether a pool that is already live can switch to clim (the third). The
            others are the questions we expect from judges.
          </p>
          <p>
            Code references point to <a href="https://github.com/DVB-ANS/clim">the clim repository</a> and to{" "}
            <a href="https://github.com/Uniswap/v4-core">Uniswap v4 core</a>.
          </p>
        </div>
      </div>
      <div className="mt-8 lg:mt-1">
        {FAQ.items.map((item, i) => (
          <details key={item.id} id={item.id} className={`border-t border-line${i === last ? " border-b" : ""}`}>
            <summary className="flex cursor-pointer items-start justify-between gap-6 py-5 sm:py-6">
              <h3 className="font-display text-[19px] leading-[25px] font-medium tracking-[-0.01em] text-fg sm:text-[22px] sm:leading-[29px]">{item.question}</h3>
              <span aria-hidden className="faq-plus mt-[3px] sm:mt-1" />
            </summary>
            <div className="faq-answer max-w-[68ch] pb-8 text-[15px] leading-[1.65] text-fg-muted sm:pr-11">
              <Markdown>{item.answer}</Markdown>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
