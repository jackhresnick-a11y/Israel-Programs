import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireRole } from "@/lib/roles";
import { isVercelBlobUrl } from "@/lib/blob";
import { clearProgramLogo } from "@/lib/programs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  let previousUrl: string | null;
  try {
    previousUrl = await clearProgramLogo(id);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  // Best-effort: the DB row is the source of truth for what's "removed", so
  // don't fail the request over a Blob-side cleanup issue -- but do clean up
  // the underlying object rather than leaving it orphaned in the store. Only
  // Blob-hosted values need this; legacy /uploads/logos/* paths and null were
  // never a blob object, so calling del() on them would just be a guaranteed
  // failure.
  if (previousUrl && isVercelBlobUrl(previousUrl)) {
    try {
      await del(previousUrl);
    } catch (err) {
      console.error("Failed to delete blob for program logo", id, previousUrl, err);
    }
  }

  return NextResponse.json({ ok: true });
}
