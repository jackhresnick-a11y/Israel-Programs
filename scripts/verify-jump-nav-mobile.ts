/**
 * Verification script for ProgramJumpNav's mobile behavior -- checks that the
 * program-name "back to top" element (components/ProgramJumpNav.tsx) is dropped
 * entirely at mobile widths (< 640px, Tailwind's `sm` breakpoint, matching every
 * other mobile/desktop split on this page) while the rest of the bar (the jump
 * anchors and the "Rate this program" CTA) stays, and that it reappears at `sm`
 * and above.
 *
 * Read-only: only loads /programs and one program page (GET, no writes), so
 * unlike scripts/verify-choice-layout.ts this needs no refuseIfProd() guard --
 * same posture as scripts/verify-card-counts.ts.
 *
 * Usage (dev server must already be running at http://localhost:3000):
 *   npx tsx scripts/verify-jump-nav-mobile.ts [--label before|after]
 *
 * `--label` only affects the screenshot filename prefix, so a "before" run (on
 * the unmodified component) and an "after" run (once the mobile class change is
 * applied) can be captured side by side for docs/jump-nav-mobile-before-after.md.
 * The assertions themselves are unconditional -- a "before" run is expected to
 * fail the mobile checks; that failure is itself the "before" evidence.
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "docs/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const labelArgIndex = process.argv.indexOf("--label");
const RUN_LABEL = labelArgIndex !== -1 ? process.argv[labelArgIndex + 1] : "after";

const ALL_VIEWPORTS = [
  { width: 320, height: 700, label: "320", mobile: true },
  { width: 390, height: 844, label: "390", mobile: true },
  { width: 640, height: 900, label: "640", mobile: false },
  { width: 768, height: 900, label: "768", mobile: false },
];

// Optional `--widths 320,390` (or `--widths=320,390`) to run a subset -- useful against
// a flaky/slow dev DB where re-hitting all four widths per run is unnecessarily heavy,
// e.g. capturing only the mobile widths for a "before" run since the desktop widths are
// unaffected by this change either way.
const widthsArg = process.argv.find((a) => a.startsWith("--widths"));
const requestedWidths = widthsArg
  ? (widthsArg.includes("=") ? widthsArg.split("=")[1] : process.argv[process.argv.indexOf(widthsArg) + 1])
      ?.split(",")
      .map((w) => w.trim())
  : null;
const VIEWPORTS = requestedWidths
  ? ALL_VIEWPORTS.filter((v) => requestedWidths.includes(v.label))
  : ALL_VIEWPORTS;

// Known to render the full 3-item jump nav (Ratings/Reviews/Alumni all qualify) --
// see the plan doc / commit message for how this was found (a program with
// non-zero references, reviews, and poll responses).
const TARGET_SLUG = "otzem-overseas-program";

type Problem = { viewport: string; kind: string; detail: string };
const problems: Problem[] = [];

function record(viewport: string, kind: string, detail: string) {
  problems.push({ viewport, kind, detail });
  console.log(`  [FAIL] ${kind}: ${detail}`);
}

// The dev DB (Neon) is a shared remote Postgres instance and occasionally answers a
// query with ETIMEDOUT under load -- retry navigation a couple of times rather than
// treating a transient 500/timeout as a layout finding. `waitUntil: "domcontentloaded"`
// rather than "networkidle": Next's dev server keeps a live HMR websocket open, so
// "networkidle" can hang indefinitely instead of settling. A short explicit wait after
// the nav selector appears (or a bounded timeout) stands in for "settled" instead.
async function gotoWithRetry(page: Page, url: string, attempts = 5) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (response && response.status() >= 500) throw new Error(`HTTP ${response.status()}`);
      await page
        .waitForSelector('nav[aria-label="On this page"]', { timeout: 15_000 })
        .catch(() => {});
      return;
    } catch (err) {
      lastErr = err;
      // Backoff rather than immediate retry -- a 500 here is usually the dev-mode
      // Prisma connection pool draining after the *previous* request, not a code bug;
      // hammering it again immediately just prolongs the exhaustion.
      const backoffMs = 3_000 * (i + 1);
      console.log(`  (retrying navigation to ${url} in ${backoffMs}ms after: ${(err as Error).message})`);
      await page.waitForTimeout(backoffMs);
    }
  }
  throw lastErr;
}

async function findTargetWithJumpNav(page: Page): Promise<string> {
  await gotoWithRetry(page, `${BASE}/programs/${TARGET_SLUG}`);
  const hasNav = await page.locator('nav[aria-label="On this page"]').count();
  if (hasNav > 0) return TARGET_SLUG;

  // Fallback: the known target's data may have changed since this script was
  // written -- scan /programs' first page of cards for one that qualifies.
  await gotoWithRetry(page, `${BASE}/programs`);
  const slugs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/programs/"]')]
      .map((a) => a.getAttribute("href")?.replace("/programs/", ""))
      .filter((s): s is string => !!s && !s.includes("/"))
  );
  for (const slug of [...new Set(slugs)].slice(0, 30)) {
    await gotoWithRetry(page, `${BASE}/programs/${slug}`);
    const count = await page.locator('nav[aria-label="On this page"]').count();
    if (count > 0) return slug;
  }
  throw new Error("No program page with a qualifying ProgramJumpNav (>=2 jump items) found.");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log(`Finding a program page with a qualifying jump nav...`);
  const slug = await findTargetWithJumpNav(page);
  console.log(`Using /programs/${slug}\n`);

  for (const viewport of VIEWPORTS) {
    console.log(`--- ${viewport.width}x${viewport.height} (${viewport.mobile ? "mobile" : "desktop"}) ---`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoWithRetry(page, `${BASE}/programs/${slug}`);
    // Let the sticky-bar CSS and any layout-affecting hydration settle before measuring.
    await page.waitForTimeout(500);

    const nav = page.locator('nav[aria-label="On this page"]');
    if ((await nav.count()) === 0) {
      record(viewport.label, "nav-missing", "ProgramJumpNav did not render at all");
      continue;
    }
    if (!(await nav.first().isVisible())) {
      record(viewport.label, "nav-not-visible", "ProgramJumpNav rendered but is not visible");
    }

    const topLink = nav.locator('a[href="#top"]');
    const topLinkVisible = (await topLink.count()) > 0 && (await topLink.first().isVisible());

    if (viewport.mobile && topLinkVisible) {
      record(viewport.label, "name-visible-on-mobile", "the #top program-name link is visible below the sm breakpoint");
    }
    if (!viewport.mobile && !topLinkVisible) {
      record(viewport.label, "name-hidden-on-desktop", "the #top program-name link is not visible at/above the sm breakpoint");
    }
    if (!viewport.mobile && topLinkVisible) {
      const text = (await topLink.first().textContent())?.trim() ?? "";
      if (!text) record(viewport.label, "name-empty", "the #top link is visible but has no text content");
    }

    // The rest of the bar must be present and visible at every width.
    for (const anchorId of ["ratings", "reviews", "alumni"]) {
      const anchor = nav.locator(`a[href="#${anchorId}"]`);
      if ((await anchor.count()) === 0) continue; // not every program has every section; fine
      if (!(await anchor.first().isVisible())) {
        record(viewport.label, "jump-anchor-not-visible", `#${anchorId} anchor is not visible`);
      }
    }
    const rateCta = nav.locator("a", { hasText: "Rate this program" });
    if ((await rateCta.count()) === 0 || !(await rateCta.first().isVisible())) {
      record(viewport.label, "rate-cta-not-visible", "the Rate this program CTA is not visible in the nav");
    }

    // No horizontal page overflow at any width (same check verify-card-counts.ts makes).
    // A couple of px of tolerance absorbs scrollbar-width rounding, not a real finding.
    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    if (overflowPx > 2) {
      record(viewport.label, "horizontal-overflow", `page scrollWidth exceeds viewport width by ${overflowPx}px`);
    }

    const screenshotPath = `${SCREENSHOT_DIR}/jump-nav-${RUN_LABEL}-${viewport.label}.png`;
    await nav.first().screenshot({ path: screenshotPath }).catch(() => {
      // If the nav itself isn't screenshot-able (not visible), fall back to a full-page shot.
      return page.screenshot({ path: screenshotPath });
    });
    console.log(`  screenshot: ${screenshotPath}`);
  }

  await browser.close();

  console.log(`\n${problems.length === 0 ? "PASS" : "FAIL"}: ${problems.length} problem(s) found.`);
  if (problems.length > 0) {
    for (const p of problems) console.log(`  - [${p.viewport}] ${p.kind}: ${p.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
