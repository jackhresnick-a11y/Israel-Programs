/**
 * Read-only guard for the /match gender hard-eliminator (see
 * prisma/strict-gender-eliminator.ts for the fix this checks). The fix lives entirely
 * in data -- FlowOption.requireIncludesUntagged, editable by any admin via the
 * "Include untagged programs" checkbox in /admin/flow/questions
 * (components/admin/FlowQuestionsManager.tsx) -- so a re-tick would silently reopen
 * the exact leak this fix closed, with nothing in the unit test suite able to catch it
 * (lib/flowRank.test.ts only tests the pure functions against fixtures, never live
 * config). Run this against the real DB whenever you want to confirm the live
 * configuration still matches intent.
 *
 * Data-driven, not hardcoded to a key: same selection as the fix script -- every
 * ACTIVE REQUIRE FlowOption whose tagSlugs resolve to a Tag with category "gender".
 * Exits non-zero (and prints which option regressed) if any of them has
 * requireIncludesUntagged !== false.
 *
 * Usage (loads DATABASE_URL from .env / .env.local first):
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/verify-gender-eliminator.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const genderTags = await prisma.tag.findMany({ where: { category: "gender" }, select: { slug: true } });
  const genderTagSlugs = new Set(genderTags.map((t) => t.slug));

  const requireOptions = await prisma.flowOption.findMany({
    where: { matchMode: "REQUIRE", status: "ACTIVE" },
    select: {
      label: true,
      key: true,
      tagSlugs: true,
      requireIncludesUntagged: true,
      question: { select: { key: true } },
    },
  });

  const genderOptions = requireOptions.filter((o) => o.tagSlugs.some((slug) => genderTagSlugs.has(slug)));

  if (genderOptions.length === 0) {
    console.error("No ACTIVE REQUIRE gender FlowOption found at all -- expected 2 (Boys only, Girls only).");
    process.exit(1);
  }

  const regressed = genderOptions.filter((o) => o.requireIncludesUntagged !== false);

  console.log(`Checked ${genderOptions.length} gender REQUIRE option(s):`);
  for (const o of genderOptions) {
    const ok = o.requireIncludesUntagged === false;
    console.log(`  [${ok ? "OK" : "REGRESSED"}] [${o.question.key}] "${o.label}" requireIncludesUntagged=${o.requireIncludesUntagged}`);
  }

  if (regressed.length > 0) {
    console.error(
      `\n${regressed.length} gender REQUIRE option(s) admit untagged programs again -- this reopens the "girls-only returns boys-only" bug. Re-run prisma/strict-gender-eliminator.ts --commit.`
    );
    process.exit(1);
  }

  console.log("\nAll gender REQUIRE options are strict. OK.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
