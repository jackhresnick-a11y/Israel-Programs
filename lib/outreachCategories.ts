import type { DurationType, WebsiteLanguage } from "@/app/generated/prisma/enums";

/**
 * The eight admin-requested groupings for the outreach "no draft yet" list, plus an
 * honest catch-all so no program can silently vanish from the count. Deliberately a
 * plain string union (not the Prisma enum) -- see the outreachCategory column comment
 * in schema.prisma for why. Order here is DISPLAY order (matches what the admin asked
 * for); categorizeProgram's internal rule order is separate and documented there.
 */
export const CATEGORY_KEYS = [
  "english_yeshivot_seminaries",
  "english_gap_year",
  "summer_highschool",
  "adult_english",
  "israeli_yeshivot_midrashot",
  "israeli_mechinot",
  "mechinot_not_fully_israeli",
  "shorter_than_summer",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  english_yeshivot_seminaries: "English-speaking yeshivot & seminaries",
  english_gap_year: "English gap-year programs (not single-sex yeshivot/seminaries)",
  summer_highschool: "Summer programs for high schoolers",
  adult_english: "Adult programs in English (not yeshivot/seminaries)",
  israeli_yeshivot_midrashot: "Israeli yeshivot & midrashot",
  israeli_mechinot: "Israeli mechinot",
  mechinot_not_fully_israeli: "Mechinot (not completely Israeli)",
  shorter_than_summer: "Programs shorter than a summer",
  other: "Other",
};

export type CategorizableProgram = {
  name: string;
  durationType: DurationType;
  websiteLanguage: WebsiteLanguage | null;
  outreachCategory: string | null;
  tags: { slug: string; category: string | null }[];
};

const YESHIVA_SEMINARY_TAGS = new Set(["yeshiva", "yeshiva-gevoha", "hesder", "litvish"]);
const YESHIVA_SEMINARY_NAME_RE = /yeshiv|midrash|midreshet|seminary|bnos|machon/i;

function isEnglishSpeaking(language: WebsiteLanguage | null): boolean {
  return language === "ENGLISH" || language === "BOTH";
}

function hasTag(tags: { slug: string }[], slug: string): boolean {
  return tags.some((t) => t.slug === slug);
}

function isMechina(p: CategorizableProgram): boolean {
  return hasTag(p.tags, "mechina") || hasTag(p.tags, "pre-army");
}

function isYeshivaOrSeminary(p: CategorizableProgram): boolean {
  return p.tags.some((t) => YESHIVA_SEMINARY_TAGS.has(t.slug)) || YESHIVA_SEMINARY_NAME_RE.test(p.name);
}

function isSummerHighSchool(p: CategorizableProgram): boolean {
  return p.durationType === "SUMMER" && (hasTag(p.tags, "age-high-school") || hasTag(p.tags, "teen"));
}

function isShorterThanSummer(p: CategorizableProgram): boolean {
  return p.durationType === "TEN_DAY" || p.durationType === "SHORT";
}

function isGapYear(p: CategorizableProgram): boolean {
  return hasTag(p.tags, "age-gap-year") || p.durationType === "GAP_YEAR";
}

function isAdult(p: CategorizableProgram): boolean {
  return hasTag(p.tags, "age-college") || hasTag(p.tags, "age-post-college") || hasTag(p.tags, "adult-learners");
}

/**
 * Categorizes one program for the outreach "no draft yet" / drafts grouping. A manual
 * override (Program.outreachCategory, set via the per-row dropdown) always wins;
 * otherwise these rules run in a specific PRECEDENCE order (distinct from the display
 * order in CATEGORY_KEYS) so a program isn't swallowed by a broader bucket before a
 * more specific one gets a chance -- mechina/pre-army programs are checked first so
 * they never fall into the generic English-gap-year or Israeli-yeshiva buckets, and
 * yeshiva/seminary signal is checked before the generic gap-year/adult buckets for
 * the same reason. Every program lands somewhere: "other" is the deliberate catch-all,
 * not a bug -- category counts are expected to always sum to the input length.
 */
export function categorizeProgram(p: CategorizableProgram): CategoryKey {
  if (p.outreachCategory && (CATEGORY_KEYS as readonly string[]).includes(p.outreachCategory)) {
    return p.outreachCategory as CategoryKey;
  }

  const english = isEnglishSpeaking(p.websiteLanguage);

  if (isMechina(p)) {
    return english ? "mechinot_not_fully_israeli" : "israeli_mechinot";
  }
  if (isYeshivaOrSeminary(p)) {
    return english ? "english_yeshivot_seminaries" : "israeli_yeshivot_midrashot";
  }
  if (isSummerHighSchool(p)) {
    return "summer_highschool";
  }
  if (isShorterThanSummer(p)) {
    return "shorter_than_summer";
  }
  if (english && isGapYear(p)) {
    return "english_gap_year";
  }
  if (english && isAdult(p)) {
    return "adult_english";
  }
  // Fallback: Israeli-language programs that hit none of the above (no mechina/
  // yeshiva signal, not summer-highschool, not shorter-than-summer) are still
  // meaningfully "Israeli" -- but the admin didn't name a catch-all Israeli bucket
  // beyond yeshivot/mechinot, so this honestly falls to "other" rather than being
  // force-fit into israeli_yeshivot_midrashot without a real signal.
  return "other";
}

/** Groups a list of programs by category, in CATEGORY_KEYS display order. Every
 * program appears in exactly one group; group counts always sum to programs.length. */
export function groupByCategory<T extends CategorizableProgram>(programs: T[]): Record<CategoryKey, T[]> {
  const groups = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, [] as T[]])) as Record<CategoryKey, T[]>;
  for (const p of programs) {
    groups[categorizeProgram(p)].push(p);
  }
  return groups;
}
