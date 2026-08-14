import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { glossaryEntriesSchema, saveGlossaryEntries } from "@/lib/glossary";

const bodySchema = z.object({
  entries: glossaryEntriesSchema,
});

/** Admin-only: replaces the whole glossary entries array in one shot -- same
 * whole-array-in, whole-array-out shape as /api/mission (lib/mission.ts's
 * saveMissionBlocks), not a per-entry PATCH, since the array is one SiteContent JSON
 * blob rather than individually addressable rows. glossaryEntriesSchema's
 * cross-entry .superRefine (lib/glossaryContent.ts) is what catches duplicate slugs
 * and unresolvable `related` references here -- the same schema the pure-defaults
 * unit test exercises now also gates admin-submitted content. */
export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const { entries } = bodySchema.parse(await request.json());
    await saveGlossaryEntries(entries);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save the glossary" }, { status: 500 });
  }
}
