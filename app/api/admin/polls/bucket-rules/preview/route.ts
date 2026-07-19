import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { previewBucketRule, bucketRulePreviewSchema } from "@/lib/pollBucketRules";

/** Computes the "will newly affect N programs" preview shown before an admin can save a
 * rule create/edit -- see BucketRuleManager.tsx, which disables Save until this returns
 * for the rule's current bucket/tags. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = bucketRulePreviewSchema.parse(json);
    const preview = await previewBucketRule(body);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to preview rule" }, { status: 500 });
  }
}
