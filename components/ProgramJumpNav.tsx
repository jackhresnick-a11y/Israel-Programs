"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type JumpNavItem = {
  id: string;
  label: string;
};

// This bar's own rendered height cap (rule 5) -- used to compute the
// scrollspy detection band below, kept as a constant rather than measured so
// the band doesn't need its own ResizeObserver on top of HeaderHeightVar's.
const BAR_HEIGHT_PX = 48;

// Hysteresis settle delay -- matches the site's one motion constant (120ms,
// style guide §6) rather than inventing a new timing value.
const HYSTERESIS_MS = 120;

/**
 * Scrollspy with hysteresis: a candidate section must hold steady for
 * HYSTERESIS_MS with no further intersection change before it becomes
 * "active" (rule 8). A settle-timer, not a "wait for a second callback,"
 * because a click-triggered instant jump (rule 9 -- no smooth scroll)
 * produces exactly one intersection-change event and then goes quiet; a
 * scheme that required a second confirming callback would never confirm
 * anything after a jump. The same timer also debounces continuous scroll:
 * rapid candidate changes keep resetting it, so two short adjacent sections
 * can't flicker the highlight back and forth while scrolling past their
 * shared boundary.
 *
 * The detection band starts just below the sticky header + this bar (read
 * from --header-h, kept live by HeaderHeightVar) and covers the top 40% of
 * the remaining viewport -- a heading only counts as "current" once it's
 * crossed into that band, not merely once any part of it is on screen.
 */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const intersectingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ids is derived fresh from `items` on every render; the dependency below
  // compares by content (join) so this doesn't tear down and rebuild the
  // observer on every render when the array reference changes but its
  // contents don't.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || ids.length === 0) return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const headerH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 60;
    const topOffset = headerH + BAR_HEIGHT_PX;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersectingRef.current.add(entry.target.id);
          else intersectingRef.current.delete(entry.target.id);
        });
        // Furthest-scrolled-to id currently inside the band, in document order.
        const candidate = ids.filter((id) => intersectingRef.current.has(id)).pop() ?? null;

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setActive(candidate), HYSTERESIS_MS);
      },
      { rootMargin: `-${topOffset}px 0px -60% 0px`, threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return active;
}

/**
 * Real anchor navigation (rule 10) -- href alone is enough to work with no
 * JS at all. This only intercepts a plain click to (a) replaceState instead
 * of the browser's default hash pushState, so the back button can't walk
 * backwards through sections (rule 11), and (b) move focus to the target
 * (every target carries tabIndex={-1}) so screen readers follow the jump.
 * Skips modified clicks (cmd/ctrl/shift/middle) so new-tab/new-window
 * gestures still work natively.
 */
function handleJumpClick(id: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView();
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  };
}

/**
 * Single-row sticky jump bar for public program pages -- Ratings/Reviews/
 * Alumni anchors plus the persistent "Rate this program" CTA and, at `sm`
 * (640px) and up, a truncated program name that returns to top. The name is
 * dropped below `sm`: it's the row's least useful element on a phone (a
 * `BackButton` already sits above the fold, and the phone's own scroll-to-top
 * gesture covers the intent), and the row has less width to share with the
 * jump anchors and CTA at those widths. Purely additive otherwise: it doesn't
 * restructure the page, and every target it points at is a normal
 * server-rendered heading already in the DOM (rule 13). The caller
 * (app/programs/[slug]/page.tsx) only renders this when at least 2 items
 * qualify (rule 1).
 *
 * Appearance is pure CSS sticky, not a scroll-triggered reveal -- style guide
 * §6 forbids fade-ins/scroll reveals outright, so this renders in normal
 * flow at its call site (after the "Who it's for" block) and simply pins
 * once scrolled to, rather than animating in (rules 3/4).
 */
export default function ProgramJumpNav({
  programName,
  items,
  rateHref,
}: {
  programName: string;
  items: JumpNavItem[];
  rateHref: string;
}) {
  const ids = items.map((item) => item.id);
  const active = useActiveSection(ids);

  return (
    <nav
      aria-label="On this page"
      // overflow-y-hidden is required, not decorative: per the CSS overflow
      // spec, setting only overflow-x leaves overflow-y computed as `auto`
      // (not `visible`), and a stray sub-pixel height mismatch was enough to
      // trigger a real vertical scrollbar next to the CTA. This row is
      // single-line and height-capped (rule 5) -- it should never scroll
      // vertically, so this is pinned explicitly rather than left implicit.
      className="sticky top-[var(--header-h)] z-30 flex max-h-12 items-center gap-4 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-border bg-background px-4 py-2"
    >
      <a
        href="#top"
        onClick={handleJumpClick("top")}
        className="hidden max-w-[12rem] shrink-0 truncate font-serif text-sm font-medium text-foreground sm:block"
      >
        {programName}
      </a>

      <div className="flex shrink-0 items-center gap-4">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={handleJumpClick(item.id)}
            aria-current={active === item.id ? "location" : undefined}
            className={cn(
              "border-b-2 pb-0.5 text-sm text-muted transition-colors duration-[120ms] ease-out hover:text-foreground",
              active === item.id ? "border-accent font-medium text-foreground" : "border-transparent"
            )}
          >
            {item.label}
          </a>
        ))}
      </div>

      <Link href={rateHref} className={cn(buttonVariants({ variant: "primary", size: "sm" }), "ml-auto shrink-0")}>
        Rate this program
      </Link>
    </nav>
  );
}
