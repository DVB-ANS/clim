"use client";

import { useEffect } from "react";

/**
 * Opens the FAQ row a URL fragment names (/how#can-the-owner-change-the-fee), on load and on every hash
 * change. Browsers reveal a closed <details> for find-in-page, but not when the fragment is the row itself.
 */
export function FaqHashOpener() {
  useEffect(() => {
    const open = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // a malformed fragment names no row
      }
      const row = id ? document.getElementById(id)?.closest("details") : null;
      if (!row || row.open) return;
      row.setAttribute("open", "");
      // a row near the end of the page could not be scrolled to the top while closed: once it has
      // opened (320 ms, how.css), bring it up under the header
      window.setTimeout(() => {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        if (row.getBoundingClientRect().top > pad + 8) row.scrollIntoView({ block: "start" });
      }, 340);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
