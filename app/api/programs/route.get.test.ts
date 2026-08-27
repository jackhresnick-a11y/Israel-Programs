import { describe, it, expect, vi } from "vitest";

// GET has its own file, separate from route.test.ts (which covers POST against an
// in-memory Prisma fake and only mocks @/lib/storage at its own boundary) -- mocking
// @/lib/programs here would break those tests' createProgram/parseProgramFormData
// calls. Style B (mock the lib/ boundary, not Prisma), same precedent as
// app/api/assistant/route.test.ts.
//
// This deliberately tests the worst case: listPrograms returning a row that STILL
// carries videoTranscript/transcriptTags (as if the query-layer omit in
// lib/programs.ts were somehow bypassed) -- toPublicProgram is the independent second
// layer that must strip them regardless.
const mockListPrograms = vi.fn();
vi.mock("@/lib/programs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/programs")>("@/lib/programs");
  return { ...actual, listPrograms: mockListPrograms };
});

const { GET } = await import("./route");

const SECRET_TRANSCRIPT = "SECRET RAW TRANSCRIPT do-not-leak-67890";

describe("GET /api/programs", () => {
  it("never returns videoTranscript/transcriptTags, even if listPrograms's row still carries them", async () => {
    mockListPrograms.mockResolvedValue([
      {
        id: "prog_1",
        slug: "prog-1",
        name: "Test Program",
        description: "A description.",
        adminNote: "internal note",
        contactEmailSource: "https://example.com",
        outreachCategory: "yeshiva",
        videoTranscript: SECRET_TRANSCRIPT,
        transcriptTags: ["staged-slug"],
        aiBrief: "A public brief.",
        videoUrl: "https://example.com/video",
        videoCredit: "@handle",
        videoCreditUrl: "https://instagram.com/handle",
        tags: [],
        reviews: [],
      },
    ]);

    const res = await GET(new Request("http://localhost/api/programs"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty("videoTranscript");
    expect(body[0]).not.toHaveProperty("transcriptTags");
    expect(body[0]).not.toHaveProperty("adminNote");
    expect(body[0]).not.toHaveProperty("contactEmailSource");
    expect(body[0]).not.toHaveProperty("outreachCategory");
    expect(JSON.stringify(body)).not.toContain(SECRET_TRANSCRIPT);

    // The public fields must still cross.
    expect(body[0].aiBrief).toBe("A public brief.");
    expect(body[0].videoUrl).toBe("https://example.com/video");
    expect(body[0].videoCredit).toBe("@handle");
    expect(body[0].videoCreditUrl).toBe("https://instagram.com/handle");
  });
});
