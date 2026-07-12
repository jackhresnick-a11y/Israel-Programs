import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";
import type { WebsiteLanguage } from "@/app/generated/prisma/enums";

/**
 * One-time classification pass: detects each program's contactWebsite (falling back
 * to signupUrl) as ENGLISH / HEBREW / BOTH, for the admin bulk-email tool's
 * per-language sections. Report mode (default) writes a JSON file for human review;
 * --apply writes Program.websiteLanguage after snapshotting prior values.
 *
 * Detection is from observed page content, not guessed from the URL/TLD alone:
 *   1. <html lang="..."> attribute, if present and unambiguous (en* / he*).
 *   2. hreflang alternate links advertising both en and he -> BOTH.
 *   3. A same-page language-switcher link (/en/, /he/, ?lang=en, ?lang=he, or
 *      Hebrew/English link text like "עברית"/"English") alongside body text
 *      dominated by the *other* language -> BOTH.
 *   4. Otherwise: character-ratio of Hebrew-block vs Latin-letter characters in the
 *      extracted body text decides ENGLISH vs HEBREW (with a floor so a handful of
 *      stray Hebrew words in mostly-English body text doesn't misfire, and vice versa).
 * A fetch failure, non-HTML response, or a ratio too close to call leaves the row
 * unclassified (null) rather than guessing.
 */

const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;
const HEBREW_RE = /[֐-׿]/g;
const LATIN_RE = /[A-Za-z]/g;

type Row = { id: string; slug: string; name: string; contactWebsite: string | null; signupUrl: string | null };
type Result = {
  slug: string;
  name: string;
  url: string | null;
  detected: WebsiteLanguage | null;
  evidence: string;
};

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IsraelProgramsWikiBot/1.0)" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractBodyText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
}

function htmlLangAttr(html: string): "en" | "he" | null {
  const m = html.match(/<html[^>]*\slang=["']([a-zA-Z-]+)["']/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("he") || lang.startsWith("iw")) return "he";
  return null;
}

function hreflangLangs(html: string): Set<string> {
  const langs = new Set<string>();
  const re = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([a-zA-Z-]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) langs.add(m[1].toLowerCase().slice(0, 2));
  return langs;
}

function hasLanguageSwitcher(html: string): { toEn: boolean; toHe: boolean } {
  const toEn = /(href=["'][^"']*(\/en\/|\?lang=en|[?&]lang=en_))|>\s*English\s*</i.test(html);
  const toHe = /(href=["'][^"']*(\/he\/|\?lang=he|[?&]lang=he_))|>\s*עברית\s*</.test(html);
  return { toEn, toHe };
}

function classify(html: string): { detected: WebsiteLanguage | null; evidence: string } {
  const hreflang = hreflangLangs(html);
  if (hreflang.has("en") && hreflang.has("he")) {
    return { detected: "BOTH", evidence: "hreflang alternates advertise both en and he" };
  }

  const text = extractBodyText(html);
  const hebrewCount = (text.match(HEBREW_RE) ?? []).length;
  const latinCount = (text.match(LATIN_RE) ?? []).length;
  const total = hebrewCount + latinCount;
  if (total < 40) {
    return { detected: null, evidence: `too little text to classify (${total} chars)` };
  }
  const hebrewRatio = hebrewCount / total;

  const switcher = hasLanguageSwitcher(html);
  const langAttr = htmlLangAttr(html);

  // Dominant-language body text plus a same-page switcher to the other language -> BOTH.
  if (hebrewRatio > 0.6 && switcher.toEn) {
    return { detected: "BOTH", evidence: `Hebrew-dominant body (${(hebrewRatio * 100).toFixed(0)}%) + English switcher link` };
  }
  if (hebrewRatio < 0.15 && switcher.toHe) {
    return { detected: "BOTH", evidence: `English-dominant body (${((1 - hebrewRatio) * 100).toFixed(0)}%) + Hebrew switcher link` };
  }

  if (hebrewRatio >= 0.35 && hebrewRatio <= 0.65) {
    // Genuinely mixed body text with no clear switcher signal either way -- ambiguous,
    // don't force ENGLISH/HEBREW; lang attr can still resolve it if unambiguous.
    if (langAttr === "en") return { detected: "ENGLISH", evidence: `mixed body text (${(hebrewRatio * 100).toFixed(0)}% Hebrew) but <html lang="en">` };
    if (langAttr === "he") return { detected: "HEBREW", evidence: `mixed body text (${(hebrewRatio * 100).toFixed(0)}% Hebrew) but <html lang="he">` };
    return { detected: null, evidence: `ambiguous mixed body text (${(hebrewRatio * 100).toFixed(0)}% Hebrew), no lang attr to break the tie` };
  }

  if (hebrewRatio > 0.5) {
    return { detected: "HEBREW", evidence: `body text ${(hebrewRatio * 100).toFixed(0)}% Hebrew characters` };
  }
  return { detected: "ENGLISH", evidence: `body text ${((1 - hebrewRatio) * 100).toFixed(0)}% Latin characters` };
}

async function classifyRow(row: Row): Promise<Result> {
  const url = row.contactWebsite || row.signupUrl;
  if (!url) return { slug: row.slug, name: row.name, url: null, detected: null, evidence: "no website/signupUrl on file" };

  const html = await fetchHtml(url);
  if (!html) return { slug: row.slug, name: row.name, url, detected: null, evidence: "fetch failed or non-HTML response" };

  const { detected, evidence } = classify(html);
  return { slug: row.slug, name: row.name, url, detected, evidence };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.program.findMany({
    where: { status: "PUBLISHED", contactEmail: { not: null } },
    select: { id: true, slug: true, name: true, contactWebsite: true, signupUrl: true },
    orderBy: { name: "asc" },
  });
  console.log(`Classifying ${rows.length} programs with a contactEmail...`);

  const results = await mapWithConcurrency(rows, CONCURRENCY, classifyRow);

  const counts: Record<string, number> = {};
  for (const r of results) {
    const key = r.detected ?? "UNCLASSIFIED";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  console.log("Detected distribution:", JSON.stringify(counts));

  writeFileSync(
    "/home/jack/israel-programs/data/website-language-report-2026-07-12.json",
    JSON.stringify(results, null, 2)
  );
  console.log("Report written to data/website-language-report-2026-07-12.json");

  if (!apply) {
    console.log("\nReport mode only (no writes). Re-run with --apply to write Program.websiteLanguage.");
    await prisma.$disconnect();
    return;
  }

  const before = await prisma.program.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, slug: true, websiteLanguage: true },
  });
  writeFileSync(
    "/home/jack/israel-programs/data/snapshots/website-language-2026-07-12.json",
    JSON.stringify(before, null, 2)
  );
  console.log(`Snapshot written for ${before.length} rows.`);

  let updated = 0;
  for (const r of results) {
    if (!r.detected) continue;
    const row = rows.find((x) => x.slug === r.slug);
    if (!row) continue;
    await prisma.program.update({ where: { id: row.id }, data: { websiteLanguage: r.detected } });
    updated++;
  }
  console.log(`Expected classified: ${results.filter((r) => r.detected).length}, actual updates: ${updated}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
