import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { briefTypeInputSchema, createBriefType } from "@/lib/briefs";

/** Admin-only: creates a new brief type (e.g. "What it is", "A day in the life"). See
 * schema.prisma's BriefType doc comment -- name/slug/promptText are admin-authored, not
 * hardcoded, so a new type needs zero code changes. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const body = briefTypeInputSchema.parse(await request.json());
    const briefType = await createBriefType(body);
    return NextResponse.json(briefType);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A brief type with that slug already exists" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create brief type" }, { status: 500 });
  }
}
