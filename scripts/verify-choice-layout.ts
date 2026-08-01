/**
 * Verification script for poll/choice-question-layout -- checks that poll questions
 * don't overflow/clip at mobile widths, that no label wraps past 2 lines, and that no
 * "Skip" string remains anywhere on the poll surface. Used against Yeshivat Otniel
 * (plain STARS + ordinal-converted + the one categorical question, unit_assignments)
 * and Yeshivat HaGolan (a short-form program).
 *
 * WRITES DATA: it opens /rate (creates an INCOMPLETE PollResponse) and clicks options
 * (writes PollAnswer rows). refuseIfProd() below aborts if DATABASE_URL matches the
 * value committed in .env (this repo's prod DB) -- run it against a Neon branch, never
 * against production. See CLAUDE.md's "Shipping a schema change" for cutting a branch.
 *
 * Usage (dev server must already be running at http://localhost:3000, pointed at the
 * same DATABASE_URL as this script):
 *   DATABASE_URL=<branch-uri> npx tsx scripts/verify-choice-layout.ts
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { getPublicPollLink } from "../lib/pollConfig";

function refuseIfProd() {
  const envDatabaseUrl = readFileSync(".env", "utf-8")
    .split("\n")
    .find((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length)
    .trim()
    .replace(/^"(.*)"$/, "$1"); // .env quotes the value; `source .env` strips the quotes on export
  if (envDatabaseUrl && envDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL matches the value committed in .env (production) -- this script writes " +
        "PollResponse/PollAnswer rows and must only run against a Neon branch. Cut a branch " +
        "and pass its connection string as DATABASE_URL instead."
    );
  }
}

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "docs/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const VIEWPORTS = [
  { width: 390, height: 844, label: "390" },
  { width: 768, height: 1024, label: "768" },
];

type Problem = { page: string; viewport: string; kind: string; detail: string };
const problems: Problem[] = [];

function record(page: string, viewport: string, kind: string, detail: string) {
  problems.push({ page, viewport, kind, detail });
  console.log(`  [FAIL] ${kind}: ${detail}`);
}

async function checkOverflow(page: Page, pageLabel: string, viewportLabel: string, vw: number) {
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
        const tag = el.getAttribute("data-poll-question") ?? el.tagName;
        problems.push(`escapes viewport: <${tag}> left=${r.left.toFixed(1)} right=${r.right.toFixed(1)}`);
      }
      const cs = getComputedStyle(el);
      if (el.scrollWidth - el.clientWidth > 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
        const tag = el.getAttribute("data-poll-question") ?? el.tagName;
        problems.push(`clipped: <${tag}> scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`);
      }
    }
    return problems;
  }, vw);
  for (const p of result) record(pageLabel, viewportLabel, "overflow", p);
}

async function checkLineCounts(page: Page, pageLabel: string, viewportLabel: string) {
  const results = await page.evaluate(() => {
    const out: { key: string; text: string; lines: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-poll-option]")) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      const lines = new Set(rects.map((r) => Math.round(r.top))).size;
      out.push({
        key: el.closest("[data-poll-question]")?.getAttribute("data-poll-question") ?? "?",
        text: (el.textContent ?? "").trim(),
        lines,
      });
    }
    return out;
  });
  for (const r of results) {
    console.log(`  [line-count] ${viewportLabel}px ${r.key}: ${r.lines} line(s) -- "${r.text}" (${r.text.length} chars)`);
    if (r.lines > 2) {
      record(pageLabel, viewportLabel, "line-count", `${r.key}: ${r.lines} lines -- "${r.text}"`);
    }
  }
}

async function checkNoSkip(page: Page, pageLabel: string, viewportLabel: string) {
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-poll-mode]");
    if (!root) return { visible: false, aria: [] as string[] };
    return {
      visible: /\bskip\b/i.test(root.innerText),
      aria: [...root.querySelectorAll("[aria-label],[title]")]
        .map((e) => `${e.getAttribute("aria-label") ?? ""}|${e.getAttribute("title") ?? ""}`)
        .filter((s) => /skip/i.test(s)),
    };
  });
  if (result.visible) record(pageLabel, viewportLabel, "skip-text", "visible text contains 'skip'");
  for (const a of result.aria) record(pageLabel, viewportLabel, "skip-aria", a);
}

async function main() {
  refuseIfProd();

  const targetSlugs = [
    { slug: "yeshivat-otniel", label: "otniel" },
    { slug: "yeshivat-hagolan", label: "hagolan" },
  ];
  const targets = await Promise.all(
    targetSlugs.map(async ({ slug, label }) => {
      const program = await prisma.program.findUnique({ where: { slug }, select: { id: true } });
      if (!program) throw new Error(`Program "${slug}" not found on this database.`);
      const link = await getPublicPollLink(program.id);
      if (!link) throw new Error(`No public poll link for "${slug}" -- enable pollLinkPublic first.`);
      return { slug, label, path: link };
    })
  );
  await prisma.$disconnect();

  const browser = await chromium.launch();
  let shotIndex = 16;

  for (const target of targets) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });

      const url = `${BASE}${target.path}`;
      console.log(`\n=== ${target.label} @ ${vp.label}px : ${url} ===`);
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-poll-mode]", { timeout: 15000 });

      await checkOverflow(page, target.label, vp.label, vp.width);
      await checkLineCounts(page, target.label, vp.label);
      await checkNoSkip(page, target.label, vp.label);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${shotIndex}-${target.label}-poll-unanswered-${vp.label}.png`,
        fullPage: true,
      });
      shotIndex++;

      if (target.label === "otniel") {
        for (const key of ["unit_assignments", "free_time", "connection_israel"]) {
          const locator = page.locator(`[data-poll-question="${key}"]`);
          if ((await locator.count()) === 0) {
            console.log(`  (question ${key} not present on this program's poll -- skipping detail shot)`);
            continue;
          }
          await locator.scrollIntoViewIfNeeded();
          await locator.screenshot({
            path: `${SCREENSHOT_DIR}/${shotIndex}-detail-${key}-${vp.label}.png`,
          });
          shotIndex++;

          // click the third option/segment, then re-check overflow + line counts --
          // selection changes font-weight and can re-wrap a label
          const optionButtons = locator.locator("button[data-poll-option], button[aria-pressed]");
          const count = await optionButtons.count();
          if (count >= 3) {
            await optionButtons.nth(2).click();
            await page.waitForTimeout(150);
            await checkOverflow(page, `${target.label}:${key}:selected`, vp.label, vp.width);
            await checkLineCounts(page, `${target.label}:${key}:selected`, vp.label);
            await locator.screenshot({
              path: `${SCREENSHOT_DIR}/${shotIndex}-detail-${key}-selected-${vp.label}.png`,
            });
            shotIndex++;
          }
        }
      }

      await context.close();
    }
  }

  await browser.close();

  console.log(`\n\n=== SUMMARY: ${problems.length} problem(s) ===`);
  for (const p of problems) {
    console.log(`  ${p.page} @ ${p.viewport}px [${p.kind}] ${p.detail}`);
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
