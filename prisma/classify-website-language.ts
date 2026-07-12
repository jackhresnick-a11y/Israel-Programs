import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";
import type { WebsiteLanguage } from "@/app/generated/prisma/enums";
import { fetchHtml, classify, mapWithConcurrency } from "@/lib/websiteLanguageDetection";

/**
 * One-time classification pass: detects each program's contactWebsite (falling back
 * to signupUrl) as ENGLISH / HEBREW / BOTH, for the admin bulk-email tool's
 * per-language sections. Report mode (default) writes a JSON file for human review;
 * --apply writes Program.websiteLanguage after snapshotting prior values.
 *
 * Detection logic lives in lib/websiteLanguageDetection.ts (shared with
 * prisma/harvest-contact-emails.ts).
 */

const CONCURRENCY = 6;

type Row = { id: string; slug: string; name: string; contactWebsite: string | null; signupUrl: string | null };
type Result = {
  slug: string;
  name: string;
  url: string | null;
  detected: WebsiteLanguage | null;
  evidence: string;
};

async function classifyRow(row: Row): Promise<Result> {
  const url = row.contactWebsite || row.signupUrl;
  if (!url) return { slug: row.slug, name: row.name, url: null, detected: null, evidence: "no website/signupUrl on file" };

  const fetched = await fetchHtml(url);
  if (!fetched) return { slug: row.slug, name: row.name, url, detected: null, evidence: "fetch failed or non-HTML response" };

  const { detected, evidence } = classify(fetched.html);
  return { slug: row.slug, name: row.name, url, detected, evidence };
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
