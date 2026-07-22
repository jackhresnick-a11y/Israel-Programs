import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveReferenceVisibility, type ReferenceConfigLike } from "@/lib/referenceVisibility";

export type ReferenceConfigDTO = ReferenceConfigLike;

const DEFAULT_REFERENCE_CONFIG: ReferenceConfigDTO = {
  visibility: "AUTO",
  unlockedAt: null,
  minToShow: 1,
};

/** A missing row reads as these schema defaults rather than throwing -- a program
 * with no ReferenceConfig row yet (the common case; a row is only created the first
 * time an admin overrides it or a program's count first unlocks the list) degrades
 * gracefully instead of 500ing the program page. */
export async function getReferenceConfig(programId: string): Promise<ReferenceConfigDTO> {
  const row = await prisma.referenceConfig.findUnique({ where: { programId } });
  if (!row) return DEFAULT_REFERENCE_CONFIG;
  return { visibility: row.visibility, unlockedAt: row.unlockedAt, minToShow: row.minToShow };
}

/** Whether the program's public reference list should currently show, plus the
 * approved count it was computed from -- the one call a page needs. Never renders
 * an empty list: even FORCE_SHOW/sticky-unlocked collapses to false when there's
 * nothing approved to display. */
export async function getReferenceListVisibility(programId: string): Promise<{ show: boolean; approvedCount: number }> {
  const [approvedCount, config] = await Promise.all([
    prisma.reference.count({ where: { programId, status: "PUBLISHED" } }),
    getReferenceConfig(programId),
  ]);
  const show = resolveReferenceVisibility(approvedCount, config) && approvedCount > 0;
  return { show, approvedCount };
}

export const referenceConfigPatchSchema = z.object({
  visibility: z.enum(["AUTO", "FORCE_SHOW", "FORCE_HIDE"]).optional(),
  minToShow: z.coerce.number().int().min(1).optional(),
});

export async function upsertReferenceConfig(programId: string, patch: z.infer<typeof referenceConfigPatchSchema>) {
  return prisma.referenceConfig.upsert({
    where: { programId },
    create: { programId, ...patch },
    update: patch,
  });
}

export type ProgramWithReferenceConfig = {
  id: string;
  name: string;
  slug: string;
  approvedCount: number;
  config: ReferenceConfigDTO;
};

/** Every program carrying at least one Reference row (any status), with its live
 * approved count and config (or defaults) -- feeds the admin visibility-override
 * control. Scoped to programs that actually have references, rather than every
 * program, since the override is meaningless for a program with none. */
export async function listProgramsWithReferenceConfig(): Promise<ProgramWithReferenceConfig[]> {
  const programs = await prisma.program.findMany({
    where: { references: { some: {} } },
    select: {
      id: true,
      name: true,
      slug: true,
      referenceConfig: true,
      _count: { select: { references: { where: { status: "PUBLISHED" } } } },
    },
    orderBy: { name: "asc" },
  });

  return programs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    approvedCount: p._count.references,
    config: p.referenceConfig
      ? { visibility: p.referenceConfig.visibility, unlockedAt: p.referenceConfig.unlockedAt, minToShow: p.referenceConfig.minToShow }
      : DEFAULT_REFERENCE_CONFIG,
  }));
}
