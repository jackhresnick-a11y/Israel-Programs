import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { setProgramWebsiteLanguage } from "@/lib/programs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  language: z.enum(["ENGLISH", "HEBREW", "BOTH"]).nullable(),
});

/** Admin-only: sets or clears one program's detected website language, for the bulk-email tool's sections. */
export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const { language } = bodySchema.parse(await request.json());
    await setProgramWebsiteLanguage(id, language);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update website language" }, { status: 500 });
  }
}
