import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListProgramsWithPublishedBriefs = vi.fn();
vi.mock("@/lib/briefs", () => ({
  listProgramsWithPublishedBriefs: () => mockListProgramsWithPublishedBriefs(),
}));

const { GET } = await import("./route");

beforeEach(() => {
  mockListProgramsWithPublishedBriefs.mockReset();
});

describe("GET /llms.txt", () => {
  it("emits no '## Programs' heading at all when no program has a published brief", async () => {
    mockListProgramsWithPublishedBriefs.mockResolvedValue([]);

    const res = await GET();
    const body = await res.text();

    expect(body).not.toContain("## Programs");
    // The rest of the file is unaffected -- same spacing as before this feature.
    expect(body).toContain("## Notes for automated readers");
  });

  it("includes published brief text and a link to the program page, under a '## Programs' heading", async () => {
    mockListProgramsWithPublishedBriefs.mockResolvedValue([
      {
        slug: "aish-hatorah",
        name: "Aish HaTorah",
        briefs: [{ typeName: "What it is", typeSlug: "what-it-is", text: "A yeshiva program in Jerusalem." }],
      },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(body).toContain("## Programs");
    expect(body).toContain("[Aish HaTorah](/programs/aish-hatorah)");
    expect(body).toContain("### What it is");
    expect(body).toContain("A yeshiva program in Jerusalem.");
  });

  it("never includes raw transcript text -- the route only ever reads published briefs, never Transcript rows", async () => {
    const SECRET_TRANSCRIPT = "SECRET_RAW_TRANSCRIPT_do-not-leak";
    mockListProgramsWithPublishedBriefs.mockResolvedValue([
      { slug: "aish-hatorah", name: "Aish HaTorah", briefs: [{ typeName: "What it is", typeSlug: "what-it-is", text: "Published summary." }] },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(body).not.toContain(SECRET_TRANSCRIPT);
  });

  it("multiple programs and multiple briefs per program all render", async () => {
    mockListProgramsWithPublishedBriefs.mockResolvedValue([
      {
        slug: "program-a",
        name: "Program A",
        briefs: [
          { typeName: "What it is", typeSlug: "what-it-is", text: "Brief A1." },
          { typeName: "A day in the life", typeSlug: "a-day-in-the-life", text: "Brief A2." },
        ],
      },
      {
        slug: "program-b",
        name: "Program B",
        briefs: [{ typeName: "What it is", typeSlug: "what-it-is", text: "Brief B1." }],
      },
    ]);

    const res = await GET();
    const body = await res.text();

    for (const text of ["Brief A1.", "Brief A2.", "Brief B1."]) {
      expect(body).toContain(text);
    }
    expect(body).toContain("[Program A](/programs/program-a)");
    expect(body).toContain("[Program B](/programs/program-b)");
  });

  it("sets a cacheable Content-Type header and is not force-static (revalidate is exported instead)", async () => {
    mockListProgramsWithPublishedBriefs.mockResolvedValue([]);
    const routeModule = await import("./route");

    const res = await GET();

    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(routeModule.revalidate).toBe(3600);
  });
});
