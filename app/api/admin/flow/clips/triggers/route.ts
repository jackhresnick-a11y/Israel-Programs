import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createFlowVideoTrigger, flowConditionSchema } from "@/lib/flow";

const postBodySchema = z.object({
  videoId: z.string().min(1),
  questionId: z.string().min(1),
  mode: z.enum(["ON_DISPLAY", "ON_ANSWER"]),
  optionKeys: z.array(z.string()).default([]),
  when: flowConditionSchema.nullable().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const trigger = await createFlowVideoTrigger(body);
    return NextResponse.json(trigger);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create trigger" }, { status: 500 });
  }
}
