import { prisma } from "@/lib/prisma";
import {
  TAG_PROVENANCE_SOURCES,
  TAG_PROVENANCE_SOURCE_LABELS,
  TagProvenanceSource,
  resolveSource,
  tagProvenanceInputSchema,
  countUnprovenancedTags,
  type TagProvenanceInput,
} from "@/lib/tagProvenanceShared";

export {
  TAG_PROVENANCE_SOURCES,
  TAG_PROVENANCE_SOURCE_LABELS,
  TagProvenanceSource,
  resolveSource,
  tagProvenanceInputSchema,
  countUnprovenancedTags,
};
export type { TagProvenanceInput };

export type ProgramTagProvenanceRow = {
  id: string;
  tagId: string;
  source: TagProvenanceSource;
  sourceUrl: string | null;
  note: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

/** Every provenance row for one program's currently-attached tags -- admin-only read, no
 *  relation field exists to reach this from a Program query (see the model's schema doc
 *  comment), so callers always query this table directly and key results by tagId. */
export async function getProgramTagProvenance(programId: string): Promise<ProgramTagProvenanceRow[]> {
  return prisma.programTagProvenance.findMany({
    where: { programId },
    select: {
      id: true,
      tagId: true,
      source: true,
      sourceUrl: true,
      note: true,
      verifiedAt: true,
      verifiedBy: true,
    },
  });
}

/** Admin-only write for one program-tag pair's provenance. Upserts on the
 *  (programId, tagId) unique -- setting a source always stamps verifiedAt/verifiedBy from
 *  the current admin session, never client input, same "server stamps it" posture as
 *  PollResponse.presentedQuestionIds. Blank sourceUrl/note normalize to null. This never
 *  touches Program.tags/_ProgramTags -- it records provenance for an existing pair, it
 *  does not attach or detach the tag itself (tag values are out of scope). */
export async function setTagProvenance(
  programId: string,
  input: TagProvenanceInput,
  verifiedBy: string
) {
  const sourceUrl = input.sourceUrl ? input.sourceUrl : null;
  const note = input.note ? input.note : null;
  const verifiedAt = new Date();

  return prisma.programTagProvenance.upsert({
    where: { programId_tagId: { programId, tagId: input.tagId } },
    create: {
      programId,
      tagId: input.tagId,
      source: input.source,
      sourceUrl,
      note,
      verifiedAt,
      verifiedBy,
    },
    update: {
      source: input.source,
      sourceUrl,
      note,
      verifiedAt,
      verifiedBy,
    },
  });
}

export type TagProvenanceBacklogRow = {
  programId: string;
  programName: string;
  programSlug: string;
  unprovenancedCount: number;
};

export type TagProvenanceBacklog = {
  totalPairs: number;
  unprovenancedPairs: number;
  bySource: Record<TagProvenanceSource, number>;
  programs: TagProvenanceBacklogRow[];
};

/** /admin/programs' "needs provenance" backlog. Folded in JS rather than a raw SQL join
 *  against the Prisma-managed `_ProgramTags` shadow table -- at 461 programs / ~3,500
 *  pairs this is cheap, and it's the same "batch fetch + fold in memory" shape
 *  lib/pollResults.ts's listProgramsBestFor already uses for per-program poll answers. */
export async function getTagProvenanceBacklog(): Promise<TagProvenanceBacklog> {
  const [programs, provenanceRows] = await Promise.all([
    prisma.program.findMany({
      select: { id: true, name: true, slug: true, tags: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.programTagProvenance.findMany({
      select: { programId: true, tagId: true, source: true },
    }),
  ]);

  const provenanceByProgram = new Map<string, Set<string>>();
  const bySource = Object.fromEntries(TAG_PROVENANCE_SOURCES.map((s) => [s, 0])) as Record<
    TagProvenanceSource,
    number
  >;
  for (const row of provenanceRows) {
    bySource[row.source] += 1;
    const set = provenanceByProgram.get(row.programId) ?? new Set<string>();
    set.add(row.tagId);
    provenanceByProgram.set(row.programId, set);
  }

  let totalPairs = 0;
  let unprovenancedPairs = 0;
  const backlogPrograms: TagProvenanceBacklogRow[] = [];

  for (const program of programs) {
    const tagIds = program.tags.map((t) => t.id);
    totalPairs += tagIds.length;
    const unprovenancedCount = countUnprovenancedTags(
      tagIds,
      provenanceByProgram.get(program.id) ?? new Set<string>()
    );
    unprovenancedPairs += unprovenancedCount;
    if (unprovenancedCount > 0) {
      backlogPrograms.push({
        programId: program.id,
        programName: program.name,
        programSlug: program.slug,
        unprovenancedCount,
      });
    }
  }

  return { totalPairs, unprovenancedPairs, bySource, programs: backlogPrograms };
}

export type UnusedTag = { id: string; name: string; slug: string };

/** Read-only cleanup list: tags attached to zero programs. No delete action here --
 *  deleting a tag is a tag-value decision, out of scope for provenance recordkeeping. */
export async function listUnusedTags(): Promise<UnusedTag[]> {
  return prisma.tag.findMany({
    where: { programs: { none: {} } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}
