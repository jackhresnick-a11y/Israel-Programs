import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSignedInNotBanned } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { parseVideoLink, resolveShortVideoLink } from "@/lib/videoEmbed";

type Params = { params: Promise<{ id: string }> };

const UNSUPPORTED_LINK_ERROR =
  "Paste a video link from YouTube, Vimeo, Facebook, Instagram, or TikTok.";

/** Same http(s)-only discipline as lib/programs.ts's httpUrl -- rejects javascript:/data:. */
const videoBodySchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), { message: "Must be a valid http(s) URL" }),
  caption: z.string().trim().max(500).optional(),
});

/**
 * Records a video against a Program. Links from YouTube, Vimeo, Facebook,
 * Instagram, or TikTok -- canonicalized server-side to a known-safe embed URL
 * via parseVideoLink (or resolveShortVideoLink for fb.watch/vm.tiktok.com/
 * tiktok.com/t/ short links), never stored as pasted. File uploads (Vercel
 * Blob) are intentionally not accepted here: Blob egress on program video is
 * what suspended the store in July 2026, and the token-issuing upload route
 * (/api/videos/upload) has been removed, so this is the only remaining way
 * to add a video and it can't be pointed at a file.
 */
export async function POST(request: Request, { params }: Params) {
  const check = await requireSignedInNotBanned();
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsedBody = videoBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { url, caption } = parsedBody.data;

  const embed = parseVideoLink(url) ?? (await resolveShortVideoLink(url));
  if (!embed) {
    return NextResponse.json({ error: UNSUPPORTED_LINK_ERROR }, { status: 400 });
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
        caption: caption && caption.length > 0 ? caption : undefined,
      },
    });
    return NextResponse.json(video, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save video" }, { status: 500 });
  }
}
