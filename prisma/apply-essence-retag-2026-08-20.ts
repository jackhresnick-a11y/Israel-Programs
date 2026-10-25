/**
 * Applies the approved essence-taxonomy retag (2026-08-20 conversation):
 *
 *   1. essence-pre-military: rename display name to "Army preparation". Slug
 *      unchanged -- relations follow the tag id, so all 96 programs move for free.
 *   2. Recategorize volunteering / hebrew-required into "essence", keeping their
 *      slugs (neither has any hardcoded slug dependency in app code -- see the
 *      read-only report this replays). Display names updated too.
 *   3. Merge pre-army into essence-pre-military via lib/tags.ts's mergeTags
 *      (repoints every pre-army program relation, skipping ones that already carry
 *      essence-pre-military, then deletes the pre-army tag row). 29 of pre-army's
 *      94 programs don't yet carry essence-pre-military and gain it; the other 65
 *      just lose pre-army.
 *   4. Create essence-academic-credit / essence-internship-work with zero program
 *      relations -- splitting essence-academic-internship's 74 programs onto these
 *      is a separate, not-yet-decided manual pass.
 *
 * essence-travel, essence-spiritual-growth, essence-academic-internship are
 * deliberately untouched.
 *
 * Two-phase, like the other prisma/apply-*.ts scripts in this repo -- --dry-run is
 * the default if neither flag is passed. A JSON backup of every row touched is
 * written before any mutation, every run (dry or commit).
 *
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-essence-retag-2026-08-20.ts --dry-run
 *   # review the printed plan + the backup file, then:
 *   set -a && source .env && source .env.local && set +a && npx tsx prisma/apply-essence-retag-2026-08-20.ts --commit
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { mergeTags } from "../lib/tags";

async function main() {
  const commit = process.argv.includes("--commit");

  const [essencePreMilitary, preArmy, volunteering, hebrewRequired, essenceTags] = await Promise.all([
    prisma.tag.findUniqueOrThrow({ where: { slug: "essence-pre-military" } }),
    prisma.tag.findUniqueOrThrow({ where: { slug: "pre-army" }, include: { programs: { select: { id: true, name: true, slug: true } } } }),
    prisma.tag.findUniqueOrThrow({ where: { slug: "volunteering" } }),
    prisma.tag.findUniqueOrThrow({ where: { slug: "hebrew-required" } }),
    prisma.tag.findMany({ where: { category: "essence" } }),
  ]);

  const preArmyProgramIds = new Set(preArmy.programs.map((p) => p.id));
  const alreadyHasEssenceTag = await prisma.program.findMany({
    where: { id: { in: [...preArmyProgramIds] }, tags: { some: { slug: "essence-pre-military" } } },
    select: { id: true },
  });
  const alreadyHasIds = new Set(alreadyHasEssenceTag.map((p) => p.id));
  const gainsEssenceTag = preArmy.programs.filter((p) => !alreadyHasIds.has(p.id));

  const maxOrder = essenceTags.reduce((m, t) => Math.max(m, t.order), 0);
  const newTagPlan = [
    { slug: "essence-academic-credit", name: "Academic credit", order: maxOrder + 1 },
    { slug: "essence-internship-work", name: "Internship / work", order: maxOrder + 2 },
  ];

  console.log("=== Plan ===");
  console.log(`1. essence-pre-military: name "${essencePreMilitary.name}" -> "Army preparation" (slug unchanged)`);
  console.log(`2. volunteering: category ${JSON.stringify(volunteering.category)} -> "essence", name "${volunteering.name}" -> "Volunteering"`);
  console.log(`   hebrew-required: category ${JSON.stringify(hebrewRequired.category)} -> "essence", name "${hebrewRequired.name}" -> "Hebrew proficiency required"`);
  console.log(
    `3. merge pre-army (${preArmy.programs.length} programs) into essence-pre-military: ${gainsEssenceTag.length} programs gain essence-pre-military, ${preArmy.programs.length - gainsEssenceTag.length} already had it. pre-army tag row deleted after.`
  );
  for (const t of newTagPlan) console.log(`4. create ${t.slug} ("${t.name}", category essence, order ${t.order})`);

  // --- Backup: written before any mutation, every run. ---
  const backupPath = `data/essence-retag-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        essencePreMilitaryBefore: essencePreMilitary,
        preArmyBefore: preArmy,
        volunteeringBefore: volunteering,
        hebrewRequiredBefore: hebrewRequired,
        preArmyProgramsGainingEssenceTag: gainsEssenceTag,
      },
      null,
      2
    )
  );
  console.log(`\nPre-change state written to ${backupPath}`);

  if (!commit) {
    console.log("\nDry run only -- no changes written. Re-run with --commit to apply.");
    return;
  }

  console.log("\nApplying...");

  await prisma.tag.update({ where: { id: essencePreMilitary.id }, data: { name: "Army preparation" } });
  await prisma.tag.update({ where: { id: volunteering.id }, data: { category: "essence", name: "Volunteering" } });
  await prisma.tag.update({ where: { id: hebrewRequired.id }, data: { category: "essence", name: "Hebrew proficiency required" } });

  await mergeTags(preArmy.id, essencePreMilitary.id);

  for (const t of newTagPlan) {
    await prisma.tag.create({ data: { slug: t.slug, name: t.name, category: "essence", order: t.order } });
  }

  console.log(
    `Done. Renamed essence-pre-military, recategorized volunteering + hebrew-required, merged pre-army (${gainsEssenceTag.length} programs gained essence-pre-military, pre-army tag deleted), created ${newTagPlan.length} new essence tags.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
