import { describe, it, expect, vi, beforeEach } from "vitest";

// Same hoisted-fake pattern as the sibling app/api/admin/transcripts/route.test.ts --
// this route's whole point is deriving provider/watchUrl from videoUrl via the real
// parseVideoLink, so the test exercises that against real DB-shaped rows rather than
// mocking lib/videoEmbed.ts itself.
const { fakePrisma, resetDb, seedProgram } = vi.hoisted(() => {
  type Row = {
    id: string;
    slug: string;
    name: string;
    videoUrl: string | null;
    websiteLanguage: string | null;
  };
  const db: { programs: Row[] } = { programs: [] };

  const fakePrisma = {
    program: {
      findMany: async () => db.programs,
    },
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
    },
    seedProgram: (row: Row) => db.programs.push(row),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const requireRole = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({ requireRole }));

const { GET } = await import("./route");

beforeEach(() => {
  resetDb();
  requireRole.mockReset();
  requireRole.mockResolvedValue({ ok: true, status: 200 });
});

describe("GET /api/admin/transcripts/slugs authorization", () => {
  it("rejects a non-admin server-side", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 403 });
    seedProgram({ id: "p1", slug: "aish-hatorah", name: "Aish HaTorah", videoUrl: null, websiteLanguage: null });

    const res = await GET();

    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/transcripts/slugs -- provider derivation", () => {
  it("derives provider/watchUrl for a parseable YouTube videoUrl", async () => {
    seedProgram({
      id: "p1",
      slug: "some-program",
      name: "Some Program",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      websiteLanguage: "ENGLISH",
    });

    const res = await GET();
    const rows = await res.json();

    expect(rows).toEqual([
      {
        id: "p1",
        slug: "some-program",
        name: "Some Program",
        provider: "youtube",
        watchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        websiteLanguage: "ENGLISH",
      },
    ]);
  });

  it("derives provider/watchUrl for a parseable Instagram videoUrl", async () => {
    seedProgram({
      id: "p2",
      slug: "another-program",
      name: "Another Program",
      videoUrl: "https://www.instagram.com/reel/CzTWjU5K8Hl/",
      websiteLanguage: null,
    });

    const res = await GET();
    const rows = await res.json();

    expect(rows).toEqual([
      {
        id: "p2",
        slug: "another-program",
        name: "Another Program",
        provider: "instagram",
        watchUrl: "https://www.instagram.com/reel/CzTWjU5K8Hl/",
        websiteLanguage: null,
      },
    ]);
  });

  it("reports provider: null for a junk videoUrl rather than throwing", async () => {
    seedProgram({
      id: "p3",
      slug: "junk-program",
      name: "Junk Program",
      videoUrl: "not a real url at all",
      websiteLanguage: null,
    });

    const res = await GET();
    const rows = await res.json();

    expect(res.status).toBe(200);
    expect(rows).toEqual([
      {
        id: "p3",
        slug: "junk-program",
        name: "Junk Program",
        provider: null,
        watchUrl: null,
        websiteLanguage: null,
      },
    ]);
  });

  it("reports provider: null for a program with no videoUrl", async () => {
    seedProgram({
      id: "p4",
      slug: "no-video-program",
      name: "No Video Program",
      videoUrl: null,
      websiteLanguage: null,
    });

    const res = await GET();
    const rows = await res.json();

    expect(rows).toEqual([
      {
        id: "p4",
        slug: "no-video-program",
        name: "No Video Program",
        provider: null,
        watchUrl: null,
        websiteLanguage: null,
      },
    ]);
  });
});
