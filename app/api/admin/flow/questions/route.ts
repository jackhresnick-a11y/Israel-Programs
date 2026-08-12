import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createFlowQuestion } from "@/lib/flow";

const postBodySchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  helpText: z.string().trim().max(500).nullable().optional(),
  type: z.enum(["FILTER", "CHALLENGE", "TRADEOFF"]).optional(),
  skippable: z.boolean().optional(),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const question = await createFlowQuestion(body);
    return NextResponse.json(question);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A question with that prompt already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}
