import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Proves an archived review is actually gone from the rendered program page, not just
 * from the data layer -- the gap `lib/reviewArchive.test.ts` (array-length assertions
 * against `listPublicReviews`/`listPublicStandaloneReviews`) leaves open. This renders
 * the REAL `ReviewsSection` component (the one app/programs/[slug]/page.tsx actually
 * mounts) fed by the REAL `getProgramReviewsSummary` (the exact function the page
 * calls), via `react-dom/server`'s `renderToStaticMarkup` against a fake Prisma, and
 * asserts on the resulting HTML string.
 *
 * Scoped to `ReviewsSection` rather than the full page component: the page pulls in
 * ~10 unrelated data dependencies (references, poll summary strip, FAQ section, video
 * list) that have nothing to do with review visibility -- faking all of them would add
 * a large, fragile mock surface for zero additional coverage of archive/restore.
 *
 * `@clerk/nextjs`'s `Show`/`SignInButton` are mocked to render nothing -- `"use client"`
 * has no effect outside Next's bundler, so this is plain SSR, but ReviewsSection's
 * signed-in branch would otherwise mount `ReviewForm`, which calls `useRouter()`/
 * `useToast()` at render time with no App Router/ToastProvider context here. Rendering
 * nothing for that branch is fine: this test only exercises the reviews list, which
 * renders unconditionally above it.
 */
vi.mock("@clerk/nextjs", () => ({
  Show: () => null,
  SignInButton: () => null,
}));

vi.mock("@/lib/siteContent", () => ({
  getSiteContent: vi.fn(async () => null), // kill switch off
}));

vi.mock("@/lib/pollConfig", () => ({
  getProgramPollConfig: vi.fn(async () => ({
    bucketIds: [],
    addedQuestionIds: [],
    removedQuestionIds: [],
    resultsVisible: true,
    minResponsesToPublish: 2,
    grandfatheredQuestionIds: [],
    displayFormat: "STARS",
    placeholderOverride: null,
    editorialBestFor: null,
    pollLinkPublic: false,
  })),
  getQuestionsForProgram: vi.fn(async () => ({ core: [], extras: [] })),
}));

const POLL_MARKER = "MARKER_POLL_REVIEW_TEXT_9f3a";
const STANDALONE_MARKER = "MARKER_STANDALONE_REVIEW_TEXT_7c1e";

const { fakePrisma, resetDb, seedPollReview, seedStandaloneReview } = vi.hoisted(() => {
  type PollReviewRow = { id: string; programId: string; status: string; text: string; questionId: string; responseStatus: string };
  type ReviewRow = { id: string; programId: string; status: string; text: string; rating: number; reviewerName: string; isAnonymous: boolean; createdAt: Date };

  const db = { pollReviews: [] as PollReviewRow[], reviews: [] as ReviewRow[], seq: 0 };
  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  const fakePrisma = {
    pollReview: {
      findMany: vi.fn(async (args: { where: { programId: string; status: string; response?: { status?: string } } }) =>
        db.pollReviews
          .filter(
            (r) =>
              r.programId === args.where.programId &&
              r.status === args.where.status &&
              (args.where.response?.status === undefined || r.responseStatus === args.where.response.status)
          )
          .map((r) => ({
            text: r.text,
            questionId: r.questionId,
            question: { key: "q_1", text: "How was it?" },
            response: { yearAttended: null },
          }))
      ),
    },
    review: {
      findMany: vi.fn(async (args: { where: { programId: string; status: string } }) =>
        db.reviews
          .filter((r) => r.programId === args.where.programId && r.status === args.where.status)
          .map((r) => ({
            id: r.id,
            rating: r.rating,
            text: r.text,
            reviewerName: r.reviewerName,
            isAnonymous: r.isAnonymous,
            createdAt: r.createdAt,
          }))
      ),
    },
  };

  return {
    fakePrisma,
    resetDb() {
      db.pollReviews = [];
      db.reviews = [];
      db.seq = 0;
    },
    seedPollReview(row: Partial<PollReviewRow> & { programId: string }) {
      const full: PollReviewRow = {
        id: nextId("pollreview"),
        status: "APPROVED",
        text: POLL_MARKER,
        questionId: "q_1",
        responseStatus: "COUNTED",
        ...row,
      };
      db.pollReviews.push(full);
      return full;
    },
    seedStandaloneReview(row: Partial<ReviewRow> & { programId: string }) {
      const full: ReviewRow = {
        id: nextId("review"),
        status: "PUBLISHED",
        text: STANDALONE_MARKER,
        rating: 5,
        reviewerName: "Alum",
        isAnonymous: false,
        createdAt: new Date(),
        ...row,
      };
      db.reviews.push(full);
      return full;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { getProgramReviewsSummary } = await import("@/lib/pollResults");
const { default: ReviewsSection } = await import("@/components/ReviewsSection");

beforeEach(() => resetDb());

async function renderHtml(programId: string) {
  const summary = await getProgramReviewsSummary(programId);
  return renderToStaticMarkup(
    <ReviewsSection programId={programId} programName="Test Program" summary={summary} />
  );
}

describe("ReviewsSection rendered via the real page pipeline", () => {
  it("shows both an approved poll review and a published standalone review", async () => {
    seedPollReview({ programId: "prog_1" });
    seedStandaloneReview({ programId: "prog_1" });

    const html = await renderHtml("prog_1");
    expect(html).toContain(POLL_MARKER);
    expect(html).toContain(STANDALONE_MARKER);
  });

  it("an archived poll review is gone from the rendered HTML, not just the query result", async () => {
    const pollReview = seedPollReview({ programId: "prog_1" });
    expect(await renderHtml("prog_1")).toContain(POLL_MARKER);

    pollReview.status = "ARCHIVED";
    expect(await renderHtml("prog_1")).not.toContain(POLL_MARKER);

    pollReview.status = "APPROVED";
    expect(await renderHtml("prog_1")).toContain(POLL_MARKER);
  });

  it("an archived standalone review is gone from the rendered HTML, not just the query result", async () => {
    const review = seedStandaloneReview({ programId: "prog_1" });
    expect(await renderHtml("prog_1")).toContain(STANDALONE_MARKER);

    review.status = "ARCHIVED";
    expect(await renderHtml("prog_1")).not.toContain(STANDALONE_MARKER);

    review.status = "PUBLISHED";
    expect(await renderHtml("prog_1")).toContain(STANDALONE_MARKER);
  });

  it("archiving one review type leaves the other's rendering untouched", async () => {
    const pollReview = seedPollReview({ programId: "prog_1" });
    seedStandaloneReview({ programId: "prog_1" });

    pollReview.status = "ARCHIVED";
    const html = await renderHtml("prog_1");
    expect(html).not.toContain(POLL_MARKER);
    expect(html).toContain(STANDALONE_MARKER);
  });
});
