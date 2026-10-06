import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Ventriloc's stacked service panel: an Ash card with the signature asymmetric corner, the title
 * behind a blue square, a navy subtitle, the text and a link; the live mock on the right.
 * Each panel sticks a little lower than the previous one, so they pile up as the page scrolls.
 */
export function ServiceSection({ id, index, title, subtitle, link, children, mock }: {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  link: { href: string; label: string };
  children: ReactNode;
  mock: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-stack={index}
      className="stack-panel grid gap-10 rounded-[6px_0_0_0] bg-surface-2 p-6 md:p-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] lg:p-[56px]"
      style={{ "--stack-top": `${84 + index * 14}px` } as CSSProperties}
    >
      <div>
        <h2 id={`${id}-title`} className="flex items-center gap-3 font-display text-[28px] font-normal leading-tight tracking-[-0.02em]">
          <span aria-hidden className="size-2 shrink-0 bg-signal" />
          {title}
        </h2>
        <p className="mt-2 pl-5 text-[13px] text-deep">{subtitle}</p>
        <div className="mt-5 space-y-3 pl-5 text-[16px] leading-relaxed text-fg-muted">{children}</div>
        <Link href={link.href} className="mt-6 ml-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-fg hover:text-signal">
          {link.label}
          <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
            <path d="M3 1.5L6.5 5 3 8.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
      <div className="min-w-0 rounded-md bg-wash p-4 md:p-8">{mock}</div>
    </section>
  );
}
