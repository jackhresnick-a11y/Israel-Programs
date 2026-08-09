import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createFinderOption } from "@/lib/finder";

const postBodySchema = z.object({
  questionId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  helpText: z.string().trim().max(300).nullable().optional(),
  tagSlugs: z.array(z.string()).default([]),
  durationValues: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const option = await createFinderOption(body);
    return NextResponse.json(option);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
  }
}
