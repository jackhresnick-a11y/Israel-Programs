"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

type Action = "approve" | "decline";

const ACTION_COPY: Record<Action, { confirm: string; pending: string; success: string; variant: "primary" | "secondary" }> = {
  approve: {
    confirm: "Approve & share contacts",
    pending: "Approving...",
    success: "Done — you and the requester will each receive an email with the other's contact info.",
    variant: "primary",
  },
  decline: {
    confirm: "Decline",
    pending: "Declining...",
    success: "Done — we've let the requester know, gently. No contact info was shared.",
    variant: "secondary",
  },
};

/**
 * Confirm-and-POST for the alumnus approve/decline links. Deliberately a click, not a
 * bare page load with a side effect -- an email client's link-prefetch scanner could
 * otherwise auto-trigger the action and leak (approve) or silently burn (decline) the
 * request before the alumnus ever saw the page.
 */
export default function ReferenceApprovalActions({ token, action }: { token: string; action: Action }) {
  const [state, setState] = useState<"idle" | "submitting" | "done" | "already_resolved" | "error">("idle");
  const copy = ACTION_COPY[action];

  async function handleClick() {
    setState("submitting");
    try {
      const res = await fetch(`/api/references/contact-requests/${token}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        return;
      }
      setState(body.ok ? "done" : "already_resolved");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-sm text-success">{copy.success}</p>;
  }
  if (state === "already_resolved") {
    return <p className="text-sm text-muted">This request has already been handled — there&apos;s nothing more to do here.</p>;
  }
  if (state === "error") {
    return <p className="text-sm text-danger">Something went wrong. Please try again in a moment.</p>;
  }

  return (
    <Button variant={copy.variant} disabled={state === "submitting"} onClick={handleClick} className="w-fit">
      {state === "submitting" ? copy.pending : copy.confirm}
    </Button>
  );
}
