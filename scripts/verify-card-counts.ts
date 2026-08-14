/**
 * Verification script for the browse-card metadata row after replacing the star
 * rating with three labelled counts (see components/ProgramCard.tsx's
 * ProgramCardInfo). Checks the worst-case programs -- the ones with the most
 * populated counts row and/or the longest name -- at narrow mobile widths for
 * horizontal overflow, clipped spans, and a metadata row that wraps past 2 lines.
 *
 * Read-only: only loads /programs (GET, no writes), so unlike
 * scripts/verify-choice-layout.ts this needs no refuseIfProd() guard and can run
 * against any DATABASE_URL, including prod.
 *
 * Usage (dev server must already be running at http://localhost:3000):
 *   npx tsx scripts/verify-card-counts.ts
 */
import { chromium, type Page } from "playwright";

const BASE = "http://localhost:3000";

const VIEWPORTS = [
  { width: 320, height: 700, label: "320" },
  { width: 350, height: 700, label: "350" },
  { width: 390, height: 844, label: "390" },
];

// Worst-case published programs by populated metadata-row count (references,
// reviews, poll responses) and/or name length, queried directly from prod --
// see the plan doc for the full table. otzem-overseas-program is the only
// program with all three counts non-zero *and* a long name.
const TARGETS = [
  { slug: "otzem-overseas-program", name: "Otzem Overseas Program (Atzmona)" },
  { slug: "yeshivat-hakotel", name: "Yeshivat Hakotel" },
  { slug: "garin-tzabar", name: "Garin Tzabar" },
  { slug: "mechina-olamit-world-bnei-akiva", name: "Mechina Olamit (World Bnei Akiva and Kol Ami)" },
  { slug: "yeshivat-har-etzion-the-gush", name: "Yeshivat Har Etzion (The Gush)" },
];

type Problem = { target: string; viewport: string; kind: string; detail: string };
const problems: Problem[] = [];

function record(target: string, viewport: string, kind: string, detail: string) {
  problems.push({ target, viewport, kind, detail });
  console.log(`  [FAIL] ${kind}: ${detail}`);
}

/**
 * Measures the card wrapping `a[href="/programs/<slug>"]` -- ProgramCard renders
 * that Link as a direct child of the Card root, so its parentElement *is* the
 * card. Returns null if the card isn't on the page (e.g. search didn't surface it).
 */
async function measureCard(page: Page, slug: string) {
  return page.evaluate((slug) => {
    const link = document.querySelector<HTMLElement>(`a[href="/programs/${slug}"]`);
    if (!link) return null;
    const card = link.parentElement;
    if (!card) return null;
    const rect = card.getBoundingClientRect();

    const countSpans = [...card.querySelectorAll<HTMLElement>("span.whitespace-nowrap.text-muted")];
    const labels = countSpans.map((el) => (el.textContent ?? "").trim());
    const clippedLabels = countSpans
      .filter((el) => el.scrollWidth - el.clientWidth > 1)
      .map((el) => (el.textContent ?? "").trim());

    // Count-row line count via distinct rounded `top` values across every count span.
    const tops = new Set(countSpans.map((el) => Math.round(el.getBoundingClientRect().top)));

    return {
      width: rect.width,
      height: rect.height,
      cardOverflows: card.scrollWidth - card.clientWidth > 1,
      labels,
      clippedLabels,
      countRowLines: tops.size,
    };
  }, slug);
}

async function checkDocOverflow(page: Page, target: string, viewportLabel: string, vw: number) {
  const overflow = await page.evaluate((vw) => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth > 1
      ? { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, vw }
      : null;
  }, vw);
  if (overflow) {
    record(
      target,
      viewportLabel,
      "doc-overflow",
      `page scrolls horizontally: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`
    );
  }
}

async function main() {
  const browser = await chromium.launch();

  for (const target of TARGETS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      const url = `${BASE}/programs?q=${encodeURIComponent(target.name)}`;
      await page.goto(url, { waitUntil: "networkidle" });

      const linkSelector = `a[href="/programs/${target.slug}"]`;
      const found = (await page.locator(linkSelector).count()) > 0;
      if (!found) {
        record(target.slug, vp.label, "not-found", `search for "${target.name}" didn't surface the card`);
        await context.close();
        continue;
      }
      await page.locator(linkSelector).scrollIntoViewIfNeeded();

      await checkDocOverflow(page, target.slug, vp.label, vp.width);

      const measurement = await measureCard(page, target.slug);
      if (!measurement) {
        record(target.slug, vp.label, "not-found", "card disappeared between locator count and measure");
        await context.close();
        continue;
      }

      console.log(
        `${target.slug} @ ${vp.label}px: height=${measurement.height.toFixed(1)} ` +
          `labels=[${measurement.labels.join(" | ")}] countRowLines=${measurement.countRowLines}`
      );

      if (measurement.cardOverflows) {
        record(target.slug, vp.label, "card-overflow", "card scrollWidth exceeds clientWidth");
      }
      for (const label of measurement.clippedLabels) {
        record(target.slug, vp.label, "clipped-span", `count span clipped: "${label}"`);
      }
      if (measurement.countRowLines > 2) {
        record(
          target.slug,
          vp.label,
          "line-count",
          `count row wraps to ${measurement.countRowLines} lines: [${measurement.labels.join(" | ")}]`
        );
      }

      await context.close();
    }
  }

  await browser.close();

  console.log(`\n=== SUMMARY: ${problems.length} problem(s) ===`);
  for (const p of problems) {
    console.log(`  ${p.target} @ ${p.viewport}px [${p.kind}] ${p.detail}`);
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
