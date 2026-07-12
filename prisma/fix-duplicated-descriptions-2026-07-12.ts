import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";

/**
 * WS1 auto-fix: remove duplicated description text. Only jewel-for-women has a
 * confirmed doubled description per prisma/audit-2026-07-12.ts (ohrsom, named by
 * the user as a suspected duplicate, was verified NOT duplicated -- see report).
 */

const FIXES: Record<string, string> = {
  "jewel-for-women":
    "A short, inexpensive introduction to Judaism in Jerusalem for ages 19-31, with airfare, room, board, classes, and field trips included; taught in English with no Hebrew required.",
};

async function main() {
  const slugs = Object.keys(FIXES);
  const before = await prisma.program.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, description: true },
  });

  writeFileSync(
    "/home/jack/israel-programs/data/snapshots/duplicated-descriptions-2026-07-12.json",
    JSON.stringify(before, null, 2)
  );
  console.log("Snapshot written for", before.length, "row(s).");

  let updated = 0;
  for (const p of before) {
    const newDesc = FIXES[p.slug];
    if (!newDesc) continue;
    await prisma.program.update({ where: { id: p.id }, data: { description: newDesc } });
    updated++;
  }

  console.log(`Expected updates: ${slugs.length}, actual updates: ${updated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
