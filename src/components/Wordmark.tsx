/** clim° — the degree sign in Ember is the brand mark (Ventriloc's orange glyph, as a weather unit). */
export function Wordmark({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={`font-display font-normal leading-none tracking-[-0.03em] ${tone === "light" ? "text-surface" : "text-fg"} ${className}`}>
      clim<span className="text-ember">°</span>
    </span>
  );
}
