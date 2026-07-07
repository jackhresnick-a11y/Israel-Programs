import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  await prisma.video.delete({ where: { id } });

  // Best-effort: the DB row is the source of truth for what's "deleted", so
  // don't fail the request over a Blob-side cleanup issue -- but do clean up
  // the underlying object rather than leaving it orphaned in the store.
  try {
    await del(video.url);
  } catch (err) {
    console.error("Failed to delete blob for video", id, video.url, err);
  }

  return NextResponse.json({ ok: true });
}
