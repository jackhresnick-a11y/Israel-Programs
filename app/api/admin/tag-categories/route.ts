import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createTagCategory } from "@/lib/tags";

const postBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  tint: z.string().min(1),
  showInFilter: z.boolean().default(true),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const category = await createTagCategory(body);
    return NextResponse.json(category);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
