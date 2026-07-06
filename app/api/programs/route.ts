import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSignedInNotBanned, isModeratorRole } from "@/lib/roles";
import { createProgram, listPrograms, parseProgramFormData } from "@/lib/programs";
import { saveLogo, UploadError } from "@/lib/storage";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagsParam = searchParams.get("tags");
  const programs = await listPrograms({
    q: searchParams.get("q") ?? undefined,
    tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
    duration: (searchParams.get("duration") as DurationType) ?? undefined,
    hasScholarship: searchParams.get("hasScholarship") === "true" ? true : undefined,
    hasCollegeCredit: searchParams.get("hasCollegeCredit") === "true" ? true : undefined,
    travelType: (searchParams.get("travelType") as TravelType) ?? undefined,
  });
  return NextResponse.json(programs);
}

export async function POST(request: Request) {
  const check = await requireSignedInNotBanned();
  if (!check.ok) {
    return NextResponse.json(
      { error: check.status === 403 ? "Your account is not permitted to submit programs" : "Unauthorized" },
      { status: check.status }
    );
  }

  try {
    const formData = await request.formData();
    const input = parseProgramFormData(formData);

    const logo = formData.get("logo");
    let logoUrl: string | undefined;
    if (logo instanceof File && logo.size > 0) {
      logoUrl = (await saveLogo(logo)).url;
    }

    const status = isModeratorRole(check.role) ? "PUBLISHED" : "PENDING";
    const program = await createProgram({ ...input, logoUrl }, check.userId, status);
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
