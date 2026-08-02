/**
 * Verification script for the post-poll referral loop (progress line + WhatsApp share
 * button on the thank-you screen). Used against Yeshivat Otniel (mobile, 375px) and
 * Yeshivat HaGolan (desktop, 1280px) -- two different programs, each in a fresh browser
 * context, so decideAnonymousStatus's REPEAT_IP check (scoped to programId+ipHash) never
 * flags the second run.
 *
 * WRITES DATA, and unlike scripts/verify-choice-layout.ts / verify-unified-color.ts (which
 * only ever create an INCOMPLETE PollResponse), this one deliberately answers enough
 * questions to cross the readiness bar and drive a response to COUNTED. refuseIfProd()
 * below aborts if DATABASE_URL matches the value committed in .env (this repo's prod DB)
 * -- run it against a Neon branch, never against production.
 *
 * Usage (dev server must already be running at http://localhost:3000, pointed at the
 * same DATABASE_URL as this script; both target programs need pollLinkPublic on -- true
 * for every currently-published program via prisma/enable-public-poll-links.ts):
 *   DATABASE_URL=<branch-uri> npx tsx scripts/verify-share-thankyou.ts
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { getPublicPollLink, getQuestionsForProgram } from "../lib/pollConfig";
import { SITE_URL } from "../lib/siteUrl";

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
        "PollResponse/PollAnswer rows and drives them to COUNTED, and must only run against " +
        "a Neon branch. Cut a branch and pass its connection string as DATABASE_URL instead."
    );
  }
}

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "docs/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

type Problem = { page: string; kind: string; detail: string };
const problems: Problem[] = [];

function record(page: string, kind: string, detail: string) {
  problems.push({ page, kind, detail });
  console.log(`  [FAIL] ${kind}: ${detail}`);
}

// Threshold-leak check is phrase-shaped, not numeral-shaped: the response count itself
// may legitimately equal MIN_RESPONSES_FOR_RATING (7) on a real program, so we can't just
// forbid the digit -- we forbid the WORDS that would reveal it's a threshold at all.
const LEAK_PATTERNS = [
  /\bof\s+\d+\b/,
  /\d+\s*%/,
  /\bneed(s|ed)?\b/i,
  /\bthreshold\b/i,
  /\bunlock/i,
  /\bgoal\b/i,
  /\bremaining\b/i,
];
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

async function checkOverflow(page: Page, pageLabel: string, vw: number) {
  const result = await page.evaluate((vw) => {
    const problems: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth - de.clientWidth > 1) {
      problems.push(`page scrolls horizontally: scrollWidth=${de.scrollWidth} clientWidth=${de.clientWidth}`);
    }
    const root = document.querySelector<HTMLElement>("[data-poll-mode]");
    if (!root) return problems;
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        problems.push(`escapes viewport: <${el.tagName}> left=${r.left.toFixed(1)} right=${r.right.toFixed(1)}`);
      }
      const cs = getComputedStyle(el);
      if (el.scrollWidth - el.clientWidth > 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
        problems.push(`clipped: <${el.tagName}> scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`);
      }
    }
    return problems;
  }, vw);
  for (const p of result) record(pageLabel, "overflow", p);
}

async function checkThankYouPanel(page: Page, pageLabel: string, expectedRef: string) {
  const panel = page.locator("[data-poll-thankyou]");
  await panel.waitFor({ state: "visible", timeout: 15000 });

  const innerText = await panel.innerText();
  console.log(`  panel text: ${JSON.stringify(innerText)}`);

  if (!/\d+\s+responses?\s+so\s+far/.test(innerText)) {
    record(pageLabel, "progress-line", `expected "N response(s) so far", got: "${innerText}"`);
  }

  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(innerText)) {
      record(pageLabel, "threshold-leak", `matched ${pattern} in panel text: "${innerText}"`);
    }
  }
  const titles = await panel.evaluate((el) =>
    [...el.querySelectorAll("[title],[aria-label]")].map(
      (n) => `${n.getAttribute("title") ?? ""}|${n.getAttribute("aria-label") ?? ""}`
    )
  );
  for (const t of titles) {
    for (const pattern of LEAK_PATTERNS) {
      if (pattern.test(t)) record(pageLabel, "threshold-leak-attr", `matched ${pattern} in "${t}"`);
    }
  }
  if (EMOJI_PATTERN.test(innerText)) {
    record(pageLabel, "emoji", `panel text contains an emoji: "${innerText}"`);
  }

  const shareLink = page.locator("[data-poll-share]");
  const href = await shareLink.getAttribute("href");
  if (!href || !href.startsWith("https://wa.me/?text=")) {
    record(pageLabel, "share-href", `unexpected href: ${href}`);
    return;
  }
  const decoded = decodeURIComponent(href.slice("https://wa.me/?text=".length));
  console.log(`  decoded share text: ${JSON.stringify(decoded)}`);
  if (!decoded.includes(SITE_URL)) {
    record(pageLabel, "share-url", `decoded message doesn't contain ${SITE_URL}: "${decoded}"`);
  }
  const sharedRefMatch = decoded.match(/[?&]ref=([^\s&]+)/);
  const sharedRef = sharedRefMatch?.[1];
  if (sharedRef !== expectedRef) {
    record(
      pageLabel,
      "share-token",
      `shared ref "${sharedRef}" !== program's public token "${expectedRef}" -- may be resharing the respondent's own referrer token instead of the public link`
    );
  }

  const box = await shareLink.boundingBox();
  if (!box || box.height < 44) {
    record(pageLabel, "touch-target", `share link height ${box?.height} < 44px`);
  }

  const style = await shareLink.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { boxShadow: cs.boxShadow, borderRadius: cs.borderRadius, backgroundImage: cs.backgroundImage };
  });
  if (style.boxShadow !== "none") record(pageLabel, "style-guide", `boxShadow is "${style.boxShadow}", expected "none"`);
  if (style.borderRadius !== "4px") record(pageLabel, "style-guide", `borderRadius is "${style.borderRadius}", expected "4px"`);
  if (style.backgroundImage !== "none") record(pageLabel, "style-guide", `backgroundImage is "${style.backgroundImage}", expected "none"`);
}

async function answerToReadinessBar(page: Page, targetKeys: string[]) {
  for (const key of targetKeys) {
    const question = page.locator(`[data-poll-question="${key}"]`);
    await question.scrollIntoViewIfNeeded();
    const optionButtons = question.locator("button[data-poll-option], button[aria-pressed]");
    const count = await optionButtons.count();
    if (count === 0) {
      console.log(`  (question ${key} has no clickable options -- skipping)`);
      continue;
    }
    await optionButtons.nth(Math.min(2, count - 1)).click();
  }
  // Each answer is its own debounced (600ms) autosave timer -- wait for the last one
  // to fire and the resulting maybeTransition to land before checking for the thank-you
  // panel.
  await page.waitForTimeout(1200);
}

async function main() {
  refuseIfProd();

  const targets = [
    { slug: "yeshivat-otniel", label: "otniel", viewport: { width: 375, height: 812, label: "375" } },
    { slug: "yeshivat-hagolan", label: "hagolan", viewport: { width: 1280, height: 900, label: "desktop" } },
  ];

  const resolvedTargets = await Promise.all(
    targets.map(async (t) => {
      const program = await prisma.program.findUnique({ where: { slug: t.slug }, select: { id: true } });
      if (!program) throw new Error(`Program "${t.slug}" not found on this database.`);
      const link = await getPublicPollLink(program.id);
      if (!link) {
        throw new Error(
          `No public poll link for "${t.slug}" -- enable pollLinkPublic first (the share button ` +
            `correctly doesn't render without one, so this script has nothing to check)."`
        );
      }
      const expectedRef = new URL(link, SITE_URL).searchParams.get("ref");
      if (!expectedRef) throw new Error(`Public poll link for "${t.slug}" has no ref token: ${link}`);

      const resolved = await getQuestionsForProgram(program.id);
      const targetKeys: string[] = [];
      if (resolved.core.length > 0) targetKeys.push(resolved.core[0].key);
      for (const extra of resolved.extras) {
        if (extra.questions.length > 0) targetKeys.push(extra.questions[0].key);
      }
      let i = 1;
      while (targetKeys.length < 3 && i < resolved.core.length) {
        targetKeys.push(resolved.core[i].key);
        i++;
      }
      if (targetKeys.length < 3) {
        throw new Error(`"${t.slug}" doesn't have enough questions to cross the readiness bar (need 3, resolved ${targetKeys.length}).`);
      }

      return { ...t, path: link, expectedRef, targetKeys };
    })
  );
  await prisma.$disconnect();

  const browser = await chromium.launch();
  let shotIndex = 33;

  for (const target of resolvedTargets) {
    const context = await browser.newContext({
      viewport: { width: target.viewport.width, height: target.viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    const url = `${BASE}${target.path}`;
    console.log(`\n=== ${target.label} @ ${target.viewport.label} : ${url} ===`);
    console.log(`  answering: ${target.targetKeys.join(", ")}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-poll-mode]", { timeout: 15000 });

    await answerToReadinessBar(page, target.targetKeys);
    await checkThankYouPanel(page, `${target.label}@${target.viewport.label}`, target.expectedRef);
    await checkOverflow(page, `${target.label}@${target.viewport.label}`, target.viewport.width);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${shotIndex}-thankyou-share-${target.viewport.label}.png`,
      fullPage: true,
    });
    shotIndex++;

    await context.close();
  }

  await browser.close();

  console.log(`\n\n=== SUMMARY: ${problems.length} problem(s) ===`);
  for (const p of problems) {
    console.log(`  ${p.page} [${p.kind}] ${p.detail}`);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
