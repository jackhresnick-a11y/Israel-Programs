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

// --- In-memory Prisma fake --------------------------------------------------
// Only implements what updateProgram/createProgramEdit and the route's own
// findUnique actually touch. Tags are left unimplemented -- every test below
// submits an empty tags field, and resolveTagsByName([]) returns early
// without calling prisma.
const { fakePrisma, resetDb, seedProgram, setDeleteError } = vi.hoisted(() => {
  const db = {
    programs: [] as Record<string, unknown>[],
    programEdits: [] as Record<string, unknown>[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  // Set by individual DELETE tests to make the next program.delete() call throw a
  // specific error instead of actually deleting -- lets tests simulate the
  // OutreachEmail RESTRICT violation and a missing row without a real database.
  let deleteError: Error | null = null;

  const fakePrisma = {
    program: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string; status?: string };
        include?: { reviews?: { where: { status: string } } };
      }) => {
        const row = db.programs.find((p) => p.id === where.id);
        if (!row) return null;
        if (where.status !== undefined && row.status !== where.status) return null;
        if (!include?.reviews) return row;
        const allReviews = (row.reviews as Record<string, unknown>[] | undefined) ?? [];
        const reviews = allReviews.filter((r) => r.status === include.reviews!.where.status);
        return { ...row, reviews };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = db.programs.find((p) => p.id === where.id);
        if (!row) throw new Error(`No Program found for id ${where.id}`);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.programs.find((p) => p.id === where.id);
        if (!row) throw new Error(`No Program found for id ${where.id}`);
        const { tags, ...rest } = data as { tags?: { connect: { id: string }[] } } & Record<string, unknown>;
        Object.assign(row, rest);
        if (tags) row.tags = tags.connect;
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        if (deleteError) {
          const err = deleteError;
          deleteError = null;
          throw err;
        }
        const index = db.programs.findIndex((p) => p.id === where.id);
        if (index === -1) throw new Error(`No Program found for id ${where.id}`);
        const [row] = db.programs.splice(index, 1);
        return row;
      },
    },
    programEdit: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId("edit"), createdAt: new Date(), status: "PENDING", ...data };
        db.programEdits.push(row);
        return row;
      },
    },
  };

  function seedProgram(overrides: Record<string, unknown> = {}) {
    const row = {
      id: nextId("prog"),
      name: "Existing Program",
      slug: "existing-program",
      description: "Original description.",
      goodFor: null,
      organization: null,
      location: null,
      durationType: "TEN_DAY",
      durationText: null,
      cost: null,
      signupInstructions: null,
      signupUrl: null,
      contactEmail: null,
      contactPhone: null,
      contactWebsite: null,
      hasScholarship: false,
      hasCollegeCredit: false,
      travelType: null,
      logoUrl: null,
      status: "PUBLISHED",
      createdById: "user_owner",
      tags: [] as unknown[],
      videos: [] as unknown[],
      reviews: [] as unknown[],
      ...overrides,
    };
    db.programs.push(row);
    return row;
  }

  return {
    fakePrisma,
    resetDb: () => {
      db.programs = [];
      db.programEdits = [];
      db.seq = 0;
    },
    seedProgram,
    setDeleteError: (err: Error | null) => {
      deleteError = err;
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

const { GET, PATCH, DELETE } = await import("./route");

function buildFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    name: "Existing Program",
    description: "An updated description with more detail about the program.",
    goodFor: "",
    organization: "",
    location: "",
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
  return new Request("http://localhost/api/programs/prog_1", { method: "PATCH", body: formData });
}

function callPatch(formData: FormData, id: string) {
  return PATCH(buildRequest(formData), { params: Promise.resolve({ id }) });
}

function callDelete(id: string) {
  return DELETE(new Request(`http://localhost/api/programs/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

function callGet(id: string) {
  return GET(new Request(`http://localhost/api/programs/${id}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  resetDb();
  mockSaveLogo.mockReset();
  setDeleteError(null);
});

// Reproduces the exact shape @prisma/adapter-pg throws for a Postgres RESTRICT
// violation: a plain Error named "DriverAdapterError" with the pg error code on
// .cause.code, NOT a PrismaClientKnownRequestError (Prisma's known-error table only
// maps 23503, not 23001). This is the real production error from
// OutreachEmail_programId_fkey's ON DELETE RESTRICT constraint.
function restrictViolationError() {
  const err = new Error(
    'update or delete on table "Program" violates RESTRICT setting of foreign key constraint "OutreachEmail_programId_fkey" on table "OutreachEmail"'
  );
  err.name = "DriverAdapterError";
  (err as unknown as { cause: { code: string } }).cause = { code: "23001" };
  return err;
}

describe("GET /api/programs/[id]", () => {
  it("only returns PUBLISHED reviews -- an archived review's include filter still reads `status: \"PUBLISHED\"`, a bare equality, so archiving hides it here too with no route change", async () => {
    const program = seedProgram({
      reviews: [
        { id: "rev_pub", rating: 5, text: "Great!", reviewerName: "Alum A", isAnonymous: false, createdAt: new Date(), status: "PUBLISHED" },
        { id: "rev_archived", rating: 4, text: "Fine.", reviewerName: "Alum B", isAnonymous: false, createdAt: new Date(), status: "ARCHIVED" },
        { id: "rev_pending", rating: 3, text: "Meh.", reviewerName: "Alum C", isAnonymous: false, createdAt: new Date(), status: "PENDING" },
      ],
    });

    const res = await callGet(program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].id).toBe("rev_pub");
  });

  it("a non-PUBLISHED program 404s regardless of its reviews", async () => {
    const program = seedProgram({ status: "ARCHIVED" });
    const res = await callGet(program.id as string);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/programs/[id]", () => {
  it("moderator: applies the edit immediately, no logo attached", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");

    const res = await callPatch(buildFormData({ description: "A moderator-edited description." }), program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(false);
    expect(body.program.description).toBe("A moderator-edited description.");
    expect(body.warning).toBeUndefined();
  });

  it("non-moderator: queues the edit for review, no logo attached", async () => {
    const program = seedProgram();
    mockSession("user_1", "user");

    const res = await callPatch(buildFormData(), program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(true);
    expect(body.slug).toBe("existing-program");
    expect(body.warning).toBeUndefined();
  });

  it("moderator: logo storage failure (e.g. read-only production filesystem) doesn't block the edit -- applies without the logo change and returns a warning", async () => {
    const program = seedProgram({ logoUrl: "/uploads/logos/old.png" });
    mockSession("mod_1", "moderator");
    mockSaveLogo.mockRejectedValue(new Error("EROFS: read-only file system, mkdir 'public/uploads/logos'"));

    const fd = buildFormData({ description: "Updated while logo upload is broken." });
    fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));

    const res = await callPatch(fd, program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(false);
    expect(body.warning).toMatch(/logo/i);
    expect(body.program.description).toBe("Updated while logo upload is broken.");
    // logoUrl is left untouched (updateProgram only overwrites it when a new one was set)
    expect(body.program.logoUrl).toBe("/uploads/logos/old.png");
  });

  it("non-moderator: logo storage failure doesn't block queuing the edit -- returns a warning and the queued edit carries no logo change", async () => {
    const program = seedProgram();
    mockSession("user_1", "user");
    mockSaveLogo.mockRejectedValue(new Error("EROFS: read-only file system, mkdir 'public/uploads/logos'"));

    const fd = buildFormData();
    fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));

    const res = await callPatch(fd, program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(true);
    expect(body.warning).toMatch(/logo/i);
  });

  it("rejects an unsupported logo file type with a 400 and does not apply the edit", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");
    const { UploadError } = await import("@/lib/storage");
    mockSaveLogo.mockRejectedValue(new UploadError("Unsupported file type: image/svg+xml"));

    const fd = buildFormData({ description: "Should not be applied." });
    fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.svg", { type: "image/svg+xml" }));

    const res = await callPatch(fd, program.id as string);
    expect(res.status).toBe(400);
    expect(program.description).toBe("Original description.");
  });
});

describe("DELETE /api/programs/[id]", () => {
  it("non-moderator: 401/403, program is untouched", async () => {
    const program = seedProgram();
    mockSession("user_1", "user");

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(403);
  });

  it("unauthenticated: 401", async () => {
    const program = seedProgram();
    mockSession(null);

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(401);
  });

  it("moderator: deletes the program", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("moderator: an OutreachEmail RESTRICT violation (Postgres 23001, surfaced as an unmapped DriverAdapterError, not a Prisma P-code) returns 409 with an actionable message, not a bare 500", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");
    setDeleteError(restrictViolationError());

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/outreach/i);
  });

  it("moderator: a Prisma P2003 foreign-key error also returns 409 (in case a future Prisma version maps 23001 to P2003)", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");
    const { Prisma } = await import("@/app/generated/prisma/client");
    setDeleteError(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
        code: "P2003",
        clientVersion: "test",
      })
    );

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(409);
  });

  it("moderator: deleting an already-gone program (P2025) returns 404, not a bare 500", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");
    const { Prisma } = await import("@/app/generated/prisma/client");
    setDeleteError(
      new Prisma.PrismaClientKnownRequestError("An operation failed because it depends on one or more records that were required but not found.", {
        code: "P2025",
        clientVersion: "test",
      })
    );

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(404);
  });

  it("moderator: an unexpected error returns a generic 500, not an unhandled rejection", async () => {
    const program = seedProgram();
    mockSession("mod_1", "moderator");
    setDeleteError(new Error("connection reset"));

    const res = await callDelete(program.id as string);
    expect(res.status).toBe(500);
  });
});
