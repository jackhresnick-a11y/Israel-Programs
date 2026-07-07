"use client";

import { useState } from "react";

export default function Disclaimer() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="note"
      className="fixed bottom-4 left-4 z-40 max-w-xs rounded-lg border border-black/10 bg-white/95 p-3 pr-8 shadow-lg backdrop-blur-sm dark:border-white/15 dark:bg-neutral-900/95"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss disclaimer"
        className="absolute right-1.5 top-1.5 rounded p-1 text-black/40 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-white/40 dark:hover:text-white/70"
      >
        &#10005;
      </button>
      <p className="text-xs leading-relaxed text-black/70 dark:text-white/70">
        <span className="text-primary dark:text-amber-400" aria-hidden="true">
          &#9432;{" "}
        </span>
        Information may not be 100% accurate. If you&apos;re interested in a program, we
        recommend contacting them directly to confirm details.
      </p>
    </div>
  );
}
