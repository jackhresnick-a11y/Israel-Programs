import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import QuestionWithReview from "./QuestionWithReview";
import { POLL_FIRST_COMMENT_EXPLAINER, POLL_COMMENT_PLACEHOLDER, type PollQuestionDTO } from "@/lib/pollShared";

/**
 * Proves the first-comment-box explainer and the later-box placeholder as assertions on
 * actual rendered markup, not a promise in a comment -- same renderToStaticMarkup
 * precedent as components/find/FlowStep.render.test.tsx. "use client" has no effect
 * outside Next's bundler, so this is plain SSR: useState just renders with its initial
 * value, which is exactly what's under test here (isFirst's effect on that initial value).
 */

const question: PollQuestionDTO = {
  id: "q_1",
  key: "overall",
  text: "How was your overall experience?",
  type: "STARS",
  labels: [],
  dropdownOptions: null,
  version: 1,
  status: "ACTIVE",
  scaleType: "EVALUATIVE",
  lowPhrase: null,
  highPhrase: null,
  tier: "CONTEXTUAL",
  optionKind: null,
};

function noop() {}

/** React's SSR text-node escaping turns a literal `'` into `&#x27;` (but leaves the
 * curly quotes and em dash in POLL_FIRST_COMMENT_EXPLAINER alone, since those aren't
 * HTML-special) -- so a raw substring match against the source constant fails on
 * "it's". Mirror that one escape rather than loosening the assertion. */
function expectedInHtml(s: string): string {
  return s.replace(/'/g, "&#x27;");
}

describe("QuestionWithReview render", () => {
  it("isFirst=true: comment box starts open, explainer renders above the textarea, no 'Add a comment' trigger", () => {
    const html = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText=""
        onReviewTextChange={noop}
        isFirst
      />
    );
    expect(html).toContain(expectedInHtml(POLL_FIRST_COMMENT_EXPLAINER));
    expect(html).toContain("<textarea");
    expect(html).not.toContain("Add a comment");
    // Explainer appears before the textarea tag in document order.
    expect(html.indexOf(expectedInHtml(POLL_FIRST_COMMENT_EXPLAINER))).toBeLessThan(html.indexOf("<textarea"));
  });

  it("isFirst=false: comment box starts collapsed behind 'Add a comment', no explainer, no textarea yet", () => {
    const html = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText=""
        onReviewTextChange={noop}
        isFirst={false}
      />
    );
    expect(html).toContain("Add a comment");
    expect(html).not.toContain(expectedInHtml(POLL_FIRST_COMMENT_EXPLAINER));
    expect(html).not.toContain("<textarea");
  });

  it("isFirst=false with existing reviewText: starts open with the placeholder, still no explainer", () => {
    const html = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText="Already wrote something"
        onReviewTextChange={noop}
        isFirst={false}
      />
    );
    expect(html).toContain("<textarea");
    expect(html).not.toContain(expectedInHtml(POLL_FIRST_COMMENT_EXPLAINER));
    expect(html).toContain(POLL_COMMENT_PLACEHOLDER);
  });

  it("both open states render rows=\"4\" -- the ~4-row minimum, not the old 1-2 line box", () => {
    const firstHtml = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText=""
        onReviewTextChange={noop}
        isFirst
      />
    );
    expect(firstHtml).toContain('rows="4"');

    const laterHtml = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText="already open"
        onReviewTextChange={noop}
        isFirst={false}
      />
    );
    expect(laterHtml).toContain('rows="4"');
  });

  it("carries no character counter or required attribute anywhere in the markup", () => {
    const html = renderToStaticMarkup(
      <QuestionWithReview
        question={question}
        value={null}
        onValueChange={noop}
        na={false}
        onNaChange={noop}
        reviewText=""
        onReviewTextChange={noop}
        isFirst
      />
    );
    expect(html).not.toContain("required");
    expect(html).not.toMatch(/\d+\s*\/\s*\d+/); // no "N / 1000"-style counter
  });
});
