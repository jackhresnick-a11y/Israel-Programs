import { revalidatePath, revalidateTag } from "next/cache";
import { getProgramSlugById } from "@/lib/programs";
import { POLL_RANK_TAG } from "@/lib/pollRankData";

/**
 * Call after any write that changes what a program's public page shows (poll counts
 * moving past the COUNTED transition, an approved edit, a tag change, a review
 * decision, ...). Pairs with /programs/[slug]'s time-based `revalidate = 3600` --
 * this makes the update visible immediately instead of only on the next hourly tick.
 * Also targets "/" (revalidate = 3600, shows featured program cards) and "/programs" --
 * the latter is a no-op today since that route reads searchParams and is fully dynamic
 * (never cached), but costs nothing to include and starts working for free if it ever
 * gains partial caching.
 *
 * "/rate" is included too: its picker lists published programs by name/link (see
 * app/rate/page.tsx's listPublishedProgramsForPicker), so approve/reject -- the two
 * call sites that matter here -- need it kept fresh the same way /programs does. The
 * other call sites (tag edits, poll-response/review moderation) don't change a
 * program's published status, so revalidating /rate there is a harmless no-op, not a
 * new correctness dependency.
 *
 * Also invalidates the /match poll-rank-modifier aggregate (lib/pollRankData.ts) --
 * every call site here is a write that can plausibly change a COUNTED recommend
 * answer (the autosave COUNTED transition, review/response moderation), so this is
 * the one place that cache needs to be told to refresh. Over-invalidating a ~300-row
 * aggregate on an unrelated call site (e.g. a tag edit) costs nothing.
 *
 * "/llms.txt" is included too (revalidate = 3600, same window): lib/briefs.ts's
 * publishBrief/archiveBrief call this, so a brief going live or being pulled shows up
 * there immediately rather than waiting out the hour, same reasoning as /rate above.
 */
export async function revalidateProgram(programId: string): Promise<void> {
  const slug = await getProgramSlugById(programId);
  if (!slug) return;
  revalidatePath(`/programs/${slug}`);
  revalidatePath("/programs");
  revalidatePath("/");
  revalidatePath("/rate");
  revalidatePath("/llms.txt");
  // { expire: 0 } is Next 16's non-deprecated spelling of "invalidate now" --
  // revalidateTag(tag) alone still works but logs a deprecation warning on every call.
  revalidateTag(POLL_RANK_TAG, { expire: 0 });
}
