import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidateProgram } from "@/lib/revalidate";
import { isInsufficientPaste } from "@/lib/briefsShared";

export { INSUFFICIENT_SENTINEL, isInsufficientPaste, buildCopyPayload, joinTranscripts } from "@/lib/briefsShared";

/** True for a Prisma "table/column does not exist" error (P2021/P2022) -- the state this
 * repo's own migration-ordering trap produces (see CLAUDE.md's "migration ordering is
 * code-last" section) if this code runs before 20260903000000_add_program_briefs is
 * applied. Every READ path below degrades to empty rather than 500ing, since Vercel
 * previews run against the production DB -- the public program page, llms.txt, and the
 * assistant must all keep rendering with briefs simply absent. Write paths deliberately
 * do NOT get this treatment (there is no sensible "degrade to empty" for an admin save),
 * same asymmetry as lib/transcripts.ts's copy of this helper and the original in
 * lib/pollElaborations.ts. */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("code" in err)) return false;
  return err.code === "P2021" || err.code === "P2022";
}

export const briefTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers, and hyphens only"),
  promptText: z.string().trim().min(1),
  sendToAssistant: z.boolean().default(false),
  supersedesAiBrief: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const briefTypeUpdateSchema = briefTypeInputSchema.partial();

export const briefDraftSchema = z.object({
  text: z.string().max(20_000),
});

export type BriefTypeRow = {
  id: string;
  name: string;
  slug: string;
  promptText: string;
  promptVersion: number;
  sendToAssistant: boolean;
  supersedesAiBrief: boolean;
  sortOrder: number;
  active: boolean;
};

export type ProgramBriefRow = {
  id: string;
  briefTypeId: string;
  text: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  promptVersionUsed: number;
  needsRegeneration: boolean;
  insufficient: boolean;
  insufficientAt: Date | null;
  updatedAt: Date;
};

/** Admin CRUD listing for /admin/briefs/types -- every BriefType, active or not, ordered
 * the same way the public render/assistant/copy-picker order them. */
export async function listBriefTypes(): Promise<BriefTypeRow[]> {
  try {
    return await prisma.briefType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export async function createBriefType(input: z.infer<typeof briefTypeInputSchema>): Promise<BriefTypeRow> {
  return prisma.briefType.create({ data: { ...input, promptVersion: 1 } });
}

/** Bumps promptVersion only when promptText actually changes -- a rename or a
 * sendToAssistant/active toggle doesn't invalidate any ProgramBrief's
 * promptVersionUsed. */
export async function updateBriefType(
  id: string,
  input: z.infer<typeof briefTypeUpdateSchema>
): Promise<BriefTypeRow> {
  const current = await prisma.briefType.findUniqueOrThrow({ where: { id } });
  const promptChanged = input.promptText !== undefined && input.promptText !== current.promptText;
  return prisma.briefType.update({
    where: { id },
    data: { ...input, promptVersion: promptChanged ? current.promptVersion + 1 : undefined },
  });
}

/** Refuses to delete a type that any ProgramBrief still references (the DB's
 * onDelete: Restrict would refuse anyway, but this gives the admin a clear message
 * instead of a raw FK-violation 500) -- deactivate it instead to stop it being offered
 * for new work while keeping its already-published briefs intact. */
export async function deleteBriefType(id: string): Promise<void> {
  const briefCount = await prisma.programBrief.count({ where: { briefTypeId: id } });
  if (briefCount > 0) {
    throw new Error("This brief type has briefs and can’t be deleted — deactivate it instead");
  }
  await prisma.briefType.delete({ where: { id } });
}

/** Every transcript's text for one program, oldest first, joined for the copy-payload
 * builder and the retargeted AI "Generate" button -- the one remaining reader that
 * replaces the removed lib/programs.ts's getProgramVideoTranscript. */
export async function getConcatenatedTranscript(
  programId: string
): Promise<{ filename: string; text: string }[]> {
  try {
    return await prisma.transcript.findMany({
      where: { programId },
      select: { filename: true, text: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

/** Admin-only: every active BriefType alongside this program's current non-ARCHIVED
 * brief of that type (or null if nothing has been drafted yet), for the side-by-side
 * /admin/briefs editor. Ordered by BriefType.sortOrder, matching public render order. */
export async function getProgramBriefsForAdmin(
  programId: string
): Promise<{ briefType: BriefTypeRow; brief: ProgramBriefRow | null }[]> {
  try {
    const [types, briefs] = await Promise.all([
      prisma.briefType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.programBrief.findMany({ where: { programId, status: { not: "ARCHIVED" } } }),
    ]);
    const briefByTypeId = new Map(briefs.map((b) => [b.briefTypeId, b]));
    return types.map((briefType) => ({ briefType, brief: briefByTypeId.get(briefType.id) ?? null }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export type PublishedBrief = { typeName: string; typeSlug: string; text: string };

/** PUBLISHED briefs only, ordered by BriefType.sortOrder -- the one read path shared by
 * the public program page and llms.txt's "## Programs" section, so the two surfaces can
 * never disagree about which brief text is live. Gated on ProgramBrief.status alone,
 * independent of BriefType.active: deactivating a type stops it being offered for new
 * work, it does not retroactively unpublish content a moderator already published. */
export async function getPublishedBriefsForProgram(programId: string): Promise<PublishedBrief[]> {
  try {
    const rows = await prisma.programBrief.findMany({
      where: { programId, status: "PUBLISHED" },
      select: { text: true, briefType: { select: { name: true, slug: true, sortOrder: true } } },
      orderBy: { briefType: { sortOrder: "asc" } },
    });
    return rows.map((r) => ({ typeName: r.briefType.name, typeSlug: r.briefType.slug, text: r.text }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export type ProgramWithBriefs = { slug: string; name: string; briefs: PublishedBrief[] };

/** Catalog-wide read for llms.txt's "## Programs" section -- every PUBLISHED program
 * that has at least one PUBLISHED brief, each brief ordered by BriefType.sortOrder. Same
 * PUBLISHED-status-alone gate as getPublishedBriefsForProgram, batched into one query
 * rather than one getPublishedBriefsForProgram call per program in the catalog. */
export async function listProgramsWithPublishedBriefs(): Promise<ProgramWithBriefs[]> {
  try {
    const rows = await prisma.program.findMany({
      where: { status: "PUBLISHED", briefs: { some: { status: "PUBLISHED" } } },
      select: {
        slug: true,
        name: true,
        briefs: {
          where: { status: "PUBLISHED" },
          select: { text: true, briefType: { select: { name: true, slug: true, sortOrder: true } } },
          orderBy: { briefType: { sortOrder: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((p) => ({
      slug: p.slug,
      name: p.name,
      briefs: p.briefs.map((b) => ({ typeName: b.briefType.name, typeSlug: b.briefType.slug, text: b.text })),
    }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export type AssistantBriefs = {
  /** PUBLISHED briefs whose BriefType.sendToAssistant is true, for the candidate
   * enrichment block. */
  briefs: { typeName: string; text: string }[];
  /** True when a PUBLISHED brief of a supersedesAiBrief type exists -- the assistant
   * route uses this to drop Program.aiBrief from the payload rather than double-billing
   * the same paragraph. */
  supersedesAiBrief: boolean;
};

/** Read path for the assistant's per-candidate enrichment (app/api/assistant/route.ts)
 * -- same PUBLISHED-status gate as getPublishedBriefsForProgram, further filtered to
 * sendToAssistant types only. */
export async function getAssistantBriefsForProgram(programId: string): Promise<AssistantBriefs> {
  try {
    const rows = await prisma.programBrief.findMany({
      where: { programId, status: "PUBLISHED" },
      select: { text: true, briefType: { select: { name: true, sendToAssistant: true, supersedesAiBrief: true } } },
      orderBy: { briefType: { sortOrder: "asc" } },
    });
    return {
      briefs: rows.filter((r) => r.briefType.sendToAssistant).map((r) => ({ typeName: r.briefType.name, text: r.text })),
      supersedesAiBrief: rows.some((r) => r.briefType.supersedesAiBrief),
    };
  } catch (err) {
    if (isMissingTableError(err)) return { briefs: [], supersedesAiBrief: false };
    throw err;
  }
}

export type SaveBriefDraftResult = { insufficient: boolean; brief: ProgramBriefRow };

/** Admin-only: saves a draft for one (program, brief type) slot. An exact
 * INSUFFICIENT_SENTINEL paste is recorded as a durable, reload-surviving flag (text "",
 * insufficient: true) rather than saved as brief text or rejected outright -- real text
 * pasted later clears it in the same write. Never publishes: this only ever writes/keeps
 * status DRAFT (a PUBLISHED row that gets re-edited stays PUBLISHED until an admin
 * explicitly archives it -- see archiveBrief -- so an accidental re-save can't
 * un-publish something live). Upserts against the (programId, briefTypeId) slot among
 * non-ARCHIVED rows -- there is no first-class Prisma upsert for a partial-unique key,
 * so this is a plain find-then-write, same shape as other single-admin-at-a-time CRUD in
 * this codebase (e.g. lib/pollReviews.ts). */
export async function saveBriefDraft(
  programId: string,
  briefTypeId: string,
  text: string
): Promise<SaveBriefDraftResult> {
  const briefType = await prisma.briefType.findUniqueOrThrow({ where: { id: briefTypeId } });
  const existing = await prisma.programBrief.findFirst({
    where: { programId, briefTypeId, status: { not: "ARCHIVED" } },
  });

  const insufficient = isInsufficientPaste(text);
  const data = insufficient
    ? {
        text: "",
        insufficient: true,
        insufficientAt: new Date(),
        promptVersionUsed: briefType.promptVersion,
      }
    : {
        text,
        insufficient: false,
        insufficientAt: null,
        needsRegeneration: false,
        promptVersionUsed: briefType.promptVersion,
      };

  const brief = existing
    ? await prisma.programBrief.update({ where: { id: existing.id }, data })
    : await prisma.programBrief.create({
        data: { programId, briefTypeId, status: "DRAFT", ...data },
      });

  return { insufficient, brief };
}

/** Admin-only: the sole path a brief goes public. Refuses while insufficient or blank --
 * there's nothing to publish. Explicit, never automatic (see CLAUDE.md-style module
 * doc). Revalidates the program page (and, via revalidateProgram, llms.txt) so the
 * publish is visible immediately rather than on the next hourly tick. */
export async function publishBrief(id: string): Promise<ProgramBriefRow> {
  const brief = await prisma.programBrief.findUniqueOrThrow({ where: { id } });
  if (brief.insufficient || !brief.text.trim()) {
    throw new Error("This brief has no publishable text yet");
  }
  const updated = await prisma.programBrief.update({ where: { id }, data: { status: "PUBLISHED" } });
  await revalidateProgram(brief.programId);
  return updated;
}

/** Admin-only: retires a brief (frees its (programId, briefTypeId) slot for a fresh
 * draft) without deleting the row -- same retain-never-delete posture as
 * ReviewStatus/ProgramFaqStatus elsewhere. Revalidates in case an already-PUBLISHED
 * brief is being pulled from the public page. */
export async function archiveBrief(id: string): Promise<ProgramBriefRow> {
  const updated = await prisma.programBrief.update({ where: { id }, data: { status: "ARCHIVED" } });
  await revalidateProgram(updated.programId);
  return updated;
}
