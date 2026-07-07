import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { requireSignedIn } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { isVercelBlobUrl } from "@/lib/blob";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

/**
 * The video file itself is uploaded directly from the browser to Vercel Blob
 * (see /api/videos/upload for the token route). This route only records the
 * resulting blob URL against the Program -- it never receives the file body,
 * so it isn't subject to Vercel's read-only function filesystem or its
 * ~4.5MB request-body limit.
 */
export async function POST(request: Request, { params }: Params) {
  const check = await requireSignedIn();
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { url, filename, mimeType, caption } = body as Record<string, unknown>;

  if (typeof url !== "string" || !isVercelBlobUrl(url)) {
    return NextResponse.json({ error: "Invalid video URL" }, { status: 400 });
  }
  if (typeof filename !== "string" || filename.length === 0) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  if (typeof mimeType !== "string" || !ALLOWED_VIDEO_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // A retried/double-submitted request would otherwise create a second Video
  // row pointing at the same already-recorded blob.
  const existing = await prisma.video.findFirst({ where: { programId: id, url } });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // Vercel Blob's client-side upload() call resolves once the object is
  // fully written, but that response reaches the browser before this route
  // is ever called -- there's no guarantee the object is visible to every
  // read path (including Blob's own metadata store) by the time we get here.
  // Confirming via head() before writing the DB row means we only ever
  // persist a URL that is verifiably a committed, non-empty blob.
  try {
    const blobMeta = await head(url);
    if (!blobMeta || blobMeta.size === 0) {
      return NextResponse.json(
        { error: "Uploaded video appears to be empty. Please try again." },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("Blob head() check failed for", url, err);
    return NextResponse.json(
      { error: "Video upload did not finish propagating. Please try again in a moment." },
      { status: 409 }
    );
  }

  try {
    const video = await prisma.video.create({
      data: {
        programId: id,
        url,
        filename,
        mimeType,
        caption: typeof caption === "string" && caption.length > 0 ? caption : undefined,
      },
    });
    return NextResponse.json(video, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save video" }, { status: 500 });
  }
}
