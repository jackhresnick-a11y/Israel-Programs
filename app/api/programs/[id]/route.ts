import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { parseProgramFormData, updateProgram } from "@/lib/programs";
import { saveLogo, UploadError } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const program = await prisma.program.findUnique({
    where: { id },
    include: { tags: true, videos: true, reviews: true },
  });
  if (!program) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(program);
}

export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const formData = await request.formData();
    const input = parseProgramFormData(formData);

    const logo = formData.get("logo");
    let logoUrl: string | undefined;
    if (logo instanceof File && logo.size > 0) {
      logoUrl = (await saveLogo(logo)).url;
    }

    const program = await updateProgram(id, { ...input, logoUrl });
    return NextResponse.json(program);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update program" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  await prisma.program.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
