import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Credits and licences" };

// THIRD_PARTY_NOTICES.md at the repo root, read at build time: one source for the repo and the site.
const NOTICES = readFileSync(join(process.cwd(), "THIRD_PARTY_NOTICES.md"), "utf8");

export default function CreditsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">Credits and licences</h1>
      <Panel title="Third-party notices" subtitle="The components and data clim's front adapts, with their sources and licences.">
        <div className="text-sm wrap-anywhere [&_a]:underline [&_code]:text-xs [&_code]:wrap-anywhere [&_h1]:hidden [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h3]:mt-5 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-2 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:whitespace-pre-wrap">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{NOTICES}</ReactMarkdown>
        </div>
      </Panel>
    </div>
  );
}
