import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { bulkRejectElaborationAnswers } from "@/lib/pollElaborations";
import { prisma } from "@/lib/prisma";
import { revalidateProgram } from "@/lib/revalidate";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { ids, note } = bodySchema.parse(await request.json());
    const result = await bulkRejectElaborationAnswers(ids, check.userId, note);

    // Revalidate every distinct program these answers belong to -- a bulk action can
    // span multiple programs' ReviewsSection. Skipped entirely when nothing was actually
    // rejected (result.count === 0) -- both the ordinary "none of these ids matched" case
    // and the missing-table case bulkRejectElaborationAnswers degrades to, since this
    // query has no isMissingTableError guard of its own and would otherwise still throw.
    if (result.count > 0) {
      const answers = await prisma.pollElaborationAnswer.findMany({
        where: { id: { in: ids } },
        select: { response: { select: { programId: true } } },
      });
      const programIds = new Set(answers.map((a) => a.response.programId));
      for (const programId of programIds) await revalidateProgram(programId);
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to bulk-reject answers" }, { status: 500 });
  }
}
