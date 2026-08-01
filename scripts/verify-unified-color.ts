/**
 * Verification script for poll/unify-rating-selected-color -- confirms the selected
 * segment on the public poll page is ink-navy for every question, never brass/gold.
 *
 * WRITES DATA: it opens /rate (creates an INCOMPLETE PollResponse) and clicks options
 * (writes PollAnswer rows). refuseIfProd() aborts if DATABASE_URL matches the value
 * committed in .env (production) -- run only against a Neon branch. Same guard as
 * scripts/verify-choice-layout.ts.
 *
 * Usage (dev server must already be running at http://localhost:3000, pointed at the
 * same DATABASE_URL as this script):
 *   DATABASE_URL=<branch-uri> npx tsx scripts/verify-unified-color.ts
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { getPublicPollLink } from "../lib/pollConfig";

function refuseIfProd() {
  const envDatabaseUrl = readFileSync(".env", "utf-8")
    .split("\n")
    .find((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length)
    .trim()
    .replace(/^"(.*)"$/, "$1");
  if (envDatabaseUrl && envDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL matches the value committed in .env (production) -- this script writes " +
        "PollResponse/PollAnswer rows and must only run against a Neon branch."
    );
  }
}

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "docs/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const NAVY = "rgb(22, 39, 74)"; // --primary #16274a
const BRASS = "rgb(184, 145, 47)"; // --accent #b8912f

async function main() {
  refuseIfProd();

  const program = await prisma.program.findUnique({ where: { slug: "yeshivat-otniel" }, select: { id: true } });
  if (!program) throw new Error('Program "yeshivat-otniel" not found on this database.');
  const link = await getPublicPollLink(program.id);
  if (!link) throw new Error("No public poll link for yeshivat-otniel -- enable pollLinkPublic first.");
  await prisma.$disconnect();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });

  const url = `${BASE}${link}`;
  console.log(`=== ${url} ===`);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-poll-mode]", { timeout: 15000 });

  // connection_israel: General/Core bucket, STARS -- this was GOLD before the fix.
  // torah_knowledge: Torah Learning (specialty) bucket, STARS -- also gold before.
  const targets = [
    { key: "connection_israel", bucketLabel: "General (core)" },
    { key: "torah_knowledge", bucketLabel: "Torah Learning (specialty)" },
  ];

  let problems = 0;

  for (const t of targets) {
    const locator = page.locator(`[data-poll-question="${t.key}"]`);
    if ((await locator.count()) === 0) throw new Error(`Question "${t.key}" not present on this poll.`);
    await locator.scrollIntoViewIfNeeded();

    const segments = locator.locator('button[aria-pressed="false"]');
    await segments.nth(2).click(); // pick value 3, same as the other verification script
    await page.waitForTimeout(150);

    const selected = locator.locator('button[aria-pressed="true"]');
    const bg = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
    const ok = bg === NAVY;
    console.log(`  ${t.key} (${t.bucketLabel}): selected background = ${bg} -- ${ok ? "NAVY, correct" : "NOT NAVY"}`);
    if (bg === BRASS) console.log(`    [FAIL] this is the old brass color -- regression!`);
    if (!ok) problems++;

    await locator.screenshot({ path: `${SCREENSHOT_DIR}/32-detail-${t.key}-unified-navy-selected-390.png` });
  }

  await browser.close();

  console.log(`\n=== SUMMARY: ${problems} problem(s) ===`);
  if (problems > 0) process.exit(1);
  console.log("All checks passed -- every selected segment is ink-navy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
