import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProgramJumpNav from "./ProgramJumpNav";

/**
 * Regression guard for dropping the program-name "back to top" element on mobile
 * (below Tailwind's `sm` breakpoint, 640px) while keeping the rest of the bar --
 * the jump anchors and the "Rate this program" CTA -- unconditionally rendered.
 *
 * `renderToStaticMarkup` under plain SSR (same precedent as
 * PollSummaryStrip.render.test.tsx / QuestionWithReview.render.test.tsx): "use
 * client" has no effect outside Next's bundler, and `useEffect` (the scrollspy
 * IntersectionObserver) never runs, which is fine -- this only asserts on
 * server-rendered markup and class names, not the active-section behavior.
 */

const ITEMS = [
  { id: "ratings", label: "Ratings" },
  { id: "reviews", label: "Reviews" },
  { id: "alumni", label: "Alumni" },
];

function renderHtml() {
  return renderToStaticMarkup(
    <ProgramJumpNav programName="Otzem Overseas Program" items={ITEMS} rateHref="/rate/otzem-overseas-program" />
  );
}

describe("ProgramJumpNav mobile program-name element", () => {
  it("the #top program-name link carries `hidden sm:block` -- dropped below sm, restored at sm and up", () => {
    const html = renderHtml();
    const topLink = html.match(/<a[^>]*href="#top"[^>]*>/)?.[0];
    expect(topLink).toBeDefined();
    expect(topLink).toContain("hidden");
    expect(topLink).toContain("sm:block");
    expect(topLink).not.toContain("sm:max-w-[12rem]"); // stale conditional-width class, superseded by hidden/sm:block
  });

  it("still renders the program name's text content for the sm-and-up case", () => {
    const html = renderHtml();
    expect(html).toContain("Otzem Overseas Program");
  });

  it("every jump anchor renders and carries neither `hidden` nor `sm:block`", () => {
    const html = renderHtml();
    for (const item of ITEMS) {
      const anchor = html.match(new RegExp(`<a[^>]*href="#${item.id}"[^>]*>`))?.[0];
      expect(anchor, `expected an anchor for #${item.id}`).toBeDefined();
      expect(anchor).not.toContain("hidden");
      expect(anchor).not.toContain("sm:block");
      expect(html).toContain(item.label);
    }
  });

  it("the Rate this program CTA renders unconditionally, pointing at rateHref", () => {
    const html = renderHtml();
    const cta = html.match(/<a[^>]*href="\/rate\/otzem-overseas-program"[^>]*>/)?.[0];
    expect(cta).toBeDefined();
    expect(cta).not.toContain("hidden");
    expect(html).toContain("Rate this program");
  });

  it("the nav landmark itself is unconditional and keeps its label", () => {
    const html = renderHtml();
    expect(html).toContain('aria-label="On this page"');
  });
});
