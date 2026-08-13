/**
 * One-time write applying the program-type A1/A2/A3/C1/C2 bulk tag plan (see
 * find-v2-question-spec.md's Q6 taxonomy and CLAUDE.md's "program-type" section) --
 * connects each program to its derived program-type Tag per
 * data/program-type-bulk-tag-backup-2026-08-13.json's `programTypeWrite` plan.
 * Idempotent (Tag.connect on an already-connected row is a no-op) -- safe to re-run
 * if interrupted partway. Not a re-runnable general-purpose seed; a historical
 * record of the one write it made, same posture as prisma/retag-taxonomy.ts.
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-program-type-tags.ts
 */
import { prisma } from "../lib/prisma";
import { readFileSync } from "fs";

async function main() {
  const snapshot = JSON.parse(readFileSync("data/program-type-bulk-tag-backup-2026-08-13.json", "utf8"));
  const tags = await prisma.tag.findMany({ where: { category: "program-type" } });
  const tagIdBySlug = new Map(tags.map(t => [t.slug, t.id]));

  let applied = 0;
  for (const w of snapshot.programTypeWrite) {
    const tagId = tagIdBySlug.get(w.plannedProgramTypeTag);
    if (!tagId) throw new Error(`no tag id for slug ${w.plannedProgramTypeTag}`);
    await prisma.program.update({
      where: { id: w.id },
      data: { tags: { connect: { id: tagId } } },
    });
    applied++;
  }
  console.log("applied:", applied, "of", snapshot.programTypeWrite.length);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
