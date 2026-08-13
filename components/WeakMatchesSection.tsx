"use client";

import { useState, type ReactNode } from "react";

/**
 * Partial-token search matches (see lib/programSearch.ts's "no hard cut" fix) --
 * never dropped, but collapsed behind a button and closed by default so a broad
 * query's long weak-match tail doesn't visually dominate the page under the
 * genuinely-matching results.
 *
 * Takes the already-rendered program grid as `children` rather than a `programs`
 * array + rendering ProgramCard itself -- ProgramCard (transitively, via
 * lib/programs.ts) imports lib/prisma.ts, which pulls in the `pg` driver and Node
 * built-ins (`tls`, etc.) that don't exist in a browser bundle. A Server Component
 * child passed as `children` into a Client Component renders on the server as
 * usual; only the show/hide toggle itself needs to run in the browser. Same
 * "recurring pattern" CLAUDE.md documents for lib/tagTints.ts and friends, applied
 * to a component boundary instead of a lib module.
 */
export default function WeakMatchesSection({
  count,
  heading,
  children,
}: {
  count: number;
  heading: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-4 pb-16">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start rounded border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors duration-[120ms] ease-out hover:border-accent-hover hover:bg-accent/10"
      >
        {open ? "Hide" : "Show"} {count} weaker match{count === 1 ? "" : "es"}
      </button>

      {open && (
        <>
          <p className="text-sm font-medium text-muted">{heading}</p>
          {children}
        </>
      )}
    </div>
  );
}
