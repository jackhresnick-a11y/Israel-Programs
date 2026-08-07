import { revalidatePath } from "next/cache";
import { getProgramSlugById } from "@/lib/programs";

/**
 * Call after any write that changes what a program's public page shows (poll counts
 * moving past the COUNTED transition, an approved edit, a tag change, a review
 * decision, ...). Pairs with /programs/[slug]'s time-based `revalidate = 3600` --
 * this makes the update visible immediately instead of only on the next hourly tick.
 * Also targets "/" (revalidate = 3600, shows featured program cards) and "/programs" --
 * the latter is a no-op today since that route reads searchParams and is fully dynamic
 * (never cached), but costs nothing to include and starts working for free if it ever
 * gains partial caching.
 */
export async function revalidateProgram(programId: string): Promise<void> {
  const slug = await getProgramSlugById(programId);
  if (!slug) return;
  revalidatePath(`/programs/${slug}`);
  revalidatePath("/programs");
  revalidatePath("/");
}
