"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// Split into fragments so the full address never exists as one literal in
// the HTML, the RSC payload, or a single greppable string in the JS bundle.
// Keep in sync with the CONTACT_EMAIL env var.
const USER_PARTS = ["jack", "hres", "nick"];
const HOST_PARTS = ["gmail", "com"];

export default function ObfuscatedEmail({ prominent = false }: { prominent?: boolean }) {
  const [addr, setAddr] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately client-only: the address must not exist in the SSR'd
    // HTML or RSC payload, so this intentionally diverges from the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddr(`${USER_PARTS.join("")}@${HOST_PARTS.join(".")}`);
  }, []);

  if (prominent) {
    return (
      <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
        Or skip the form and email us directly at{" "}
        {addr ? (
          <a href={`mailto:${addr}`} className="font-medium text-accent hover:underline">
            {addr}
          </a>
        ) : (
          <span className="font-medium">our contact address</span>
        )}
        .
      </p>
    );
  }

  return (
    <p className={cn("text-xs text-muted")}>
      {addr ? (
        <>
          or email us directly at{" "}
          <a href={`mailto:${addr}`} className="text-accent hover:underline">
            {addr}
          </a>
        </>
      ) : (
        "or email us directly"
      )}
    </p>
  );
}
