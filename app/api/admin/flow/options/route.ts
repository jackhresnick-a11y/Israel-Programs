import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createFlowOption, UnknownTagSlugsError } from "@/lib/flow";

const postBodySchema = z.object({
  questionId: z.string().min(1),
  label: z.string().trim().min(1).max(200),
  rationale: z.string().trim().max(400).nullable().optional(),
  tagSlugs: z.array(z.string()).default([]),
  durationValues: z.array(z.string()).default([]),
  matchMode: z.enum(["WEIGHT", "REQUIRE"]).optional(),
  weight: z.number().int().optional(),
  requireIncludesUntagged: z.boolean().optional(),
  optionSetKeys: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const option = await createFlowOption(body);
    return NextResponse.json(option);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UnknownTagSlugsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "An option with that name already exists on this question" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
  }
}
