"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

/**
 * Confirm-and-POST for the reference self-removal link, mirroring
 * ReferenceApprovalActions. Deliberately a click, not a bare page load with a side effect
 * -- an email client's link-prefetch scanner could otherwise remove someone who never
 * opened the message.
 *
 * `submitting` is set before the request so a tap is always visibly registered, and a
 * failure says so rather than leaving the page looking like nothing happened: someone
 * trying to take their contact details off a public page must never be left guessing
 * whether it worked.
 */
export default function ReferenceRemovalActions({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleClick() {
    setState("submitting");
    try {
      const res = await fetch(`/api/references/remove/${token}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="rounded border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
        Done — you’ve been removed. You won’t appear as a reference and no new requests can
        reach you.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {state === "error" && (
        <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          That didn’t go through — check your connection and try again. You have not been
          removed yet.
        </p>
      )}
      <Button
        type="button"
        variant="destructive"
        className="min-h-11 w-fit"
        disabled={state === "submitting"}
        aria-busy={state === "submitting"}
        onClick={handleClick}
      >
        {state === "submitting" ? "Removing…" : "Remove me as a reference"}
      </Button>
    </div>
  );
}
