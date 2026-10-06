/** clim° — the degree sign in Chainlink Blue is the brand mark (Ventriloc's glyph idea, as a weather unit). */
export function Wordmark({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={`font-display font-normal leading-none tracking-[-0.03em] ${tone === "light" ? "text-surface" : "text-fg"} ${className}`}>
      clim<span className="text-signal">°</span>
    </span>
  );
}
