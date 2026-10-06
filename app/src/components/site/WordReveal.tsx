import type { CSSProperties } from "react";

/**
 * A sentence that lights up word by word as it scrolls through, after Ventriloc's word spans. Each
 * word carries its place in the sentence (--p) and the CSS view timeline (.word-reveal, globals.css)
 * brings it from fg-subtle to its own colour; `tone` colours whole words by their text, e.g.
 * { storm: "text-sigma" }. No JavaScript: static and full colour where scroll timelines are missing.
 */
export function WordReveal({ text, tone = {}, className = "" }: { text: string; tone?: Record<string, string>; className?: string }) {
  const words = text.split(/\s+/);
  const last = Math.max(1, words.length - 1);
  return (
    <p className={`word-reveal ${className}`}>
      {words.map((word, i) => (
        <span key={i} className={tone[word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()]} style={{ "--p": i / last } as CSSProperties}>
          {i ? " " : ""}
          {word}
        </span>
      ))}
    </p>
  );
}
