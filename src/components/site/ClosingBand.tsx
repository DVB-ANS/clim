import Link from "next/link";
import { params } from "@/lib/config";
import { DISP_MAX_BP } from "@/lib/series";
import { pipsToBp } from "@/lib/units";
import { LaunchButton } from "./LaunchButton";

const CHECKS = [
  `${pipsToBp(params.feeMinPips)} bp floor in calm markets`,
  `More as the storm builds, never above ${pipsToBp(params.feeMaxPips)} bp`,
  `${pipsToBp(params.feeSafePips)} bp or more if the venues disagree by over ${DISP_MAX_BP} bp or the desk goes quiet for ${params.tauKillSec} s`,
];

/**
 * The closing band, after chain.link's blue band and Ventriloc's checklist: the promise once more,
 * Launch app as a white pill, and a dithered storm front (blue, white, then pink dots; never mixed)
 * where the band dissolves. It grows to full width as it scrolls in.
 */
export function ClosingBand() {
  return (
    <section
      aria-labelledby="closing-title"
      className="grow-in relative mx-auto grid max-w-[1200px] overflow-hidden rounded-lg bg-accent text-accent-fg lg:grid-cols-[minmax(0,1fr)_45%]"
    >
      <div className="relative px-6 py-16 md:px-14 md:py-20">
        <h2 id="closing-title" className="font-display text-[44px] font-normal leading-[0.98] tracking-[-0.02em] md:text-[60px]">
          Every swap reads the weather.
        </h2>
        <ul className="mt-8 space-y-3 text-[17px]">
          {CHECKS.map((c) => (
            <li key={c} className="rise-in flex gap-3">
              <span aria-hidden className="mt-2 size-2 shrink-0 bg-accent-fg" />
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-center">
          <LaunchButton size="lg" tone="onBlue">
            Launch app
          </LaunchButton>
          <Link
            href="/how"
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-accent-fg/70 px-6 text-[16px] text-accent-fg hover:bg-accent-fg/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-fg"
          >
            How it works
          </Link>
        </div>
      </div>
      <div aria-hidden className="bg-storm-front h-40 lg:h-auto" />
    </section>
  );
}
