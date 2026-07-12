import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";

/**
 * WS1 auto-fix: strip cost/price/tuition/stipend/airfare-pricing language from
 * descriptions (per CLAUDE.md: never include pricing in a public description).
 * Two false positives from the regex sweep are deliberately left untouched:
 *   - camera-fellows-...: "a free weekend" means unscheduled time, not price.
 *   - tel-gezer-excavation: "instead of paid laborers" is historical site
 *     methodology, not participant pricing (its fee mention IS stripped below).
 * nativ-track-aardvark-israel also had a research-caveat sentence embedded in the
 * public description (violates the description/adminNote split) -- moved to
 * adminNote here rather than deleted, since the caveat itself is still valid content
 * for a moderator to see.
 */

const DESCRIPTION_FIXES: Record<string, string> = {
  "aish-hatorah-essentials-program":
    "A 28-day introductory-to-Judaism program in the Old City for ages 18-29, covering topics like practical spirituality and Genesis alongside science; a shorter track distinct from Aish HaTorah's longer Aish Gesher and Foundations programs.",
  "arava-institute-for-environmental-studies":
    "An accredited university-level semester (or full-year) environmental studies program bringing together Israeli, Palestinian, Jordanian, and international students to study topics like sustainable agriculture, cross-border water management, and environmental diplomacy.",
  "birthright-israel":
    "A 10-day trip to Israel for young Jewish adults ages 18-32, covering history, culture, food, and modern life across the country. Registration fills up fast, so early application is strongly recommended.",
  "conservative-yeshiva":
    "An egalitarian yeshiva offering one-year, pre-college, advanced-studies, summer and winter Torah-study tracks for adults of all backgrounds and denominations, blending traditional beit midrash learning with a Conservative/Masorti approach; the program includes Thursday day trips and a Shabbaton, and long-term study is Masa-eligible.",
  "eco-israel-program":
    "A 5-month permaculture and sustainable-living program for English-speaking young adults ages 18-24, centered on a Permaculture Design Course (internationally certified) and hands-on farm work. A Masa-affiliated long-term program.",
  "kibbutz-program-center-kpc":
    "The classic short-term kibbutz work-exchange program: volunteers aged 18-35 work about 8.5 hours a day, five days a week, in a kibbutz's agriculture, kitchen, garden, or factory branches, in exchange for shared accommodation, three daily meals, and laundry facilities, without the structured Hebrew-ulpan component of Kibbutz Ulpan.",
  "masa-israel-teaching-fellows-mitf":
    "A 6-10 month fellowship placing Jewish young adults as English-teaching assistants in Israeli public schools, paired with Hebrew study and professional development.",
  "nativ-track-aardvark-israel":
    "The Conservative/Masorti movement's gap-year program, run in partnership with Aardvark Israel: a full academic year split between Jerusalem and Tel Aviv, with intensive Hebrew ulpan, university-accredited coursework, internships/volunteering, and leadership training grounded in Conservative/Masorti values.",
  "new-israel-fund-shatil-social-justice-fellowship":
    "A 10-month fellowship for post-college young adults with strong Hebrew (Arabic a plus), interning 32 hours a week at an individually-selected Israeli NGO working on civil and human rights, environmental justice, Jewish-Arab equality, women's status, religious pluralism, or economic gaps, with monthly enrichment programming and leadership training.",
  otzma:
    "A 10-month fellowship for college graduates aged 20-26 combining Hebrew immersion, civil rights and community-building volunteer work, and hands-on social action, structured in three roughly 3-month sections: Hebrew ulpan at an absorption center, full-time community service in a development town, and a final stretch on a kibbutz, in the army, or in an internship, with housing, transportation, and food all arranged by program staff.",
  "tel-gezer-excavation":
    "An excavation at Tel Gezer, one of the first sites in Israel to use student volunteers instead of paid laborers and the first to offer a field school for students; academic credit varies by sponsoring university program.",
  "tel-megiddo-excavation":
    "A summer excavation exploring Middle Bronze city gates, an undiscovered Iron Age palace, and the archive of Late Bronze Age kings, with participants housed at Mishmar HaEmek guest facilities; housing, meals, and daily transportation are included, and 3-6 academic credits are available through Tel Aviv University.",
};

const ADMIN_NOTE_FIXES: Record<string, string> = {
  "nativ-track-aardvark-israel":
    "USCJ suspended its previous standalone Nativ program in December 2023 citing budget and recruitment challenges, and relaunched it via this new Aardvark partnership starting September 2026 -- since this is a brand-new relaunch, confirm current logistics, dates, and costs directly before publishing as final, as details may still be settling.",
};

// Deliberately left unchanged (false positives, see header comment):
const SKIPPED = [
  "camera-fellows-student-leadership-and-advocacy-mission-to-israel",
];

async function main() {
  const slugs = Object.keys(DESCRIPTION_FIXES);
  const before = await prisma.program.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, description: true, adminNote: true },
  });

  writeFileSync(
    "/home/jack/israel-programs/data/snapshots/cost-mentions-2026-07-12.json",
    JSON.stringify({ before, skipped: SKIPPED }, null, 2)
  );
  console.log("Snapshot written for", before.length, "row(s). Skipped (false positives):", SKIPPED);

  let updated = 0;
  for (const p of before) {
    const newDesc = DESCRIPTION_FIXES[p.slug];
    if (!newDesc) continue;
    await prisma.program.update({
      where: { id: p.id },
      data: {
        description: newDesc,
        ...(ADMIN_NOTE_FIXES[p.slug] ? { adminNote: ADMIN_NOTE_FIXES[p.slug] } : {}),
      },
    });
    updated++;
  }

  console.log(`Expected updates: ${slugs.length}, actual updates: ${updated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
