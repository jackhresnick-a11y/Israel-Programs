"use client";

import type { PollClientEventType } from "@/lib/pollShared";

/**
 * Fire-and-forget beacon to POST /api/polls/events. `keepalive: true` is what lets it
 * survive the `wa.me` navigation the WhatsApp share link triggers immediately after the
 * click handler runs -- without it, the browser can cancel the in-flight request as soon
 * as the page starts navigating away. Errors are swallowed: this must never surface a UI
 * error or block the action it's measuring.
 *
 * Carries the share events and the reference opt-in's view/focus events. Only types in
 * POLL_CLIENT_EVENTS are accepted here and by the route -- reference_optin_submitted is
 * server-emitted on purpose (see lib/pollShared.ts's POLL_REFERENCE_OPTIN_EVENTS).
 */
export function emitPollEvent(type: PollClientEventType, responseId: string | null): void {
  if (!responseId) return;
  void fetch("/api/polls/events", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, responseId }),
  }).catch(() => {});
}
