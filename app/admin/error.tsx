"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

/**
 * The /admin subtree had no error boundary at all before this, so any thrown
 * error (e.g. a query against a not-yet-migrated table) fell through to
 * Next's generic "This page could not load" -- the real message/stack only
 * ever reached the server log, never the admin looking at the broken page.
 * Logging here is client-side (Next renders this boundary in the browser),
 * so the real fix for any given failure is still in the server logs -- this
 * just stops the failure from being silent to the person hitting it.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong loading this page</h1>
      <p className="text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="text-xs text-muted">Error ID: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
