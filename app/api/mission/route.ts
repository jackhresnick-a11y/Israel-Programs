import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { missionBlocksSchema, saveMissionBlocks } from "@/lib/mission";

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { blocks } = json as { blocks: unknown };
    const parsed = missionBlocksSchema.parse(blocks);
    const content = await saveMissionBlocks(parsed);
    return NextResponse.json(content);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save background content" }, { status: 500 });
  }
}
