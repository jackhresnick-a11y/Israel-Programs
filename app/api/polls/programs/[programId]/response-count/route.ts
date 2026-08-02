import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Public, unauthenticated read of a program's flat COUNTED response count -- the same
 * definition lib/pollResults.ts's getProgramPollSummary already exposes publicly as
 * `responseCount` / "N people have rated this program" (components/PollSummaryStrip.tsx),
 * NOT the stricter readiness-bar count used by the admin coverage view
 * (countResponsesMeetingReadinessBar). Reusing the public definition means a program never
 * shows two different "response count" numbers on two public-facing surfaces, and it's a
 * single index-covered COUNT(*) rather than the coverage view's per-response bucket-spread
 * evaluation -- cheap enough for an unauthenticated route.
 *
 * Response body is deliberately `{ ok, count }` and nothing else. Do not add a `needed`,
 * `target`, `remaining`, or percentage field here -- the unlock threshold must never be
 * public (see lib/pollShared.ts's ProgramPollConfig.minResponsesToPublish / the admin-only
 * MIN_RESPONSES_FOR_RATING). A future edit adding one of those fields is going against this
 * route's contract, not extending it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const ip = getClientIp(request);

  if (!checkRateLimit(`poll-count:${ip}`, { limit: 30, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { status: true },
  });
  if (!program || program.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const count = await prisma.pollResponse.count({ where: { programId, status: "COUNTED" } });

  return NextResponse.json(
    { ok: true, count },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
