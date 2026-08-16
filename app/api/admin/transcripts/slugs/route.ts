import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { listPublishedProgramNames } from "@/lib/programs";

/** Admin-only: downloads {id, slug, name} for every PUBLISHED program as slugs.json,
 * the exact-slug lookup table scripts/transcribe/transcribe.py reads locally -- there
 * is no public version of this endpoint and no ingest token; the file only ever leaves
 * this route via an authenticated admin's own browser download. */
export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const programs = await listPublishedProgramNames();

  return new NextResponse(JSON.stringify(programs, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="slugs.json"',
    },
  });
}
