"use client";

import { useState } from "react";

export default function Disclaimer() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="note"
      className="fixed bottom-4 left-4 z-40 max-w-xs rounded-lg border border-border bg-surface/95 p-3 pr-8 shadow-lg backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss disclaimer"
        className="absolute right-1.5 top-1.5 rounded p-1 text-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        &#10005;
      </button>
      <p className="text-xs leading-relaxed text-foreground/70">
        <span className="text-accent" aria-hidden="true">
          &#9432;{" "}
        </span>
        Information may not be 100% accurate. If you&apos;re interested in a program, we
        recommend contacting them directly to confirm details.
      </p>
    </div>
  );
}
