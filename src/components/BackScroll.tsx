"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Browser Back to another page restores its scroll position at once: the page's smooth scrolling
 * (globals.css, for in-page anchors) would otherwise glide from the top through the whole page.
 * Hash-only history moves keep their glide.
 */
export function BackScroll() {
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const html = document.documentElement;
    const onPop = () => {
      if (location.pathname === path.current) return;
      html.style.scrollBehavior = "auto";
      const restore = () => {
        html.style.scrollBehavior = "";
      };
      addEventListener("scrollend", restore, { once: true });
      setTimeout(restore, 600);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return null;
}
