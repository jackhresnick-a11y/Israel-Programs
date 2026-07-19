import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createBucketRule, bucketRuleInputSchema } from "@/lib/pollBucketRules";

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = bucketRuleInputSchema.parse(json);
    const rule = await createBucketRule(body);
    return NextResponse.json(rule);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
