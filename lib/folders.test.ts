import { describe, it, expect, beforeEach, vi } from "vitest";

// --- In-memory Prisma fake -------------------------------------------------
// Mirrors just enough of the Prisma surface lib/folders.ts actually calls
// (findFirst/findMany/findUnique/count/create/updateMany/deleteMany/
// $transaction) to exercise the ownership logic without a real database.
// "byte-for-byte unchanged" assertions below compare snapshots of this store,
// not just response status codes.
const { fakePrisma, resetDb, seedProgram, seedFolder, seedFolderItem, snapshot } = vi.hoisted(() => {
  type FolderRow = {
    id: string;
    ownerId: string;
    name: string;
    isDefault: boolean;
    shareToken: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  type FolderItemRow = { id: string; folderId: string; programId: string | null; createdAt: Date };
  type ProgramRow = {
    id: string;
    name: string;
    slug: string;
    description: string;
    logoUrl: string | null;
    location: string | null;
    organization: string | null;
    durationType: string;
    status: string;
    adminNote: string | null;
    contactEmailSource: string | null;
    outreachCategory: string | null;
  };

  const db = {
    folders: [] as FolderRow[],
    folderItems: [] as FolderItemRow[],
    programs: [] as ProgramRow[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  function scalarMatch(value: unknown, cond: unknown): boolean {
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ("not" in c) return value !== c.not;
      if ("in" in c) return (c.in as unknown[]).includes(value);
      throw new Error(`fake prisma: unsupported operator ${JSON.stringify(cond)}`);
    }
    return value === cond;
  }

  function matchesFolder(row: FolderRow, where: Record<string, unknown> = {}): boolean {
    if ("id" in where && !scalarMatch(row.id, where.id)) return false;
    if ("ownerId" in where && !scalarMatch(row.ownerId, where.ownerId)) return false;
    if ("isDefault" in where && !scalarMatch(row.isDefault, where.isDefault)) return false;
    if ("shareToken" in where && !scalarMatch(row.shareToken, where.shareToken)) return false;
    return true;
  }

  function matchesFolderItem(row: FolderItemRow, where: Record<string, unknown> = {}): boolean {
    if ("id" in where && !scalarMatch(row.id, where.id)) return false;
    if ("folderId" in where && !scalarMatch(row.folderId, where.folderId)) return false;
    if ("programId" in where && !scalarMatch(row.programId, where.programId)) return false;
    if ("folder" in where) {
      const folder = db.folders.find((f) => f.id === row.folderId);
      if (!folder || !matchesFolder(folder, where.folder as Record<string, unknown>)) return false;
    }
    return true;
  }

  function matchesProgram(row: ProgramRow, where: Record<string, unknown> = {}): boolean {
    if ("id" in where && !scalarMatch(row.id, where.id)) return false;
    if ("status" in where && !scalarMatch(row.status, where.status)) return false;
    return true;
  }

  function hydrateItem(row: FolderItemRow, include: Record<string, unknown> = {}) {
    const result: Record<string, unknown> = { ...row };
    if (include.program) {
      result.program = row.programId ? (db.programs.find((p) => p.id === row.programId) ?? null) : null;
    }
    return result;
  }

  function hydrateFolder(row: FolderRow, include: Record<string, unknown> = {}) {
    const result: Record<string, unknown> = { ...row };
    if (include.items) {
      const itemsInclude = (include.items as { include?: Record<string, unknown> }).include ?? {};
      result.items = db.folderItems
        .filter((i) => i.folderId === row.id)
        .map((i) => hydrateItem(i, itemsInclude));
    }
    return result;
  }

  const folderTable = {
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      db.folders.filter((f) => matchesFolder(f, where)).map((f) => ({ ...f })),
    findFirst: async ({
      where,
      include,
    }: { where?: Record<string, unknown>; include?: Record<string, unknown> } = {}) => {
      const row = db.folders.find((f) => matchesFolder(f, where));
      return row ? hydrateFolder(row, include) : null;
    },
    findUnique: async ({
      where,
      include,
    }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
      const row = db.folders.find((f) => matchesFolder(f, where));
      return row ? hydrateFolder(row, include) : null;
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      db.folders.filter((f) => matchesFolder(f, where)).length,
    create: async ({ data }: { data: Partial<FolderRow> & { ownerId: string; name: string } }) => {
      const row: FolderRow = {
        id: nextId("folder"),
        ownerId: data.ownerId,
        name: data.name,
        isDefault: data.isDefault ?? false,
        shareToken: data.shareToken ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.folders.push(row);
      return { ...row };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Partial<FolderRow>;
    }) => {
      const matches = db.folders.filter((f) => matchesFolder(f, where));
      for (const f of matches) Object.assign(f, data, { updatedAt: new Date() });
      return { count: matches.length };
    },
    deleteMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const matches = db.folders.filter((f) => matchesFolder(f, where));
      const ids = new Set(matches.map((f) => f.id));
      db.folders = db.folders.filter((f) => !ids.has(f.id));
      db.folderItems = db.folderItems.filter((i) => !ids.has(i.folderId)); // mirrors onDelete: Cascade
      return { count: matches.length };
    },
  };

  const folderItemTable = {
    findMany: async ({
      where,
      include,
    }: { where?: Record<string, unknown>; include?: Record<string, unknown> } = {}) =>
      db.folderItems.filter((i) => matchesFolderItem(i, where)).map((i) => hydrateItem(i, include)),
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const row = db.folderItems.find((i) => matchesFolderItem(i, where));
      return row ? { ...row } : null;
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      db.folderItems.filter((i) => matchesFolderItem(i, where)).length,
    create: async ({ data }: { data: { folderId: string; programId?: string | null } }) => {
      const row: FolderItemRow = {
        id: nextId("item"),
        folderId: data.folderId,
        programId: data.programId ?? null,
        createdAt: new Date(),
      };
      db.folderItems.push(row);
      return { ...row };
    },
    deleteMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const matches = db.folderItems.filter((i) => matchesFolderItem(i, where));
      const ids = new Set(matches.map((i) => i.id));
      db.folderItems = db.folderItems.filter((i) => !ids.has(i.id));
      return { count: matches.length };
    },
  };

  const programTable = {
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const row = db.programs.find((p) => matchesProgram(p, where));
      return row ? { ...row } : null;
    },
  };

  const fakePrisma: {
    folder: typeof folderTable;
    folderItem: typeof folderItemTable;
    program: typeof programTable;
    $transaction: (cb: (tx: unknown) => unknown) => Promise<unknown>;
  } = {
    folder: folderTable,
    folderItem: folderItemTable,
    program: programTable,
    $transaction: async (cb) => cb(fakePrisma),
  };

  function resetDb() {
    db.folders = [];
    db.folderItems = [];
    db.programs = [];
    db.seq = 0;
  }

  function seedProgram(overrides: Partial<ProgramRow> = {}): ProgramRow {
    const row: ProgramRow = {
      id: nextId("program"),
      name: "Test Program",
      slug: `test-program-${db.seq}`,
      description: "A program.",
      logoUrl: null,
      location: "Jerusalem",
      organization: "Test Org",
      durationType: "SUMMER",
      status: "PUBLISHED",
      adminNote: null,
      contactEmailSource: null,
      outreachCategory: null,
      ...overrides,
    };
    db.programs.push(row);
    return row;
  }

  function seedFolder(ownerId: string, overrides: Partial<FolderRow> = {}): FolderRow {
    const row: FolderRow = {
      id: nextId("folder"),
      ownerId,
      name: "My Folder",
      isDefault: false,
      shareToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    db.folders.push(row);
    return row;
  }

  function seedFolderItem(folderId: string, programId: string | null): FolderItemRow {
    const row: FolderItemRow = { id: nextId("item"), folderId, programId, createdAt: new Date() };
    db.folderItems.push(row);
    return row;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({ folders: db.folders, folderItems: db.folderItems }));
  }

  return { fakePrisma, resetDb, seedProgram, seedFolder, seedFolderItem, snapshot };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const {
  listFolders,
  getMembership,
  getFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  addProgramToFolder,
  removeProgramFromFolder,
  saveToDefaultFolder,
  clearUnavailableItems,
  mintShareToken,
  revokeShareToken,
  revokeAllSharesForUser,
  getSharedFolder,
  MAX_FOLDERS_PER_USER,
  MAX_ITEMS_PER_FOLDER,
} = await import("./folders");

const OWNER = "user_A";
const ATTACKER = "user_B";

beforeEach(() => {
  resetDb();
});

describe("positive path -- owner acting on their own folder", () => {
  it("create, add, remove, rename, mint, revoke, delete all succeed for the owner", async () => {
    const create = await createFolder(OWNER, "  Summer options  ");
    expect(create).toEqual({ ok: true, data: { id: expect.any(String), name: "Summer options" } });
    if (!create.ok) throw new Error("unreachable");
    const folderId = create.data.id;

    const program = seedProgram({ status: "PUBLISHED" });
    const add = await addProgramToFolder(OWNER, folderId, program.id);
    expect(add).toEqual({ ok: true, data: { id: expect.any(String) } });

    const detail = await getFolder(OWNER, folderId);
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.data.items).toHaveLength(1);
      expect(detail.data.items[0].unavailable).toBe(false);
    }

    const rename = await renameFolder(OWNER, folderId, "Fall options");
    expect(rename).toEqual({ ok: true, data: { id: folderId, name: "Fall options" } });

    const mint = await mintShareToken(OWNER, folderId);
    expect(mint.ok).toBe(true);

    const revoke = await revokeShareToken(OWNER, folderId);
    expect(revoke).toEqual({ ok: true, data: null });

    const remove = await removeProgramFromFolder(OWNER, folderId, program.id);
    expect(remove).toEqual({ ok: true, data: null });

    const del = await deleteFolder(OWNER, folderId);
    expect(del).toEqual({ ok: true, data: null });
  });
});

describe("IDOR: attacker (user B) against user A's folder", () => {
  const operations = {
    renameFolder: (folderId: string) => renameFolder(ATTACKER, folderId, "hacked"),
    deleteFolder: (folderId: string) => deleteFolder(ATTACKER, folderId),
    addProgramToFolder: (folderId: string, programId: string) => addProgramToFolder(ATTACKER, folderId, programId),
    removeProgramFromFolder: (folderId: string, programId: string) =>
      removeProgramFromFolder(ATTACKER, folderId, programId),
    mintShareToken: (folderId: string) => mintShareToken(ATTACKER, folderId),
    revokeShareToken: (folderId: string) => revokeShareToken(ATTACKER, folderId),
    clearUnavailableItems: (folderId: string) => clearUnavailableItems(ATTACKER, folderId),
    getFolder: (folderId: string) => getFolder(ATTACKER, folderId),
  };

  it.each(Object.keys(operations) as (keyof typeof operations)[])(
    "%s returns 404 and leaves A's folder byte-for-byte unchanged",
    async (name) => {
      const folder = seedFolder(OWNER, { name: "A's private list" });
      const program = seedProgram({ status: "PUBLISHED" });
      seedFolderItem(folder.id, program.id);
      const before = snapshot();

      const result = await operations[name](folder.id, program.id);

      expect(result).toEqual({ ok: false, status: 404 });
      expect(snapshot()).toEqual(before);
    }
  );

  it("indistinguishability: attacking A's real folder returns the exact same response as a nonexistent folder id", async () => {
    const folder = seedFolder(OWNER);

    const againstReal = await renameFolder(ATTACKER, folder.id, "x");
    const againstFake = await renameFolder(ATTACKER, "totally-nonexistent-id", "x");
    expect(againstReal).toEqual(againstFake);
    expect(againstReal).toEqual({ ok: false, status: 404 });
  });

  it("a failed mint/revoke by an attacker does not change A's shareToken", async () => {
    const folder = seedFolder(OWNER, { shareToken: "already-shared-token" });

    await mintShareToken(ATTACKER, folder.id);
    await revokeShareToken(ATTACKER, folder.id);

    const stillOwned = await getFolder(OWNER, folder.id);
    expect(stillOwned.ok).toBe(true);
    // shareToken isn't exposed via getFolder's DTO, so assert on the raw store.
    const raw = snapshot().folders.find((f: { id: string }) => f.id === folder.id);
    expect(raw.shareToken).toBe("already-shared-token");
  });
});

describe("addProgramToFolder: program validity", () => {
  it.each([
    ["PENDING", "PENDING"],
    ["REJECTED", "REJECTED"],
  ] as const)("rejects a %s program with 404 and does not create a row", async (_label, status) => {
    const folder = seedFolder(OWNER);
    const program = seedProgram({ status });
    const before = snapshot();

    const result = await addProgramToFolder(OWNER, folder.id, program.id);
    expect(result).toEqual({ ok: false, status: 404 });
    expect(snapshot()).toEqual(before);
  });

  it("rejects a nonexistent programId with 404 and does not create a row", async () => {
    const folder = seedFolder(OWNER);
    const before = snapshot();

    const result = await addProgramToFolder(OWNER, folder.id, "no-such-program");
    expect(result).toEqual({ ok: false, status: 404 });
    expect(snapshot()).toEqual(before);
  });

  it("adding the same program twice is idempotent, not a duplicate row", async () => {
    const folder = seedFolder(OWNER);
    const program = seedProgram({ status: "PUBLISHED" });

    const first = await addProgramToFolder(OWNER, folder.id, program.id);
    const second = await addProgramToFolder(OWNER, folder.id, program.id);
    expect(first.ok && second.ok).toBe(true);

    const count = snapshot().folderItems.filter((i: { folderId: string }) => i.folderId === folder.id).length;
    expect(count).toBe(1);
  });
});

describe("caps", () => {
  it(`createFolder returns 400 at the ${MAX_FOLDERS_PER_USER}th folder`, async () => {
    for (let i = 0; i < MAX_FOLDERS_PER_USER; i++) {
      const result = await createFolder(OWNER, `Folder ${i}`);
      expect(result.ok).toBe(true);
    }
    const over = await createFolder(OWNER, "One too many");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.status).toBe(400);
  });

  it(`addProgramToFolder returns 400 at ${MAX_ITEMS_PER_FOLDER} live items, and tombstones never count toward the cap (ghost-cap regression)`, async () => {
    const folder = seedFolder(OWNER);

    // Seed a mix well under the naive "total row" cap but exactly at the live cap.
    for (let i = 0; i < MAX_ITEMS_PER_FOLDER - 1; i++) {
      seedFolderItem(folder.id, seedProgram({ status: "PUBLISHED" }).id);
    }
    // A pile of tombstones that would blow a naive total-row cap if counted.
    for (let i = 0; i < 50; i++) {
      seedFolderItem(folder.id, null);
    }

    // Still one slot free (199 live) -- must succeed despite 50 tombstones on top.
    const lastSlot = await addProgramToFolder(OWNER, folder.id, seedProgram({ status: "PUBLISHED" }).id);
    expect(lastSlot.ok).toBe(true);

    // Now genuinely at the live cap (200) -- the next one must be rejected.
    const overCap = await addProgramToFolder(OWNER, folder.id, seedProgram({ status: "PUBLISHED" }).id);
    expect(overCap.ok).toBe(false);
    if (!overCap.ok) expect(overCap.status).toBe(400);
  });
});

describe("mintShareToken rotation", () => {
  it("re-minting invalidates the previous token -- a revoked/rotated link can never be resurrected", async () => {
    const folder = seedFolder(OWNER);

    const first = await mintShareToken(OWNER, folder.id);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    const tokenA = first.data.shareToken;

    const resolvesA = await getSharedFolder(tokenA);
    expect(resolvesA).not.toBeNull();

    const second = await mintShareToken(OWNER, folder.id);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    const tokenB = second.data.shareToken;
    expect(tokenB).not.toBe(tokenA);

    expect(await getSharedFolder(tokenA)).toBeNull();
    expect(await getSharedFolder(tokenB)).not.toBeNull();
  });
});

describe("revokeAllSharesForUser", () => {
  it("nulls only the target user's share tokens, leaving other users' links live", async () => {
    const aFolder = seedFolder(OWNER);
    const bFolder = seedFolder(ATTACKER);
    const mintA = await mintShareToken(OWNER, aFolder.id);
    const mintB = await mintShareToken(ATTACKER, bFolder.id);
    if (!mintA.ok || !mintB.ok) throw new Error("unreachable");

    await revokeAllSharesForUser(OWNER);

    expect(await getSharedFolder(mintA.data.shareToken)).toBeNull();
    expect(await getSharedFolder(mintB.data.shareToken)).not.toBeNull();
  });
});

describe("getSharedFolder: public projection", () => {
  it("never leaks ownerId, folder/item ids, or admin-only program fields, and counts both unpublished and tombstoned items", async () => {
    const folder = seedFolder(OWNER, { name: "Public list" });
    const livePublished = seedProgram({
      status: "PUBLISHED",
      adminNote: "SECRET moderator note",
      contactEmailSource: "https://internal.example/scrape-log",
      outreachCategory: "cold-outreach-batch-3",
    });
    const pending = seedProgram({ status: "PENDING", name: "Hidden Pending Program" });
    seedFolderItem(folder.id, livePublished.id);
    seedFolderItem(folder.id, pending.id); // unpublished -> counted, not named
    seedFolderItem(folder.id, null); // tombstone -> counted, not named

    const minted = await mintShareToken(OWNER, folder.id);
    if (!minted.ok) throw new Error("unreachable");

    const shared = await getSharedFolder(minted.data.shareToken);
    expect(shared).not.toBeNull();
    if (!shared) throw new Error("unreachable");

    expect(shared.name).toBe("Public list");
    expect(shared.unavailableCount).toBe(2);
    expect(shared.programs).toHaveLength(1);
    expect(shared.programs[0].name).toBe(livePublished.name);

    // Top-level output must never carry ownerId/folder id.
    expect(Object.keys(shared)).toEqual(["name", "programs", "unavailableCount"]);
    // Per-program output must never carry the admin-only fields.
    const programKeys = Object.keys(shared.programs[0]);
    expect(programKeys).not.toContain("adminNote");
    expect(programKeys).not.toContain("contactEmailSource");
    expect(programKeys).not.toContain("outreachCategory");
    expect(JSON.stringify(shared)).not.toContain("SECRET moderator note");
    expect(JSON.stringify(shared)).not.toContain("Hidden Pending Program");
  });

  it("returns null for an unknown or revoked token", async () => {
    expect(await getSharedFolder("no-such-token")).toBeNull();
  });
});

describe("saveToDefaultFolder", () => {
  it("lazily creates one default folder per user and reuses it on subsequent saves", async () => {
    const p1 = seedProgram({ status: "PUBLISHED" });
    const p2 = seedProgram({ status: "PUBLISHED" });

    const first = await saveToDefaultFolder(OWNER, p1.id);
    const second = await saveToDefaultFolder(OWNER, p2.id);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("unreachable");
    expect(first.data.folderId).toBe(second.data.folderId);

    const folders = await listFolders(OWNER);
    expect(folders.filter((f) => f.isDefault)).toHaveLength(1);
    expect(folders.find((f) => f.isDefault)?.itemCount).toBe(2);
  });
});

describe("getMembership", () => {
  it("returns only folders owned by the caller, even if another user saved the same program", async () => {
    const program = seedProgram({ status: "PUBLISHED" });
    const aFolder1 = seedFolder(OWNER, { name: "A1" });
    const aFolder2 = seedFolder(OWNER, { name: "A2" });
    const bFolder = seedFolder(ATTACKER, { name: "B1" });
    seedFolderItem(aFolder1.id, program.id);
    seedFolderItem(aFolder2.id, program.id);
    seedFolderItem(bFolder.id, program.id);

    const membership = await getMembership(OWNER, program.id);
    expect(new Set(membership)).toEqual(new Set([aFolder1.id, aFolder2.id]));
  });
});

describe("clearUnavailableItems", () => {
  it("removes only tombstoned/unpublished items and leaves live ones", async () => {
    const folder = seedFolder(OWNER);
    const live = seedProgram({ status: "PUBLISHED" });
    const pending = seedProgram({ status: "PENDING" });
    seedFolderItem(folder.id, live.id);
    seedFolderItem(folder.id, pending.id);
    seedFolderItem(folder.id, null);

    const result = await clearUnavailableItems(OWNER, folder.id);
    expect(result).toEqual({ ok: true, data: { cleared: 2 } });

    const remaining = snapshot().folderItems.filter((i: { folderId: string }) => i.folderId === folder.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].programId).toBe(live.id);
  });
});
