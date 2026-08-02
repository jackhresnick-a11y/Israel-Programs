"use client";

import type { PollShareEventType } from "@/lib/pollShared";

/**
 * Fire-and-forget beacon to POST /api/polls/events. `keepalive: true` is what lets it
 * survive the `wa.me` navigation the WhatsApp share link triggers immediately after the
 * click handler runs -- without it, the browser can cancel the in-flight request as soon
 * as the page starts navigating away. Errors are swallowed: this must never surface a UI
 * error or block the action it's measuring.
 */
export function emitPollShareEvent(type: PollShareEventType, responseId: string | null): void {
  if (!responseId) return;
  void fetch("/api/polls/events", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, responseId }),
  }).catch(() => {});
}
