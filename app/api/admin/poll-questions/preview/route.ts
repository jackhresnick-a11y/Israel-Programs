import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { getProgramQuestionStats } from "@/lib/pollResults";

/** Admin-only: one program's per-question mean/count, for /admin/poll-questions' live
 * tier-preview screen. Deliberately returns raw stats only -- the client recomputes
 * computeBestForPhrases itself against locally-edited, unsaved tier/phrase values, so
 * this route never needs to know about an in-progress edit. */
export async function GET(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }

  try {
    const stats = await getProgramQuestionStats(programId);
    return NextResponse.json({ stats });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load preview stats" }, { status: 500 });
  }
}
