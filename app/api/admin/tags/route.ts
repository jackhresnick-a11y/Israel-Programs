import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createTag } from "@/lib/tags";

const postBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).nullable(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const tag = await createTag(body);
    return NextResponse.json(tag);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
