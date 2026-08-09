"use client";

import { useEffect } from "react";

/**
 * Keeps `--header-h` (globals.css) in sync with the real, variable-height
 * `<header>` (Nav.tsx) -- its height changes with the admin-configured logo
 * (headerLogoUrl/headerLogoMode) and the sm/md breakpoints, so a hardcoded
 * offset drifts. ProgramJumpNav's `top-[var(--header-h)]` and the
 * `.jump-target-offset` scroll-margin (globals.css) both read this var rather
 * than each guessing the header's height independently.
 *
 * Also re-applies the URL's hash scroll position once measurement lands --
 * the browser's own initial hash-scroll can race the ResizeObserver's first
 * callback and land using the 60px CSS fallback instead of the real height.
 * Renders nothing; mounted once in app/layout.tsx next to <Nav />.
 */
export default function HeaderHeightVar() {
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    const setVar = () => {
      document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    };
    setVar();

    // One-time correction for a hash already in the URL on landing: the browser's
    // native hash-scroll can fire before setVar() above, using the 60px CSS
    // fallback instead of the real measured height.
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView();
    }

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(setVar);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return null;
}
