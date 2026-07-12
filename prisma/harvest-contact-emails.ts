import { prisma } from "@/lib/prisma";
import { readFileSync, writeFileSync } from "fs";
import type { WebsiteLanguage } from "@/app/generated/prisma/enums";
import { fetchHtml, classify, mapWithConcurrency } from "@/lib/websiteLanguageDetection";

/**
 * Harvests contact emails + website language for published programs that have NO
 * contactEmail yet but do have a URL (contactWebsite ?? signupUrl). Report mode
 * (default) writes a review file and makes no DB writes; --apply writes
 * contactEmail + contactEmailSource (observed-on-page only, never guessed) and
 * backfills websiteLanguage for rows that are still null.
 *
 * CLAUDE.md contract: an email is recorded ONLY if literally observed on an official
 * page (mailto: href, visible text, or a deterministically-decoded Cloudflare
 * data-cfemail), and its source page URL is always captured. contactEmailStatus /
 * contactEmailVerifiedAt are never touched -- a harvested email is unverified by
 * definition and routes straight into the verification queue.
 */

const CONCURRENCY = 6;
const MAX_CONTACT_PAGES = 3;

// mailto: and plain-text email patterns.
const MAILTO_RE = /mailto:([^"'?>\s]+)/gi;
const TEXT_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Cloudflare email-obfuscation: <a data-cfemail="hexhex...">
const CFEMAIL_RE = /data-cfemail=["']([0-9a-fA-F]+)["']/g;

// Junk / non-contact addresses to drop.
const JUNK_LOCALPARTS = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|webmaster@sentry)/i;
const JUNK_DOMAINS =
  /(sentry\.|wixpress\.com|example\.(com|org)|test\.|godaddy\.com|domain\.com|email\.com|yourdomain|sentry-next|wix\.com|squarespace\.com|cloudflare\.com|w3\.org|schema\.org|googleapis\.com|gstatic\.com)/i;
// Image/asset false positives like "logo@2x.png" that match the email regex.
const ASSET_TAIL_RE = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ttf)$/i;

// Contact/about link discovery (English + Hebrew).
const CONTACT_LINK_RE =
  /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const CONTACT_HINT_RE =
  /(contact|kesher|about|צור[\s-]?קשר|יצירת[\s-]?קשר|אודות|צרו[\s-]?קשר|create[\s-]?contact)/i;
const CONTACT_HREF_RE = /(contact|about|kesher|tzor|about-us|contactus|צור-קשר|אודות)/i;

function decodeCfEmail(hex: string): string | null {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    // Sanity: must look like an email after decode.
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

// Strict shape an address must match AFTER normalization to be a write candidate.
const STRICT_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Normalizes a raw extracted candidate: lowercases, strips surrounding punctuation /
 * escape artifacts (e.g. a trailing "\" captured from `mailto:x@y.com\"` in inline JS,
 * or leading/trailing dots/commas/quotes), and decodes stray HTML entities. Returns
 * null if the result isn't a strictly-valid address. */
function normalizeEmail(raw: string): string | null {
  let e = raw.trim().toLowerCase();
  e = e.replace(/&#0*64;/g, "@").replace(/&amp;/g, "&");
  // Strip anything from the first character that can't appear in an address onward
  // (backslash, quote, angle bracket, whitespace) -- guards the mailto trailing-escape case.
  e = e.replace(/[\\"'<>\s].*$/, "");
  // Trim leading/trailing punctuation the regex boundary can leave behind.
  e = e.replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "");
  return STRICT_EMAIL_RE.test(e) ? e : null;
}

function isJunkEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (JUNK_LOCALPARTS.test(lower)) return true;
  if (JUNK_DOMAINS.test(lower)) return true;
  if (ASSET_TAIL_RE.test(lower)) return true;
  // "u003e" / entity fragments, or absurdly long local parts from minified junk.
  if (lower.includes("u003") || lower.length > 80) return true;
  return false;
}

function extractEmails(html: string): string[] {
  const found = new Set<string>();

  function consider(raw: string) {
    let candidate = raw;
    try {
      candidate = decodeURIComponent(raw);
    } catch {
      /* keep raw if it isn't valid percent-encoding */
    }
    const email = normalizeEmail(candidate);
    if (email && !isJunkEmail(email)) found.add(email);
  }

  let m: RegExpExecArray | null;
  MAILTO_RE.lastIndex = 0;
  while ((m = MAILTO_RE.exec(html))) consider(m[1]);

  CFEMAIL_RE.lastIndex = 0;
  while ((m = CFEMAIL_RE.exec(html))) {
    const decoded = decodeCfEmail(m[1]);
    if (decoded) consider(decoded);
  }

  // Plain-text emails: scan the visible text only (strip tags first so we don't pick
  // up asset URLs / attribute noise as readily).
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  TEXT_EMAIL_RE.lastIndex = 0;
  while ((m = TEXT_EMAIL_RE.exec(text))) consider(m[0]);

  return [...found];
}

/** Discovers up to MAX_CONTACT_PAGES same-origin contact/about page URLs from a page's links. */
function discoverContactPages(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  CONTACT_LINK_RE.lastIndex = 0;
  while ((m = CONTACT_LINK_RE.exec(html))) {
    const href = m[1];
    const linkText = m[2].replace(/<[^>]+>/g, " ");
    if (!CONTACT_HINT_RE.test(linkText) && !CONTACT_HREF_RE.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.host !== base.host) continue; // same-origin only
    if (resolved.href === baseUrl) continue;
    if (!candidates.includes(resolved.href)) candidates.push(resolved.href);
    if (candidates.length >= MAX_CONTACT_PAGES) break;
  }
  return candidates;
}

/** Prefer generic role addresses (office@, info@, contact@) over person-named ones,
 * and prefer an address whose domain matches the site's domain. Ranking only orders
 * the review -- the human still decides. */
function rankEmails(emails: string[], siteHost: string): string[] {
  const roleRe = /^(office|info|contact|admin|mazkirut|mazkira|grafik|secretary|reception|hello|apply|admissions|registrar)@/i;
  const bareHost = siteHost.replace(/^www\./, "");
  return [...emails].sort((a, b) => {
    const aRole = roleRe.test(a) ? 0 : 1;
    const bRole = roleRe.test(b) ? 0 : 1;
    if (aRole !== bRole) return aRole - bRole;
    const aDomain = a.split("@")[1]?.includes(bareHost) ? 0 : 1;
    const bDomain = b.split("@")[1]?.includes(bareHost) ? 0 : 1;
    if (aDomain !== bDomain) return aDomain - bDomain;
    return a.localeCompare(b);
  });
}

type Row = { id: string; slug: string; name: string; contactWebsite: string | null; signupUrl: string | null };

type EmailHit = { email: string; sourceUrl: string };
type HarvestResult = {
  slug: string;
  name: string;
  url: string | null;
  pagesChecked: string[];
  emails: EmailHit[];
  proposedEmail: string | null;
  proposedEmailSource: string | null;
  domainMismatch: boolean;
  detectedLanguage: WebsiteLanguage | null;
  languageEvidence: string;
  outcome: "email-found" | "no-email-found" | "unreachable" | "no-url";
};

async function harvestRow(row: Row): Promise<HarvestResult> {
  const url = row.contactWebsite || row.signupUrl;
  const base = {
    slug: row.slug,
    name: row.name,
    url,
    pagesChecked: [] as string[],
    emails: [] as EmailHit[],
    proposedEmail: null,
    proposedEmailSource: null,
    domainMismatch: false,
    detectedLanguage: null as WebsiteLanguage | null,
    languageEvidence: "",
  };

  if (!url) return { ...base, outcome: "no-url" };

  const home = await fetchHtml(url);
  if (!home) return { ...base, url, outcome: "unreachable" };

  const { detected, evidence } = classify(home.html);
  base.detectedLanguage = detected;
  base.languageEvidence = evidence;

  const pages: { url: string; html: string }[] = [{ url: home.finalUrl, html: home.html }];
  for (const contactUrl of discoverContactPages(home.html, home.finalUrl)) {
    const page = await fetchHtml(contactUrl);
    if (page) pages.push({ url: page.finalUrl, html: page.html });
  }

  const hits: EmailHit[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const email of extractEmails(page.html)) {
      if (seen.has(email)) continue;
      seen.add(email);
      hits.push({ email, sourceUrl: page.url });
    }
  }

  base.pagesChecked = pages.map((p) => p.url);
  base.emails = hits;

  if (hits.length === 0) {
    return { ...base, url, detectedLanguage: detected, languageEvidence: evidence, outcome: "no-email-found" };
  }

  let siteHost = "";
  try {
    siteHost = new URL(home.finalUrl).host;
  } catch {
    /* ignore */
  }
  const ranked = rankEmails(
    hits.map((h) => h.email),
    siteHost
  );
  const proposedEmail = ranked[0];
  const proposedHit = hits.find((h) => h.email === proposedEmail)!;
  const bareHost = siteHost.replace(/^www\./, "");
  const domainMismatch = bareHost ? !proposedEmail.split("@")[1]?.includes(bareHost) : false;

  return {
    ...base,
    url,
    proposedEmail,
    proposedEmailSource: proposedHit.sourceUrl,
    domainMismatch,
    detectedLanguage: detected,
    languageEvidence: evidence,
    outcome: "email-found",
  };
}

const REPORT_PATH = "/home/jack/israel-programs/data/contact-email-harvest-2026-07-12.json";

async function main() {
  const apply = process.argv.includes("--apply");

  // Apply mode reads the already-reviewed report file rather than re-crawling, so it
  // writes exactly the dataset the human approved (a fresh crawl could return a
  // different set as sites go up/down between review and apply).
  if (apply) {
    const results = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as HarvestResult[];
    console.log(`Applying reviewed report of ${results.length} programs...`);
    await applyResults(results);
    return;
  }

  const rows = await prisma.program.findMany({
    where: { status: "PUBLISHED", contactEmail: null },
    select: { id: true, slug: true, name: true, contactWebsite: true, signupUrl: true },
    orderBy: { name: "asc" },
  });
  console.log(`Harvesting ${rows.length} published programs without a contactEmail...`);

  const results = await mapWithConcurrency(rows, CONCURRENCY, harvestRow);

  const outcomeCounts: Record<string, number> = {};
  const langCounts: Record<string, number> = {};
  for (const r of results) {
    outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;
    const key = r.detectedLanguage ?? "UNCLASSIFIED";
    langCounts[key] = (langCounts[key] ?? 0) + 1;
  }
  console.log("Outcome distribution:", JSON.stringify(outcomeCounts));
  console.log("Language distribution (this batch):", JSON.stringify(langCounts));
  console.log("Domain-mismatch proposals (review):", results.filter((r) => r.domainMismatch).length);
  console.log("Multiple-email cases (review):", results.filter((r) => r.emails.length > 1).length);

  writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));
  console.log("Report written to data/contact-email-harvest-2026-07-12.json");
  console.log("\nReport mode only (no writes). Re-run with --apply after review.");
  await prisma.$disconnect();
}

async function applyResults(results: HarvestResult[]) {
  // Only programs still without a contactEmail are eligible -- guards against a
  // double-apply or an email added by other means since the report was generated.
  const eligible = await prisma.program.findMany({
    where: { status: "PUBLISHED", contactEmail: null },
    select: { id: true, slug: true, websiteLanguage: true },
  });
  const bySlug = new Map(eligible.map((e) => [e.slug, e]));

  // Snapshot the eligible rows before any write.
  const before = await prisma.program.findMany({
    where: { id: { in: eligible.map((e) => e.id) } },
    select: { id: true, slug: true, contactEmail: true, contactEmailSource: true, websiteLanguage: true },
  });
  writeFileSync(
    "/home/jack/israel-programs/data/snapshots/contact-email-harvest-2026-07-12.json",
    JSON.stringify(before, null, 2)
  );
  console.log(`Snapshot written for ${before.length} eligible rows.`);

  let emailWrites = 0;
  let langWrites = 0;
  let skippedIneligible = 0;
  for (const r of results) {
    const target = bySlug.get(r.slug);
    if (!target) {
      // Program got an email since the report (or isn't eligible) -- skip, don't clobber.
      if (r.proposedEmail) skippedIneligible++;
      continue;
    }

    const data: {
      contactEmail?: string;
      contactEmailSource?: string;
      contactEmailStatus?: null;
      contactEmailVerifiedAt?: null;
      websiteLanguage?: WebsiteLanguage;
    } = {};
    if (r.proposedEmail && r.proposedEmailSource) {
      data.contactEmail = r.proposedEmail;
      data.contactEmailSource = r.proposedEmailSource;
      // A newly-written address is unverified by definition -- mirror updateProgram's
      // reset so a stale/orphaned VERIFIED status can't vouch for an email nobody
      // checked (a null-email row's leftover verifiedAt referred to a prior address).
      data.contactEmailStatus = null;
      data.contactEmailVerifiedAt = null;
    }
    // Backfill language only where it's still null (never clobber a prior/manual value).
    if (r.detectedLanguage && target.websiteLanguage === null) {
      data.websiteLanguage = r.detectedLanguage;
    }
    if (Object.keys(data).length === 0) continue;

    await prisma.program.update({ where: { id: target.id }, data });
    if (data.contactEmail) emailWrites++;
    if (data.websiteLanguage) langWrites++;
  }

  const expectedEmailWrites = results.filter((r) => r.proposedEmail && r.proposedEmailSource).length;
  console.log(`Email writes -- report proposals: ${expectedEmailWrites}, written: ${emailWrites}, skipped (no longer eligible): ${skippedIneligible}`);
  console.log(`Language backfills applied: ${langWrites}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
