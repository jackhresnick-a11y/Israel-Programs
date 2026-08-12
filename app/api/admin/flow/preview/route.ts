import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { recordToAnswerState, applyOptionOverrides } from "@/lib/flow";
import { loadActiveFlowQuestions, runMatchResults } from "@/lib/flowRun";

const bodySchema = z.object({
  // A JSON-safe FlowAnswerState -- see lib/flowShared.ts's answerStateToRecord. Empty
  // array = an acknowledged interstitial / explicit empty selection, null = skipped.
  answers: z.record(z.string(), z.union([z.array(z.string()), z.null()])),
  // Not-yet-saved FlowOption.matchMode edits, keyed by option id -- lets
  // FlowQuestionsManager.tsx's hard-eliminator toggle show "if this were REQUIRE,
  // N of 460 programs would survive" BEFORE the admin commits the change, per
  // find-v2-question-spec.md's build-order note that this is the one edit that
  // silently changes every future respondent's results.
  optionOverrides: z
    .array(z.object({ optionId: z.string(), matchMode: z.enum(["WEIGHT", "REQUIRE"]) }))
    .optional(),
});

/**
 * Read-only: never writes anything. Reruns the SAME lib/flowRun.ts pipeline
 * `/match/results` uses (loadActiveFlowQuestions -> runMatchResults), with
 * `optionOverrides` applied in-memory first -- so a preview here and the real
 * ranking a live respondent would see can never disagree about anything except
 * the specific pending edit under test. Backs both halves of the Step 7 admin
 * preview screen: FlowPreviewPanel's live walk-through (answers only, no
 * overrides) and FlowQuestionsManager's inline eliminator-toggle preview (a
 * synthetic single-answer state plus one override).
 */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = bodySchema.parse(json);

    const liveQuestions = await loadActiveFlowQuestions();
    const overrideMap = new Map((body.optionOverrides ?? []).map((o) => [o.optionId, o.matchMode]));
    const questions = applyOptionOverrides(liveQuestions, overrideMap);
    const state = recordToAnswerState(body.answers);

    const results = await runMatchResults(questions, state);
    const bandCounts = { strong: 0, partial: 0, weak: 0, unranked: 0 };
    for (const s of results.scored) bandCounts[s.band]++;

    return NextResponse.json({
      survivorCount: results.survivorCount,
      totalCount: results.totalCount,
      bandCounts,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to compute preview" }, { status: 500 });
  }
}
