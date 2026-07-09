import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createRegion } from "@/lib/regions";

const postBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  memberSlugs: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const body = postBodySchema.parse(json);
    const region = await createRegion(body);
    return NextResponse.json(region);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create region" }, { status: 500 });
  }
}
