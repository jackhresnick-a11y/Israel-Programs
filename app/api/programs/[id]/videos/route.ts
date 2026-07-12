import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { parseVideoLink } from "@/lib/videoEmbed";

type Params = { params: Promise<{ id: string }> };

/**
 * Records a video against a Program. YouTube/Vimeo links only -- canonicalized
 * server-side to a known-safe embed URL via parseVideoLink, never stored as pasted.
 * File uploads (Vercel Blob) are intentionally not accepted here: Blob egress on
 * program video is what suspended the store in July 2026, and the token-issuing
 * upload route (/api/videos/upload) has been removed, so this is the only remaining
 * way to add a video and it can't be pointed at a file.
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

  const { url, caption } = body as Record<string, unknown>;

  if (typeof url !== "string") {
    return NextResponse.json({ error: "Invalid video URL" }, { status: 400 });
  }

  const embed = parseVideoLink(url);
  if (!embed) {
    return NextResponse.json(
      { error: "Paste a YouTube or Vimeo link (e.g. https://youtu.be/... or https://vimeo.com/...)" },
      { status: 400 }
    );
  }

  // Dedupe on the canonical embed URL so re-pasting the same video in a
  // different link shape (youtu.be vs /watch) can't create a second row.
  const existing = await prisma.video.findFirst({
    where: { programId: id, url: embed.embedUrl },
  });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  try {
    const video = await prisma.video.create({
      data: {
        programId: id,
        url: embed.embedUrl,
        // filename preserves the link as pasted (provenance); mimeType
        // marks the provider so embeds are distinguishable from files.
        filename: url,
        mimeType: `embed/${embed.provider}`,
        caption: typeof caption === "string" && caption.length > 0 ? caption : undefined,
      },
    });
    return NextResponse.json(video, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save video" }, { status: 500 });
  }
}
