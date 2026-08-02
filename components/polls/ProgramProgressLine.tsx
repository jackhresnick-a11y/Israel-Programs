"use client";

import { useEffect, useState } from "react";

/**
 * Collective-progress line on the post-poll thank-you screen: "N responses so far" for
 * this program, sourced from GET /api/polls/programs/[programId]/response-count -- the
 * same flat COUNTED count already shown publicly on the program page
 * (components/PollSummaryStrip.tsx's "N people have rated this program"), so this and
 * that surface never disagree.
 *
 * Renders nothing below 1: the thank-you screen also appears for a FLAGGED respondent
 * (RateForm.tsx's justCompleted fires on any status leaving INCOMPLETE, not just COUNTED),
 * and a program's very first flagged respondent would otherwise see "0 responses so far"
 * for a rating that will never itself be counted. Renders nothing on a fetch failure too --
 * this is a nice-to-have, never worth an error state on a confirmation screen.
 *
 * Never renders the unlock threshold, a "needed"/"remaining" figure, or a percentage --
 * see the response-count route's own doc comment for why that's a hard contract, not an
 * oversight.
 */
export default function ProgramProgressLine({ programId }: { programId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/polls/programs/${programId}/response-count`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { ok: boolean; count: number } | null) => {
        if (body?.ok) setCount(body.count);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [programId]);

  if (count === null || count < 1) return null;

  return (
    <p data-poll-progress role="status" aria-live="polite" className="text-center text-sm text-muted">
      <span className="font-mono tabular-nums text-foreground">{count}</span>{" "}
      {count === 1 ? "response so far" : "responses so far"}
      {" — help this program’s page go live."}
    </p>
  );
}
