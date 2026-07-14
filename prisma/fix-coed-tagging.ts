import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// One-off fix for the co-ed misclassification audit (2026-07-14). These two programs
// are Nefesh B'Nefesh service/administrative entries with no participant cohort at all
// (aliyah advising, national-service placement) -- "co-ed" doesn't apply, so the tag is
// removed with no replacement gender tag. Snapshot of prior state:
// data/snapshot-coed-removal-2026-07-14.json. See CLAUDE.md's Task 2 audit for the full
// reasoning on why the other ~160 coed-tagged programs were left unchanged.
const SLUGS_TO_DECOED = [
  "nefesh-bnefesh",
  "sherut-leumi-national-service-via-nefesh-bnefesh",
];

async function main() {
  const coedTag = await prisma.tag.findUniqueOrThrow({ where: { slug: "coed" } });

  const programs = await prisma.program.findMany({
    where: { slug: { in: SLUGS_TO_DECOED } },
    select: { id: true, slug: true, name: true, tags: { select: { slug: true } } },
  });

  if (programs.length !== SLUGS_TO_DECOED.length) {
    throw new Error(
      `Expected ${SLUGS_TO_DECOED.length} programs, found ${programs.length} -- aborting.`
    );
  }

  let updated = 0;
  for (const p of programs) {
    if (!p.tags.some((t) => t.slug === "coed")) {
      console.log(`  [skip] ${p.name} has no coed tag (already fixed?)`);
      continue;
    }
    await prisma.program.update({
      where: { id: p.id },
      data: { tags: { disconnect: [{ id: coedTag.id }] } },
    });
    console.log(`  [fixed] ${p.name} (${p.slug}): removed coed tag`);
    updated++;
  }

  console.log(`\nExpected ${SLUGS_TO_DECOED.length} rows touched, actually updated ${updated}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
