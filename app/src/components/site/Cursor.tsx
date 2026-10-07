import { cn } from "@/lib/cn";

/**
 * Ventriloc's multiplayer cursor: a navy pointer and a name tag, drifting slowly over a card.
 * `still` drops the drift (for a cursor something else moves); `dot` turns the tag's blue dot pink;
 * `flip` hangs the tag to the left of the pointer, which then points up-left. `arrow={false}` keeps only the
 * tag (the maintainer found the pointer itself distracting, 2026-10-07).
 */
export function Cursor({
  label,
  className = "",
  delay = "0s",
  still = false,
  dot = false,
  flip = false,
  arrow = true,
}: {
  label: string;
  className?: string;
  delay?: string;
  still?: boolean;
  dot?: boolean;
  flip?: boolean;
  arrow?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute z-10 flex items-start gap-1", flip && "flex-row-reverse", !still && "animate-[clim-float_7s_ease-in-out_infinite]", className)}
      style={still ? undefined : { animationDelay: delay }}
    >
      {arrow && (
        <svg width="14" height="16" viewBox="0 0 14 16" className={cn("fill-deep", flip && "-scale-x-100")}>
          <path d="M1 1l11 6.2-4.6 1.3-2.2 4.6z" />
        </svg>
      )}
      <span className={cn(arrow ? "mt-3" : "-translate-y-1/2", "flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg shadow-[0_2px_8px_rgba(32,32,32,0.08)]")}>
        <span className={cn("size-2 rounded-full", dot ? "bg-pink" : "bg-signal")} />
        {label}
      </span>
    </span>
  );
}
