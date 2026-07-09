import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { upsertSiteContent } from "@/lib/siteContent";

const homeIntroSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export async function PATCH(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const json = await request.json();
    const { text } = homeIntroSchema.parse(json);
    const content = await upsertSiteContent("homeIntro", text);
    return NextResponse.json(content);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save intro text" }, { status: 500 });
  }
}
