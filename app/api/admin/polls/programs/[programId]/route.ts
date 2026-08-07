import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { upsertProgramPollConfig, programPollConfigPatchSchema } from "@/lib/pollConfig";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { programId } = await params;
    const json = await request.json();
    const body = programPollConfigPatchSchema.parse(json);
    const config = await upsertProgramPollConfig(programId, body);
    // Unconditional, same as polls/links/[id]/route.ts's token-update revalidation --
    // toggling pollLinkPublic (and the publicToken it mints on first enable) changes
    // the href /rate's picker shows for this program (see listPublicPollLinks), and
    // scoping this to only the pollLinkPublic-present case risked missing it.
    revalidatePath("/rate");
    return NextResponse.json(config);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update program config" }, { status: 500 });
  }
}
