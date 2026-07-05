import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { createProgram, listPrograms, parseProgramFormData } from "@/lib/programs";
import { saveLogo, UploadError } from "@/lib/storage";
import type { DurationType } from "@/app/generated/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const programs = await listPrograms({
    q: searchParams.get("q") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    duration: (searchParams.get("duration") as DurationType) ?? undefined,
  });
  return NextResponse.json(programs);
}

export async function POST(request: Request) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const formData = await request.formData();
    const input = parseProgramFormData(formData);

    const logo = formData.get("logo");
    let logoUrl: string | undefined;
    if (logo instanceof File && logo.size > 0) {
      logoUrl = (await saveLogo(logo)).url;
    }

    const program = await createProgram({ ...input, logoUrl }, check.userId);
    return NextResponse.json(program, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create program" }, { status: 500 });
  }
}
