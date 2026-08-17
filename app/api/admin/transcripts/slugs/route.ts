import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { listPublishedProgramNamesWithVideo } from "@/lib/programs";
import { parseVideoLink, type Provider } from "@/lib/videoEmbed";

type SlugRow = {
  id: string;
  slug: string;
  name: string;
  provider: Provider | null;
  watchUrl: string | null;
  websiteLanguage: string | null;
};

/** Admin-only: downloads {id, slug, name, provider, watchUrl, websiteLanguage} for every
 * PUBLISHED program as slugs.json -- the exact-slug lookup table
 * scripts/transcribe/transcribe.py reads locally, extended (on top of PR #28's
 * slug-only shape) so scripts/transcribe/fetch-videos.py can pull each program's video
 * without a second, hand-maintained URL parser: provider/watchUrl are derived
 * server-side via the same parseVideoLink lib/videoEmbed.ts already uses for the public
 * video-embed pipeline, never the raw stored videoUrl. A program with no videoUrl, or
 * one that doesn't parse against any of the five known providers, gets
 * `provider: null` so the operator can see what's missing rather than the script
 * guessing or crashing.
 *
 * There is no public version of this endpoint and no ingest token; the file only ever
 * leaves this route via an authenticated admin's own browser download. */
export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const programs = await listPublishedProgramNamesWithVideo();

  const rows: SlugRow[] = programs.map((p) => {
    const embed = p.videoUrl ? parseVideoLink(p.videoUrl) : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      provider: embed?.provider ?? null,
      watchUrl: embed?.watchUrl ?? null,
      websiteLanguage: p.websiteLanguage,
    };
  });

  return new NextResponse(JSON.stringify(rows, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="slugs.json"',
    },
  });
}
