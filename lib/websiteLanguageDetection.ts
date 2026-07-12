import type { WebsiteLanguage } from "@/app/generated/prisma/enums";

/**
 * Shared website-language detection, used by prisma/classify-website-language.ts (the
 * one-time pass over programs that already have a contactEmail) and
 * prisma/harvest-contact-emails.ts (the email-less population). Detection is from
 * observed page content, never guessed from the URL/TLD alone:
 *   1. hreflang alternate links advertising both en and he -> BOTH.
 *   2. A same-page language-switcher link (/en/, /he/, ?lang=en, ?lang=he, or
 *      Hebrew/English link text like "עברית"/"English") alongside body text
 *      dominated by the *other* language -> BOTH.
 *   3. Otherwise: character-ratio of Hebrew-block vs Latin-letter characters in the
 *      extracted body text decides ENGLISH vs HEBREW, with <html lang> as the
 *      tiebreaker on genuinely-mixed pages.
 * A fetch failure, non-HTML response, or a ratio too close to call yields null
 * rather than a guess.
 */

export const FETCH_TIMEOUT_MS = 8000;
const HEBREW_RE = /[֐-׿]/g;
const LATIN_RE = /[A-Za-z]/g;
const USER_AGENT = "Mozilla/5.0 (compatible; IsraelProgramsWikiBot/1.0)";

/** Fetches HTML with a timeout, following redirects. Returns the body text and the
 * final URL after redirects (so callers can resolve relative links against it), or
 * null on any failure / non-HTML response. */
export async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function extractBodyText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
}

export function htmlLangAttr(html: string): "en" | "he" | null {
  const m = html.match(/<html[^>]*\slang=["']([a-zA-Z-]+)["']/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("he") || lang.startsWith("iw")) return "he";
  return null;
}

export function hreflangLangs(html: string): Set<string> {
  const langs = new Set<string>();
  const re = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([a-zA-Z-]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) langs.add(m[1].toLowerCase().slice(0, 2));
  return langs;
}

export function hasLanguageSwitcher(html: string): { toEn: boolean; toHe: boolean } {
  const toEn = /(href=["'][^"']*(\/en\/|\?lang=en|[?&]lang=en_))|>\s*English\s*</i.test(html);
  const toHe = /(href=["'][^"']*(\/he\/|\?lang=he|[?&]lang=he_))|>\s*עברית\s*</.test(html);
  return { toEn, toHe };
}

export function classify(html: string): { detected: WebsiteLanguage | null; evidence: string } {
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

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
