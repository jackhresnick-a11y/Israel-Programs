import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Clerk session mock (same pattern as lib/roles.test.ts) ----------------
const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

function mockSession(userId: string | null, role?: "user" | "moderator" | "admin" | "banned") {
  mockAuth.mockResolvedValue({ userId });
  mockCurrentUser.mockResolvedValue(userId ? { publicMetadata: { role } } : null);
}

// --- In-memory Prisma fake (same shape/precedent as lib/folders.test.ts) ---
// Only implements what createProgram's write path actually touches:
// program.findUnique (uniqueSlug's collision check), program.create, and
// programExportRow.create (the fire-and-forget export log write). Tags are
// deliberately left unimplemented -- every test below submits an empty tags
// field, and resolveTagsByName([]) returns early without calling prisma.
const { fakePrisma, resetDb } = vi.hoisted(() => {
  const db = {
    programs: [] as Record<string, unknown>[],
    exportRows: [] as unknown[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  const fakePrisma = {
    program: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        db.programs.find((p) => p.slug === where.slug) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const { tags, ...rest } = data as { tags?: { connect: { id: string }[] } } & Record<string, unknown>;
        const row = {
          id: nextId("prog"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...rest,
          tags: tags?.connect ?? [],
        };
        db.programs.push(row);
        return row;
      },
    },
    programExportRow: {
      create: async ({ data }: { data: unknown }) => {
        db.exportRows.push(data);
        return data;
      },
    },
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
      db.exportRows = [];
      db.seq = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

// --- Logo storage mock ------------------------------------------------------
// UploadError is re-exported for real so `err instanceof UploadError` in the
// route still matches; only saveLogo's disk write is swapped out.
const mockSaveLogo = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, saveLogo: (file: File) => mockSaveLogo(file) };
});

const { POST } = await import("./route");

function buildFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    name: "Yeshivat Lev Aharon",
    description:
      "A comprehensive learning program combining traditional text study with modern life-skills workshops. Students engage in daily chavruta sessions, weekly trips around the country, and mentorship from senior staff.",
    goodFor: "x".repeat(1900),
    organization: "Lev Ahron",
    location: "Har Nof, Jerusalem",
    durationType: "TEN_DAY",
    durationText: "",
    cost: "",
    signupInstructions: "",
    signupUrl: "",
    contactEmail: "",
    contactPhone: "",
    contactWebsite: "",
    hasScholarship: "false",
    hasCollegeCredit: "false",
    travelType: "",
    tags: "",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) fd.set(key, value);
  return fd;
}

function buildRequest(formData: FormData) {
  return new Request("http://localhost/api/programs", { method: "POST", body: formData });
}

beforeEach(() => {
  resetDb();
  mockSaveLogo.mockReset();
  mockSession("user_1", "user");
});

describe("POST /api/programs", () => {
  it("creates a program from a payload resembling a real public submission (long free-text fields, new organization name, free-form location)", async () => {
    const res = await POST(buildRequest(buildFormData()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("yeshivat-lev-aharon");
    expect(body.status).toBe("PENDING");
    expect(body.organization).toBe("Lev Ahron");
    expect(body.location).toBe("Har Nof, Jerusalem");
  });

  it("rejects an over-length 'good for' field with a specific field-level error instead of the generic banner", async () => {
    const res = await POST(buildRequest(buildFormData({ goodFor: "x".repeat(2001) })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("goodFor");
    expect(body.error).toMatch(/character/i);
    expect(body.error).not.toMatch(/failed to create program/i);
  });

  it("creates the program anyway when logo storage fails (e.g. the read-only production filesystem), returning a warning instead of a 500", async () => {
    mockSaveLogo.mockRejectedValue(new Error("EROFS: read-only file system, mkdir 'public/uploads/logos'"));
    const fd = buildFormData();
    fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.warning).toMatch(/logo/i);
    expect(body.slug).toBe("yeshivat-lev-aharon");
  });

  it("rejects an unsupported logo file type with a field-level error, without creating the program", async () => {
    const { UploadError } = await import("@/lib/storage");
    mockSaveLogo.mockRejectedValue(new UploadError("Unsupported file type: image/svg+xml"));
    const fd = buildFormData();
    fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.svg", { type: "image/svg+xml" }));

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("logo");
  });

  it("returns 401 for a signed-out submitter", async () => {
    mockSession(null);
    const res = await POST(buildRequest(buildFormData()));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a banned submitter", async () => {
    mockSession("user_1", "banned");
    const res = await POST(buildRequest(buildFormData()));
    expect(res.status).toBe(403);
  });
});
