/**
 * The program page's lead definition sentence, e.g.:
 * Otzem Overseas Program (Atzmona) is a religious-Zionist mechina in Chalutza, southern
 * Israel, for gap-year students, men only.
 *
 * Pure template over Program.name/location and the program's Tag slugs -- no Prisma
 * import, same client-safe split as lib/pollBestFor.ts. There is no dedicated
 * programType/gender/ageStage/affiliation column on Program; those are Tag rows grouped
 * by Tag.category. Rendering Tag.name verbatim was rejected: the stored names carry
 * inconsistent casing and typos ("Flexible religously", "Southern israel", "jerusalem")
 * that are fine as filter-bar chips but unacceptable in the one sentence whose entire job
 * is machine extraction. So every clause here comes from a fixed slug -> phrase lookup
 * (same posture as lib/facets.ts's TRAVEL_TYPE_LABELS and lib/regions.ts's
 * REGION_LABELS) -- deterministic, no per-program authored text, no model output. A slug
 * with no entry in its map simply doesn't contribute a clause.
 */

export type ProgramDefinitionTag = { slug: string; category: string | null };

export type ProgramDefinitionInput = {
  name: string;
  location: string | null;
  tags: ProgramDefinitionTag[];
};

const GENDER_PHRASES: Record<string, string> = {
  "boys-only": "men only",
  "girls-only": "women only",
  coed: "open to men and women",
};

const AGE_PHRASES: Record<string, string> = {
  "age-gap-year": "gap-year students",
  "age-high-school": "high-school students",
  "age-college": "college-age students",
  "age-post-college": "post-college participants",
};

const AFFILIATION_PHRASES: Record<string, string> = {
  "rz-modern-orthodox": "religious-Zionist",
  "harediultra-orthodoxyeshivish": "Haredi",
  "non-affiliated-religously": "non-denominational",
  "flexible-religously": "religiously flexible",
  "mixed-religously": "religiously mixed",
};

/** Program-type noun, drawn from the small set of uncategorized tags that actually name
 * a type of program rather than a subject/activity. Falls back to the generic noun
 * "program" when none of these tags are present -- that fallback never counts toward the
 * two-clause floor below (see programDefinitionSentence), since "X is a program" carries
 * no information. */
const TYPE_PHRASES: Record<string, string> = {
  mechina: "mechina",
  yeshiva: "yeshiva",
  "yeshiva-gevoha": "yeshiva",
  hesder: "hesder yeshiva",
  ulpan: "ulpan",
  kibbutz: "kibbutz program",
  seminary: "seminary",
};

/** Fallback place phrase, used only when Program.location is null -- cleaned-up versions
 * of the location-category Tag names (see this file's module doc comment for why the raw
 * Tag.name isn't used directly). */
const LOCATION_TAG_PHRASES: Record<string, string> = {
  "northern-israel": "northern Israel",
  "coastal-israel": "coastal Israel",
  jerusalem: "Jerusalem",
  "ramat-hasharon": "Ramat Hasharon",
  samaria: "Samaria",
  "southern-israel": "southern Israel",
};

function firstPhrase(tags: ProgramDefinitionTag[], phrases: Record<string, string>): string | null {
  const slugs = new Set(tags.map((t) => t.slug));
  for (const slug of Object.keys(phrases)) {
    if (slugs.has(slug)) return phrases[slug];
  }
  return null;
}

/** Program.location, with any parenthetical aside stripped (e.g. "Chalutza (Border of
 * Egypt and Gaza), southern Israel" -> "Chalutza, southern Israel") -- deterministic
 * regex, not a rewrite of the field. Falls back to a location-category tag phrase when
 * location is null/empty; omits the clause when neither is available. */
function locationClause(program: ProgramDefinitionInput): string | null {
  if (program.location) {
    const stripped = program.location.replace(/\s*\([^)]*\)/g, "").trim();
    if (stripped) return stripped;
  }
  return firstPhrase(program.tags, LOCATION_TAG_PHRASES);
}

/**
 * Renders nothing unless at least two of {affiliation, place, age, gender} resolve --
 * "X is a program." is noise, not a definition. The type noun (mechina/yeshiva/etc, or
 * the generic "program" fallback) always renders but never counts toward that floor.
 */
export function programDefinitionSentence(program: ProgramDefinitionInput): string | null {
  const affiliation = firstPhrase(program.tags, AFFILIATION_PHRASES);
  const type = firstPhrase(program.tags, TYPE_PHRASES) ?? "program";
  const place = locationClause(program);
  const age = firstPhrase(program.tags, AGE_PHRASES);
  const gender = firstPhrase(program.tags, GENDER_PHRASES);

  const resolvedClauses = [affiliation, place, age, gender].filter((c): c is string => c !== null);
  if (resolvedClauses.length < 2) return null;

  let sentence = `${program.name} is a${affiliation ? ` ${affiliation}` : ""} ${type}`;
  if (place) sentence += ` in ${place}`;

  const tail: string[] = [];
  if (age) tail.push(`for ${age}`);
  if (gender) tail.push(gender);
  if (tail.length > 0) sentence += `, ${tail.join(", ")}`;

  return `${sentence}.`;
}
