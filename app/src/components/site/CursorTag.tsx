import { cn } from "@/lib/cn";

/**
 * The name tag of the landing's pointer highlight: a pink dot and a label in a white pill, after
 * Ventriloc's multiplayer cursors (the drifting cursors and their arrow were removed on 2026-10-07).
 * From sm it is centred on its anchor's line; on phones it hangs just under it, so on the hero it clears
 * the glyphs of "Storm" and the box's bottom edge instead of covering them.
 */
export function CursorTag({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute z-10 flex items-start", className)}>
      <span className="flex translate-y-1 items-center sm:-translate-y-1/2 gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-fg shadow-[0_2px_8px_rgba(32,32,32,0.08)]">
        <span className="size-2 rounded-full bg-pink" />
        {label}
      </span>
    </span>
  );
}
