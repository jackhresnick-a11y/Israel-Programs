import slugify from "slugify";
import { prisma } from "@/lib/prisma";
import type { ProgramInput } from "@/lib/programs";
import { buildFieldDiffs, buildTagDiff } from "@/lib/diff";
import { getDurationLabelMap } from "@/lib/duration";

const TAG_ADDED_PREFIX = "tag:added:";
const TAG_REMOVED_PREFIX = "tag:removed:";

function proposedFieldValue(field: string, proposed: ProgramInput): string {
  const value = (proposed as unknown as Record<string, unknown>)[field];
  if (typeof value === "boolean") return value ? "true" : "false";
  return value == null ? "" : String(value);
}

/**
 * Seeds one ProgramEditFieldDecision row per changed field/tag, computed
 * from the same diff the old read-only EditDiffView used -- idempotent, so
 * opening the review screen twice never duplicates rows.
 */
export async function seedFieldDecisions(editId: string) {
  const existing = await prisma.programEditFieldDecision.count({ where: { editId } });
  if (existing > 0) return;

  const [edit, durationLabelMap] = await Promise.all([
    prisma.programEdit.findUniqueOrThrow({
      where: { id: editId },
      include: { program: { include: { tags: true } } },
    }),
    getDurationLabelMap(),
  ]);
  const proposed = JSON.parse(edit.payload) as ProgramInput;

  const fieldDiffs = buildFieldDiffs(edit.program, proposed, durationLabelMap);
  const tagDiff = buildTagDiff(edit.program.tags, proposed.tags);

  const rows: { fieldName: string; proposedValue: string }[] = fieldDiffs.map((diff) => ({
    fieldName: diff.field,
    proposedValue: proposedFieldValue(diff.field, proposed),
  }));

  if (tagDiff) {
    for (const name of tagDiff.added) rows.push({ fieldName: `${TAG_ADDED_PREFIX}${name}`, proposedValue: name });
    for (const name of tagDiff.removed) rows.push({ fieldName: `${TAG_REMOVED_PREFIX}${name}`, proposedValue: name });
  }

  if (rows.length === 0) return;

  await prisma.programEditFieldDecision.createMany({
    data: rows.map((r) => ({
      editId,
      fieldName: r.fieldName,
      proposedValue: r.proposedValue,
      finalValue: r.proposedValue,
      decision: "PENDING",
    })),
  });
}

export async function getEditForReview(editId: string) {
  await seedFieldDecisions(editId);
  return prisma.programEdit.findUniqueOrThrow({
    where: { id: editId },
    include: {
      program: { select: { id: true, name: true, slug: true } },
      fieldDecisions: { orderBy: { fieldName: "asc" } },
    },
  });
}

export type ReviewDecisionInput = {
  fieldName: string;
  decision: "ACCEPTED" | "REJECTED";
  finalValue: string;
};

const BOOLEAN_PROGRAM_FIELDS = new Set(["hasScholarship", "hasCollegeCredit"]);
const NULLABLE_ENUM_FIELDS = new Set(["travelType"]);

/**
 * Records the moderator's per-field decisions, applies only the ACCEPTED
 * ones (using each field's possibly-edited finalValue) to the Program, and
 * marks the ProgramEdit APPROVED. Fields the moderator rejected or never
 * touched are left completely untouched on the Program.
 */
export async function applyReviewDecisions(editId: string, decisions: ReviewDecisionInput[]) {
  const edit = await prisma.programEdit.findUniqueOrThrow({ where: { id: editId } });

  for (const d of decisions) {
    await prisma.programEditFieldDecision.update({
      where: { editId_fieldName: { editId, fieldName: d.fieldName } },
      data: { decision: d.decision, finalValue: d.finalValue },
    });
  }

  const accepted = decisions.filter((d) => d.decision === "ACCEPTED");
  const data: Record<string, unknown> = {};
  const tagsToConnectNames: string[] = [];
  const tagsToDisconnectNames: string[] = [];

  for (const d of accepted) {
    if (d.fieldName.startsWith(TAG_ADDED_PREFIX)) {
      tagsToConnectNames.push(d.fieldName.slice(TAG_ADDED_PREFIX.length));
    } else if (d.fieldName.startsWith(TAG_REMOVED_PREFIX)) {
      tagsToDisconnectNames.push(d.fieldName.slice(TAG_REMOVED_PREFIX.length));
    } else if (BOOLEAN_PROGRAM_FIELDS.has(d.fieldName)) {
      data[d.fieldName] = d.finalValue === "true";
    } else if (NULLABLE_ENUM_FIELDS.has(d.fieldName)) {
      data[d.fieldName] = d.finalValue === "" ? null : d.finalValue;
    } else {
      data[d.fieldName] = d.finalValue;
    }
  }

  const connectTags = await Promise.all(
    tagsToConnectNames.map(async (name) => {
      const slug = slugify(name, { lower: true, strict: true });
      const tag = await prisma.tag.upsert({ where: { slug }, update: {}, create: { name, slug } });
      return { id: tag.id };
    })
  );
  const disconnectTags = tagsToDisconnectNames.map((name) => ({
    slug: slugify(name, { lower: true, strict: true }),
  }));

  if (Object.keys(data).length > 0 || connectTags.length > 0 || disconnectTags.length > 0) {
    await prisma.program.update({
      where: { id: edit.programId },
      data: {
        ...data,
        ...(connectTags.length > 0 || disconnectTags.length > 0
          ? { tags: { connect: connectTags, disconnect: disconnectTags } }
          : {}),
      },
    });
  }

  await prisma.programEdit.update({
    where: { id: editId },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });
}
