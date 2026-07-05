import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { saveVideo, UploadError } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("video");
  const caption = formData.get("caption")?.toString() || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No video file provided" }, { status: 400 });
  }

  try {
    const saved = await saveVideo(file);
    const video = await prisma.video.create({
      data: {
        programId: id,
        url: saved.url,
        filename: saved.filename,
        mimeType: saved.mimeType,
        caption,
      },
    });
    return NextResponse.json(video, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to upload video" }, { status: 500 });
  }
}
