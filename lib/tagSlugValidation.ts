import slugify from "slugify";
import { prisma } from "@/lib/prisma";

/** Shared by every admin-facing "typed name -> slug, reject an unknown tag" write path
 * (lib/flow.ts's FlowOption.tagSlugs, lib/programs.ts) -- CLAUDE.md documents
 * slug-approximation drift as a real, recurring failure mode, so these must stay
 * byte-for-byte identical rather than hand-duplicated per caller. */
export function slugifyValue(value: string) {
  return slugify(value, { lower: true, strict: true });
}

/** Thrown by a tagSlugs write (e.g. FlowOption) when asked to save an entry with no
 * matching live Tag row. The admin UI's tag picker only ever offers real Tag.slug
 * values, so this guards against a direct API call (or a future non-picker caller)
 * writing an option that silently does nothing at read time. */
export class UnknownTagSlugsError extends Error {
  slugs: string[];
  constructor(slugs: string[]) {
    super(`Unknown tag slug(s): ${slugs.join(", ")}`);
    this.name = "UnknownTagSlugsError";
    this.slugs = slugs;
  }
}

export async function assertTagSlugsExist(slugs: string[]) {
  if (slugs.length === 0) return;
  const rows = await prisma.tag.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
  const found = new Set(rows.map((r) => r.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) throw new UnknownTagSlugsError(missing);
}
