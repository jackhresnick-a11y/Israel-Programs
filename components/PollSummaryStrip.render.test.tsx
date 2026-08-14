import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PollSummaryStrip from "./PollSummaryStrip";
import type { PollSummaryDTO, PollSummaryQuestionDTO, PollSummaryBucketDTO } from "@/lib/pollShared";

/**
 * Proves the collapse-by-bucket behavior as assertions on actual rendered markup, not a
 * promise in a comment -- same renderToStaticMarkup precedent as
 * components/polls/QuestionWithReview.render.test.tsx. "use client" has no effect
 * outside Next's bundler, so this is plain SSR: useState just renders with its initial
 * value, which is exactly what's under test here (each bucket's default open/closed
 * state).
 *
 * The one thing this file exists to regression-guard: a collapsed bucket's panel must
 * stay in the HTML (toggled via the `hidden` attribute), never unmounted -- unmounting
 * would delete RatingRing/DescriptiveTrack's extractability sentences
 * (lib/pollSentences.ts) from the server-rendered page source, not just hide them
 * visually.
 */

vi.mock("@/lib/useModeratorRole", () => ({
  useIsModerator: () => false,
}));

function question(overrides: Partial<PollSummaryQuestionDTO> & Pick<PollSummaryQuestionDTO, "key" | "bucketId">): PollSummaryQuestionDTO {
  return {
    text: `Question ${overrides.key}`,
    mean: 4.2,
    count: 8,
    scaleType: "EVALUATIVE",
    labels: ["Not at all", "", "", "", "Completely"],
    published: true,
    ...overrides,
  };
}

function bucket(overrides: Partial<PollSummaryBucketDTO> & Pick<PollSummaryBucketDTO, "id" | "name" | "order">): PollSummaryBucketDTO {
  return {
    description: null,
    isCore: false,
    retired: false,
    ...overrides,
  };
}

const GENERAL = bucket({ id: "bucket_general", name: "General", order: 0, isCore: true });
const LOGISTICS = bucket({ id: "bucket_logistics", name: "Logistics", order: 1, description: "Housing, food, and travel." });
const RETIRED_BUCKET = bucket({ id: "bucket_retired", name: "Old cohort", order: 2, retired: true });

const summary: PollSummaryDTO = {
  visible: true,
  buckets: [GENERAL, LOGISTICS, RETIRED_BUCKET],
  questions: [
    question({ key: "q_general", bucketId: GENERAL.id }),
    question({ key: "q_logistics", bucketId: LOGISTICS.id }),
    question({ key: "q_retired", bucketId: RETIRED_BUCKET.id }),
    question({ key: "q_orphan", bucketId: "bucket_deleted" }), // unresolved bucket -> "Other"
  ],
  bestForPhrases: [],
  editorialBestFor: null,
  varianceNote: false,
  responseCount: 10,
};

function renderHtml(dto: PollSummaryDTO) {
  return renderToStaticMarkup(
    <PollSummaryStrip summary={dto} programSlug="test-program" programName="Test Program" />
  );
}

describe("PollSummaryStrip collapse-by-bucket", () => {
  it("General (isCore) renders open by default; every other bucket and Other render closed", () => {
    const html = renderHtml(summary);

    const generalPanel = html.match(/<div id="poll-bucket-panel-bucket_general"[^>]*>/)?.[0];
    const logisticsPanel = html.match(/<div id="poll-bucket-panel-bucket_logistics"[^>]*>/)?.[0];
    const retiredPanel = html.match(/<div id="poll-bucket-panel-bucket_retired"[^>]*>/)?.[0];
    const otherPanel = html.match(/<div id="poll-bucket-panel-__ungrouped"[^>]*>/)?.[0];

    expect(generalPanel).not.toContain("hidden");
    expect(logisticsPanel).toContain("hidden");
    expect(retiredPanel).toContain("hidden");
    expect(otherPanel).toContain("hidden");
  });

  it("every question's extractability sentence is present in the HTML even while its bucket is collapsed", () => {
    const html = renderHtml(summary);

    expect(html).toContain('Asked &quot;Question q_general&quot;');
    expect(html).toContain('Asked &quot;Question q_logistics&quot;');
    expect(html).toContain('Asked &quot;Question q_retired&quot;');
    expect(html).toContain('Asked &quot;Question q_orphan&quot;');
  });

  it("a retired bucket's row carries a Retired tag", () => {
    const html = renderHtml(summary);
    const nameIndex = html.indexOf("Old cohort");
    expect(nameIndex).toBeGreaterThan(-1);
    expect(html.slice(nameIndex, nameIndex + 300)).toContain("Retired");
  });

  it("a bucket with no description renders its row cleanly, with no placeholder text", () => {
    const html = renderHtml(summary);
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("a bucket's description renders when set", () => {
    const html = renderHtml(summary);
    expect(html).toContain("Housing, food, and travel.");
  });

  it("carries no mean/average number in any collapsed row's header, only the section body", () => {
    const html = renderHtml(summary);
    // Every question's mean (4.2) only ever appears inside its ringSentence/RatingRing
    // markup ("4.2 out of 5"), never as a bare number in the collapsed header row itself.
    const headerOnly = html.split('<div id="poll-bucket-panel-')[0];
    expect(headerOnly).not.toContain("4.2");
  });

  it("shows an Expand all / Collapse all toggle when there are 2+ sections", () => {
    const html = renderHtml(summary);
    expect(html).toContain("Expand all");
  });

  it("hides the toggle and every section when results aren't visible", () => {
    const html = renderHtml({ ...summary, visible: false, buckets: [], questions: [] });
    expect(html).not.toContain("Expand all");
    expect(html).not.toContain("poll-bucket-panel");
  });
});
