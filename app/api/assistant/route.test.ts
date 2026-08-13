import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Access/gating mocks -- not this PR's concern, just enough to reach the
// retrieval logic under test. -----------------------------------------------
const mockGetCurrentRole = vi.fn();
vi.mock("@/lib/roles", () => ({ getCurrentRole: () => mockGetCurrentRole() }));

const mockGetSiteContent = vi.fn();
vi.mock("@/lib/siteContent", () => ({ getSiteContent: (key: string) => mockGetSiteContent(key) }));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: () => true,
  getClientIp: () => "127.0.0.1",
}));

// --- Program catalog + live tag vocabulary -- mocked at the module boundary
// app/api/assistant/route.ts itself imports (@/lib/programs), same precedent
// as app/api/programs/route.test.ts mocking @/lib/storage at its own call
// boundary rather than reaching further down into Prisma. --------------------
const mockListPrograms = vi.fn();
const mockListAllTags = vi.fn();
vi.mock("@/lib/programs", () => ({
  listPrograms: (...args: unknown[]) => mockListPrograms(...args),
  listAllTags: () => mockListAllTags(),
}));

// --- Poll/review enrichment -- mocked at @/lib/pollResults, the exact module
// boundary the route imports. getProgramPollSummary/getProgramReviewsSummary
// own the visible/published/approved-COUNTED gating themselves (untouched by
// this PR); what these tests verify is that the ROUTE never reaches past what
// these functions return -- it has no other path to poll/review data. -------
const mockGetProgramPollSummary = vi.fn();
const mockGetProgramReviewsSummary = vi.fn();
vi.mock("@/lib/pollResults", () => ({
  getProgramPollSummary: (id: string) => mockGetProgramPollSummary(id),
  getProgramReviewsSummary: (id: string) => mockGetProgramReviewsSummary(id),
}));

// --- AI provider -- fully controllable fake so tests can drive exactly what
// a "provider" (real or Null) returns, including an adversarial hallucinated
// slug for the re-validation test. -------------------------------------------
const mockParseSearchQuery = vi.fn();
const mockRecommendPrograms = vi.fn();
vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    parseSearchQuery: (...args: unknown[]) => mockParseSearchQuery(...args),
    recommendPrograms: (...args: unknown[]) => mockRecommendPrograms(...args),
  }),
}));

const { POST } = await import("./route");

const VOCAB = [
  { slug: "tech", name: "Tech", category: "essence" },
  { slug: "religious", name: "Religious", category: "affiliation" },
];

function makeProgram(overrides: Record<string, unknown> = {}) {
  return {
    id: "prog_1",
    slug: "aardvark-israel",
    name: "Aardvark Israel",
    location: "Tel Aviv",
    durationType: "GAP_YEAR",
    description: "A tech-focused gap year program.",
    tags: [{ name: "Tech", slug: "tech" }],
    ...overrides,
  };
}

const EMPTY_POLL_SUMMARY = { visible: false, bestForPhrases: [], responseCount: 0 };
const EMPTY_REVIEWS_SUMMARY = { pollGroups: [], promptGroups: [], standaloneReviews: [] };

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentRole.mockResolvedValue("user");
  mockGetSiteContent.mockResolvedValue("true");
  mockListAllTags.mockResolvedValue(VOCAB);
  mockListPrograms.mockResolvedValue([makeProgram()]);
  mockParseSearchQuery.mockResolvedValue({});
  mockGetProgramPollSummary.mockResolvedValue(EMPTY_POLL_SUMMARY);
  mockGetProgramReviewsSummary.mockResolvedValue(EMPTY_REVIEWS_SUMMARY);
  mockRecommendPrograms.mockResolvedValue({
    reply: "Here's what I found.",
    picks: [{ slug: "aardvark-israel", why: "It's a tech program." }],
    alternatives: [],
    recommendedSlugs: ["aardvark-israel"],
  });
});

describe("POST /api/assistant -- never-empty retrieval", () => {
  it("passes non-empty candidates to the provider even when the parsed query matches nothing", async () => {
    // Simulates the reported bug: a message whose parsed facets don't match any tag
    // on the one published program. rankPrograms must still rank (never drop) it, so
    // the provider is handed a non-empty candidate list rather than an empty one.
    mockParseSearchQuery.mockResolvedValue({ tags: ["religious"] });

    await POST(makeRequest({ message: "gap year programs post 12th grade that are tech internships" }));

    expect(mockRecommendPrograms).toHaveBeenCalledTimes(1);
    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].slug).toBe("aardvark-israel");
    // The unmet "religious" constraint is surfaced, not hidden -- the candidate still
    // appears, it's just honestly labeled as not fully matching.
    expect(candidates[0].unmetLabels).toContain("Religious");
  });

  it("returns non-empty picks in the response, never the old 'I couldn't find any' message", async () => {
    const res = await POST(makeRequest({ message: "something totally unrelated" }));
    const data = await res.json();
    expect(data.programs.length).toBeGreaterThan(0);
    expect(data.reply).not.toMatch(/couldn.t find any/i);
  });

  it("candidates are empty only when the published catalog itself is empty", async () => {
    mockListPrograms.mockResolvedValue([]);
    mockRecommendPrograms.mockResolvedValue({
      reply: "There are no published programs in the directory right now.",
      picks: [],
      alternatives: [],
      recommendedSlugs: [],
    });

    await POST(makeRequest({ message: "anything" }));
    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates).toEqual([]);
  });
});

describe("POST /api/assistant -- poll data gating", () => {
  it("a below-threshold (not-visible) poll result never reaches the candidate payload", async () => {
    mockGetProgramPollSummary.mockResolvedValue({ visible: false, bestForPhrases: [], responseCount: 2 });

    await POST(makeRequest({ message: "tech program" }));

    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates[0].bestForPhrases).toEqual([]);
  });

  it("a published/visible bestForPhrase does reach the candidate payload", async () => {
    mockGetProgramPollSummary.mockResolvedValue({
      visible: true,
      bestForPhrases: ["a strong sense of community"],
      responseCount: 12,
    });

    await POST(makeRequest({ message: "tech program" }));

    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates[0].bestForPhrases).toEqual(["a strong sense of community"]);
  });
});

describe("POST /api/assistant -- review data gating", () => {
  it("an unapproved/unpublished review never reaches the candidate payload", async () => {
    // getProgramReviewsSummary itself only ever returns APPROVED reviews on a COUNTED
    // response (its own gate, untouched by this PR) -- simulating the gated-closed
    // state (kill switch / not visible) here confirms the route has no separate path
    // that could bypass it.
    mockGetProgramReviewsSummary.mockResolvedValue(EMPTY_REVIEWS_SUMMARY);

    await POST(makeRequest({ message: "tech program" }));

    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates[0].alumniQuotes).toEqual([]);
  });

  it("approved poll reviews and standalone reviews both surface as alumniQuotes, capped at 3", async () => {
    mockGetProgramReviewsSummary.mockResolvedValue({
      pollGroups: [
        { questionKey: "q1", questionText: "Q1", reviews: [{ text: "Loved it", yearAttended: 2024 }] },
        { questionKey: "q2", questionText: "Q2", reviews: [{ text: "Life changing", yearAttended: 2023 }] },
      ],
      promptGroups: [],
      standaloneReviews: [
        { id: "r1", rating: 5, text: "Would recommend", reviewerName: "Alum", createdAt: new Date() },
        { id: "r2", rating: 4, text: "Fourth quote should be dropped", reviewerName: null, createdAt: new Date() },
      ],
    });

    await POST(makeRequest({ message: "tech program" }));

    const { candidates } = mockRecommendPrograms.mock.calls[0][0];
    expect(candidates[0].alumniQuotes).toHaveLength(3);
    expect(candidates[0].alumniQuotes).toEqual(["Loved it", "Life changing", "Would recommend"]);
  });
});

describe("POST /api/assistant -- slug re-validation", () => {
  it("drops a recommended pick whose slug isn't in this request's own candidate set", async () => {
    mockRecommendPrograms.mockResolvedValue({
      reply: "Here you go.",
      picks: [
        { slug: "aardvark-israel", why: "Real candidate." },
        { slug: "hallucinated-program", why: "This program was never in the candidate list." },
      ],
      alternatives: [{ slug: "also-made-up", line: "Also hallucinated." }],
      recommendedSlugs: ["aardvark-israel", "hallucinated-program", "also-made-up"],
    });

    const res = await POST(makeRequest({ message: "tech program" }));
    const data = await res.json();

    const slugs = data.programs.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(["aardvark-israel"]);
    expect(slugs).not.toContain("hallucinated-program");
    expect(slugs).not.toContain("also-made-up");
  });
});
