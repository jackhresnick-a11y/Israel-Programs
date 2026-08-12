import Link from "next/link";
import { buildMatchHref, type FlowAnswerState, type FlowQuestionDTO } from "@/lib/flowShared";

/**
 * Every visible, answerable question with what was said about it -- the review
 * screen's checklist before the explicit Submit, and the results page's "here's
 * what you told us" strip with Edit links back into the flow. Interstitials (zero
 * options -- the Q2 opener) are skipped entirely; there's nothing to "answer."
 */
export default function FlowAnswerSummary({
  visible,
  state,
  sessionId,
}: {
  visible: FlowQuestionDTO[];
  state: FlowAnswerState;
  sessionId: string;
}) {
  const rows = visible.filter((q) => q.options.length > 0);
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border rounded border border-border">
      {rows.map((q) => {
        const value = state.get(q.key);
        const label =
          value === undefined
            ? "Not answered yet"
            : value === null
              ? "Skipped"
              : (q.options.find((o) => o.key === value[0])?.label ?? "Skipped");
        return (
          <li key={q.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div>
              <p className="text-muted">{q.prompt}</p>
              <p className="font-medium text-foreground">{label}</p>
            </div>
            <Link
              href={buildMatchHref("/match", q.key, state, sessionId)}
              prefetch={false}
              className="shrink-0 text-xs text-accent-hover hover:underline"
            >
              Edit
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
