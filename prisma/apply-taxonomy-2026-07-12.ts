import { prisma } from "@/lib/prisma";
import { resolveTagsByName } from "@/lib/tags";
import { DURATION_LABELS } from "@/lib/duration";
import { writeFileSync } from "fs";
import type { DurationType } from "@/app/generated/prisma/enums";

/**
 * WS2 Gate-1 apply: duration bucket reclassification, new theme tags, ulpan
 * normalization, legacy tag retirement. User explicitly declined the
 * overseas-program filter/tag promotion ("I don't want an overseas program hashtag,
 * the israeli track is fine") -- that piece is deliberately omitted below.
 * Approved 2026-07-12 (see conversation) -- no Neon branch cut (user approved
 * proceeding directly since ALTER TYPE ADD VALUE is additive-only; already applied
 * in the prior `prisma migrate dev` step).
 */

// --- 1. Duration reclassification (full slug -> bucket mapping from the Gate-1 table) ---
const RECLASSIFY: Record<string, DurationType> = {
  // MULTI_YEAR (43)
  "hesder-yeshiva-akko": "MULTI_YEAR",
  "yeshivat-ashkelon-orot-hatorah-vehachesed": "MULTI_YEAR",
  "yeshivat-ayelet-hashachar-eilat": "MULTI_YEAR",
  "yeshivat-birkat-yosef-alon-moreh": "MULTI_YEAR",
  "yeshivat-chiburim-afula": "MULTI_YEAR",
  "yeshivat-chiburim-beit-shean": "MULTI_YEAR",
  "yeshivat-cholon": "MULTI_YEAR",
  "yeshivat-derech-chaim-kiryat-gat": "MULTI_YEAR",
  "yeshivat-givat-olga-hadera": "MULTI_YEAR",
  "yeshivat-habikah-sdemot-neriah": "MULTI_YEAR",
  "yeshivat-hagolan": "MULTI_YEAR",
  "yeshivat-hahesder-dimona": "MULTI_YEAR",
  "yeshivat-hahesder-ramat-hasharon": "MULTI_YEAR",
  "yeshivat-hahesder-ramla": "MULTI_YEAR",
  "yeshivat-hahesder-rishon-lezion": "MULTI_YEAR",
  "yeshivat-hameiri-kiryat-moshe": "MULTI_YEAR",
  "yeshivat-haseder-gavoha-kiryat-gat": "MULTI_YEAR",
  "yeshivat-haseder-nof-hagalil": "MULTI_YEAR",
  "yeshivat-hesder-maalot-yaakov": "MULTI_YEAR",
  "yeshivat-hesder-orot-yaakov-rehovot": "MULTI_YEAR",
  "yeshivat-karnei-shomron": "MULTI_YEAR",
  "yeshivat-kiryat-shmona": "MULTI_YEAR",
  "yeshivat-midbara-keeden-mitzpe-ramon": "MULTI_YEAR",
  "yeshivat-nachalat-yosef-shavei-shomron": "MULTI_YEAR",
  "yeshivat-or-akiva": "MULTI_YEAR",
  "yeshivat-or-veyeshua-haifa": "MULTI_YEAR",
  "yeshivat-orot-moshe-rosh-haayin": "MULTI_YEAR",
  "yeshivat-orot-shaul-tel-aviv": "MULTI_YEAR",
  "yeshivat-ramat-gan": "MULTI_YEAR",
  "yeshivat-sderot": "MULTI_YEAR",
  "yeshivat-sdot-negev-kfar-maimon": "MULTI_YEAR",
  "yeshivat-tfachot": "MULTI_YEAR",
  "yeshivat-ahavat-israel-netivot": "MULTI_YEAR",
  "beit-midrash-reuta-carmel": "MULTI_YEAR",
  "medical-school-for-international-health-msih": "MULTI_YEAR",
  "buchmann-mehta-school-of-music-international-program": "MULTI_YEAR",
  "emunah-college-faculty-of-arts-and-design": "MULTI_YEAR",
  "technion-american-medical-school-teams": "MULTI_YEAR",
  "tel-aviv-university-mfa-in-documentary-cinema": "MULTI_YEAR",
  "tel-aviv-university-ny-stateamerican-program-sackler-gray-faculty-of-medicine": "MULTI_YEAR",
  "university-of-haifa-international-msc-in-marine-biology": "MULTI_YEAR",
  "bnei-david-eli": "MULTI_YEAR",

  // ONGOING (35)
  "sar-el-volunteers-for-israel": "ONGOING",
  "leket-israel-volunteer-program": "ONGOING",
  "mda-overseas-volunteers-program": "ONGOING",
  "hadassah-medical-center-volunteer-program": "ONGOING",
  "apf-medical-and-nursing-volunteer-program": "ONGOING",
  "save-a-childs-heart-volunteer-program": "ONGOING",
  "vois-volunteer-in-israel": "ONGOING",
  "sherut-leumi-national-service-via-nefesh-bnefesh": "ONGOING",
  "project-ten-kibbutz-harduf": "ONGOING",
  "tikkun-olam-tel-aviv-jaffa": "ONGOING",
  "arevim-masa-year-of-service": "ONGOING",
  "mir-yeshiva-yeshivas-mir-yerushalayim": "ONGOING",
  "ponevezh-yeshiva": "ONGOING",
  "yeshivas-brisk": "ONGOING",
  "yeshivat-kol-torah": "ONGOING",
  "yeshivat-merkaz-harav": "ONGOING",
  "chevron-yeshiva-knesset-yisrael": "ONGOING",
  "yeshiva-gevoha-itamar": "ONGOING",
  "yeshivas-bircas-hatorah": "ONGOING",
  "yeshivat-har-bracha": "ONGOING",
  "yeshivat-netzer-matai-ariel": "ONGOING",
  "yeshivat-or-etzion": "ONGOING",
  "yeshivat-shilo": "ONGOING",
  "yeshivat-shirat-moshe-meirim-beyafo": "ONGOING",
  "yeshivat-tekoa": "ONGOING",
  "beit-orot-jerusalem": "ONGOING",
  "eyaht-aish-hatorah-college-for-women": "ONGOING",
  "shapells-yeshiva-darche-noam": "ONGOING",
  "conservative-yeshiva": "ONGOING",
  "kol-ami-mechina": "ONGOING",
  "pardes-institute-of-jewish-studies-yearsemester-program": "ONGOING",
  "aish-hatorah-foundations-program": "ONGOING",
  isralight: "ONGOING",
  "jerusalem-college-of-technology-international-english-speakers-program": "ONGOING",
  "kibbutz-program-center-kpc": "ONGOING",
  "tikvah-israel-fellowship": "ONGOING",

  // SEMESTER (12)
  "eco-israel-program": "SEMESTER",
  "ginsburg-ingerman-overseas-student-program-osp": "SEMESTER",
  "israel-government-fellows-igf": "SEMESTER",
  "israel-lacrosse-gap-year-program": "SEMESTER",
  "kibbutz-ulpan": "SEMESTER",
  "rothberg-international-school": "SEMESTER",
  "sapir-international": "SEMESTER",
  "tau-international-study-abroad-semesteryear": "SEMESTER",
  "technion-international-semesteryear-abroad": "SEMESTER",
  "ulpan-etzion": "SEMESTER",
  "university-of-haifa-international-school-semesteryear-abroad": "SEMESTER",
  "vertigo-international-dance-program-vidp": "SEMESTER",
  // Classifier false-positive: "four-year" in its description refers to a *separate*
  // track at the same school, not the Lab program itself. No explicit duration stated
  // for the Lab; SEMESTER is a tentative placeholder pending confirmation (see report).
  "sam-spiegel-jerusalem-international-film-lab": "SEMESTER",

  // SHORT (9)
  "aish-hatorah-essentials-program": "SHORT",
  "camera-fellows-student-leadership-and-advocacy-mission-to-israel": "SHORT",
  "hasbara-fellowships-israel-training-program": "SHORT",
  "kibbutz-lotan-green-apprenticeship": "SHORT",
  "musrara-international-residency-program": "SHORT",
  "neve-yerushalayim-mechina-introductory-program": "SHORT",
  "ulpan-or-sabra-immersion-program": "SHORT",
  "jewel-for-women": "SHORT",
  "en-gedi-oasis-archaeological-project": "SHORT",

  // GAP_YEAR (2, moving off CUSTOM only)
  "eli-gap-year-program": "GAP_YEAR",
  ohrsom: "GAP_YEAR",
};

// --- 2. New theme tags ---
const ALIYAH_PROGRAMS = [
  "garin-tzabar",
  "machon-meir",
  "midreshet-harova",
  "ono-academic-college-international-school",
  "habonim-dror-australia-shnat",
  "habonim-dror-uk-shnat",
  "habonim-dror-southern-africa-shnat",
];
const LONE_SOLDIER_PROGRAMS = ["garin-tzabar", "sherut-leumi-national-service-via-nefesh-bnefesh"];
const BIRTHRIGHT_PROGRAMS = [
  "birthright-israel",
  "birthright-israel-excel-fellowship",
  "israel-free-spirit",
  "apf-medical-and-nursing-volunteer-program",
];
const ULPAN_ADDITIONS = [
  "machon-alte-seminary-chaya-mushka",
  "israel-xp-bar-ilan-university-overseas-student-program",
  "otzma",
  "kibbutz-program-center-kpc",
  "israel-government-fellows-igf",
  "rothberg-international-school",
  "tau-international-study-abroad-semesteryear",
  "rimon-school-of-music-study-abroad-program",
  "habonim-dror-uk-shnat",
];
const LEGACY_DURATION_TAGS = ["10-day", "summer", "semester"];

async function main() {
  // --- Snapshot before any writes ---
  const beforePrograms = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, slug: true, durationType: true, tags: { select: { slug: true } } },
  });
  const beforeDurationOptions = await prisma.durationOption.findMany();
  const legacyTagsBefore = await prisma.tag.findMany({ where: { slug: { in: LEGACY_DURATION_TAGS } } });

  writeFileSync(
    "/home/jack/israel-programs/data/snapshots/taxonomy-2026-07-12.json",
    JSON.stringify({ beforePrograms, beforeDurationOptions, legacyTagsBefore }, null, 2)
  );
  console.log("Snapshot written for", beforePrograms.length, "programs.");

  // --- Seed the 3 new DurationOption rows + hide CUSTOM from the filter ---
  const maxOrder = await prisma.durationOption.aggregate({ _max: { order: true } });
  let nextOrder = (maxOrder._max.order ?? 0) + 1;
  for (const value of ["SHORT", "MULTI_YEAR", "ONGOING"] as DurationType[]) {
    await prisma.durationOption.upsert({
      where: { value },
      update: { label: DURATION_LABELS[value] },
      create: { value, label: DURATION_LABELS[value], order: nextOrder++, showInFilter: true },
    });
  }
  await prisma.durationOption.update({ where: { value: "CUSTOM" }, data: { showInFilter: false } });
  console.log("Seeded SHORT/MULTI_YEAR/ONGOING DurationOption rows; hid CUSTOM from filter.");

  // --- Reclassify CUSTOM programs ---
  let reclassified = 0;
  for (const [slug, durationType] of Object.entries(RECLASSIFY)) {
    const res = await prisma.program.updateMany({ where: { slug }, data: { durationType } });
    reclassified += res.count;
  }
  console.log(`Reclassified: expected ${Object.keys(RECLASSIFY).length}, actual ${reclassified}`);

  const remainingCustom = await prisma.program.count({ where: { durationType: "CUSTOM" } });
  console.log("Remaining CUSTOM programs (expect 0):", remainingCustom);

  // --- New theme tags ---
  async function applyTag(tagName: string, slugs: string[]) {
    const [tagRef] = await resolveTagsByName([tagName]);
    let count = 0;
    for (const slug of slugs) {
      const program = await prisma.program.findUnique({ where: { slug }, select: { id: true } });
      if (!program) {
        console.log(`  [skip] ${slug} not found for tag "${tagName}"`);
        continue;
      }
      await prisma.program.update({
        where: { id: program.id },
        data: { tags: { connect: { id: tagRef.id } } },
      });
      count++;
    }
    console.log(`Tag "${tagName}": applied to ${count}/${slugs.length} programs.`);
  }

  await applyTag("aliyah", ALIYAH_PROGRAMS);
  await applyTag("lone-soldier", LONE_SOLDIER_PROGRAMS);
  await applyTag("birthright", BIRTHRIGHT_PROGRAMS);
  await applyTag("ulpan", ULPAN_ADDITIONS);

  // Legacy duration tags (10-day/summer/semester) deliberately left in place --
  // user opted to keep them rather than delete.

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
