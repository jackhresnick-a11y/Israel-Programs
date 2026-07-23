import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSignedInNotBanned, isModeratorRole } from "@/lib/roles";
import { createProgram, listPrograms, parseProgramFormData, toPublicProgram } from "@/lib/programs";
import { saveLogo, UploadError } from "@/lib/storage";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagsParam = searchParams.get("tags");
  const durationParam = searchParams.get("duration");
  const programs = await listPrograms({
    q: searchParams.get("q") ?? undefined,
    tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
    duration: durationParam
      ? (durationParam.split(",").filter(Boolean) as DurationType[])
      : undefined,
    hasScholarship: searchParams.get("hasScholarship") === "true" ? true : undefined,
    hasCollegeCredit: searchParams.get("hasCollegeCredit") === "true" ? true : undefined,
    travelType: (searchParams.get("travelType") as TravelType) ?? undefined,
  });
  return NextResponse.json(programs.map(toPublicProgram));
}

export async function POST(request: Request) {
  const check = await requireSignedInNotBanned();
  if (!check.ok) {
    return NextResponse.json(
      { error: check.status === 403 ? "Your account is not permitted to submit programs" : "Unauthorized" },
      { status: check.status }
    );
  }

  let formData: FormData | undefined;
  try {
    formData = await request.formData();
    const input = parseProgramFormData(formData);

    const logo = formData.get("logo");
    let logoUrl: string | undefined;
    let logoWarning: string | undefined;
    if (logo instanceof File && logo.size > 0) {
      try {
        logoUrl = (await saveLogo(logo)).url;
      } catch (logoErr) {
        if (logoErr instanceof UploadError) throw logoErr;
        // Storage (disk/Blob) failures shouldn't block program creation --
        // create without the logo and let the submitter know.
        console.error("[program create] logo save failed", {
          userId: check.userId,
          payloadKeys: [...formData.keys()],
        }, logoErr);
        logoWarning = "Your program was saved, but the logo couldn't be uploaded. You can add it later by editing the program.";
      }
    }

    const status = isModeratorRole(check.role) ? "PUBLISHED" : "PENDING";
    const program = await createProgram({ ...input, logoUrl }, check.userId, status);
    return NextResponse.json({ ...program, warning: logoWarning }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "Invalid input", field: issue?.path[0] ?? null },
        { status: 400 }
      );
    }
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message, field: "logo" }, { status: 400 });
    }
    console.error("[program create] failed", {
      userId: check.userId,
      payloadKeys: formData ? [...formData.keys()] : [],
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return NextResponse.json(
      { error: "Something went wrong saving your program. Please try again." },
      { status: 500 }
    );
  }
}
