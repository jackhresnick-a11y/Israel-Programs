import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { approveTranscriptTag, rejectTranscriptTag } from "@/lib/programs";
import { UnknownTagSlugsError } from "@/lib/tagSlugValidation";
import { revalidateProgram } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  slug: z.string().trim().min(1),
  action: z.enum(["approve", "reject"]),
});

/** Admin-only: accepts or rejects one transcript-suggested tag for a program.
 * Approving connects an existing Tag by slug (never mints one -- an unrecognized slug
 * is a 400) and clears the suggestion either way. Nothing here auto-applies; every
 * suggestion needs an explicit admin action. See lib/programs.ts's
 * approveTranscriptTag/rejectTranscriptTag. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { slug, action } = bodySchema.parse(await request.json());
    if (action === "approve") {
      await approveTranscriptTag(id, slug);
      await revalidateProgram(id);
    } else {
      await rejectTranscriptTag(id, slug);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UnknownTagSlugsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update transcript tag" }, { status: 500 });
  }
}
