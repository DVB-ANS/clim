/** Ventriloc's multiplayer cursor: a Brass pointer and a name tag, drifting slowly over a card. */
export function Cursor({ label, className = "", delay = "0s" }: { label: string; className?: string; delay?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-10 flex items-start gap-1 animate-[clim-float_7s_ease-in-out_infinite] ${className}`}
      style={{ animationDelay: delay }}
    >
      <svg width="14" height="16" viewBox="0 0 14 16" className="fill-brass">
        <path d="M1 1l11 6.2-4.6 1.3-2.2 4.6z" />
      </svg>
      <span className="mt-3 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg shadow-[0_2px_8px_rgba(32,32,32,0.08)]">
        <span className="size-2 rounded-full bg-ember" />
        {label}
      </span>
    </span>
  );
}
