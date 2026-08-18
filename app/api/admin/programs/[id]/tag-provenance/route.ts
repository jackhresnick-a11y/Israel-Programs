import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { setTagProvenance, tagProvenanceInputSchema } from "@/lib/tagProvenance";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: upserts one program-tag pair's provenance (source/sourceUrl/note),
 * stamping verifiedAt/verifiedBy from the session -- a sibling of
 * PATCH /api/admin/programs/[id]/tags, but deliberately does not call
 * revalidateProgram(): provenance is never rendered on any public page, so there is
 * nothing here for ISR/RSC caching to invalidate. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const input = tagProvenanceInputSchema.parse(await request.json());
    const updated = await setTagProvenance(id, input, check.userId);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && (err.code === "P2025" || err.code === "P2003")) {
      // P2003: the upsert's create branch violates the programId/tagId foreign key --
      // i.e. the program or tag doesn't exist. P2025: not expected from upsert, kept for
      // parity with the sibling tags route in case Prisma's error shape ever changes.
      return NextResponse.json({ error: "Program or tag not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update tag provenance" }, { status: 500 });
  }
}
