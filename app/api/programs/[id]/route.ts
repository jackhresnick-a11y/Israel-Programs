import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRole, requireSignedInNotBanned, isModeratorRole } from "@/lib/roles";
import { createProgramEdit, parseProgramFormData, toPublicProgram, updateProgram } from "@/lib/programs";
import { saveLogo, UploadError } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const program = await prisma.program.findUnique({
    // PUBLISHED-only: PENDING/REJECTED rows aren't public yet, so an unguessable id
    // shouldn't surface them here any more than the moderation queue itself does.
    where: { id, status: "PUBLISHED" },
    include: {
      tags: true,
      videos: true,
      reviews: {
        where: { status: "PUBLISHED" },
        // Never select userId/moderatedBy/moderatorNote -- this is a public API
        // response, same RSC-payload-leak discipline as every other public/sensitive
        // split in this codebase.
        select: { id: true, rating: true, text: true, reviewerName: true, isAnonymous: true, createdAt: true },
      },
    },
  });
  if (!program) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Same anonymity masking as lib/reviews.ts's listPublicStandaloneReviews -- this
  // route needs the program's other public fields in one query so it can't just
  // delegate to that helper, but the masking itself must match: reviewerName is only
  // returned when the reviewer didn't choose to post anonymously.
  const reviews = program.reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text,
    reviewerName: r.isAnonymous ? null : r.reviewerName,
    createdAt: r.createdAt,
  }));
  return NextResponse.json(toPublicProgram({ ...program, reviews }));
}

export async function PATCH(request: Request, { params }: Params) {
  const check = await requireSignedInNotBanned();
  if (!check.ok) {
    return NextResponse.json(
      { error: check.status === 403 ? "Your account is not permitted to propose edits" : "Unauthorized" },
      { status: check.status }
    );
  }

  const { id } = await params;

  try {
    const formData = await request.formData();
    const input = parseProgramFormData(formData);

    const logo = formData.get("logo");
    let logoUrl: string | undefined;
    let logoWarning: string | undefined;
    if (logo instanceof File && logo.size > 0) {
      try {
        logoUrl = (await saveLogo(logo)).url;
      } catch (logoErr) {
        if (logoErr instanceof UploadError) throw logoErr;
        // Storage (disk/Blob) failures shouldn't block the edit -- apply/queue
        // it without the logo change and let the submitter know.
        console.error("[program edit] logo save failed", {
          userId: check.userId,
          payloadKeys: [...formData.keys()],
        }, logoErr);
        logoWarning = "Your edit was saved, but the logo couldn't be uploaded. You can add it later by editing the program again.";
      }
    }

    if (isModeratorRole(check.role)) {
      const program = await updateProgram(id, { ...input, logoUrl });
      return NextResponse.json({ pending: false, program, warning: logoWarning });
    }

    await createProgramEdit(id, { ...input, logoUrl }, check.userId);
    const program = await prisma.program.findUnique({ where: { id }, select: { slug: true } });
    return NextResponse.json({ pending: true, slug: program?.slug, warning: logoWarning });
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
