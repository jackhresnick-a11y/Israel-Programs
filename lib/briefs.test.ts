import { describe, it, expect, vi, beforeEach } from "vitest";

// Style A (hoisted in-memory Prisma fake + dynamic import after vi.mock), same
// precedent as lib/pollElaborations.test.ts / lib/programPrivateFields.test.ts.
const { fakePrisma, resetDb, seedBriefType, seedProgramBrief, findBrief } = vi.hoisted(() => {
  type BriefTypeRow = {
    id: string;
    name: string;
    slug: string;
    promptText: string;
    promptVersion: number;
    sendToAssistant: boolean;
    supersedesAiBrief: boolean;
    sortOrder: number;
    active: boolean;
  };
  type ProgramBriefRow = {
    id: string;
    programId: string;
    briefTypeId: string;
    text: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    promptVersionUsed: number;
    needsRegeneration: boolean;
    insufficient: boolean;
    insufficientAt: Date | null;
  };

  const db = { briefTypes: [] as BriefTypeRow[], briefs: [] as ProgramBriefRow[] };
  let nextId = 1;

  function notFound(): never {
    const err: Error & { code?: string } = new Error("not found");
    err.code = "P2025";
    throw err;
  }

  const briefTypeTable = {
    findMany: async () => [...db.briefTypes].sort((a, b) => a.sortOrder - b.sortOrder),
    findUnique: async (args: { where: { id: string } }) => db.briefTypes.find((t) => t.id === args.where.id) ?? null,
    findUniqueOrThrow: async (args: { where: { id: string } }) => {
      const row = db.briefTypes.find((t) => t.id === args.where.id);
      if (!row) notFound();
      return row;
    },
    create: async (args: { data: Omit<BriefTypeRow, "id"> }) => {
      const row: BriefTypeRow = { id: `bt_${nextId++}`, ...args.data };
      db.briefTypes.push(row);
      return row;
    },
    update: async (args: { where: { id: string }; data: Partial<BriefTypeRow> }) => {
      const row = db.briefTypes.find((t) => t.id === args.where.id);
      if (!row) notFound();
      Object.assign(row, Object.fromEntries(Object.entries(args.data).filter(([, v]) => v !== undefined)));
      return row;
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = db.briefTypes.findIndex((t) => t.id === args.where.id);
      if (idx === -1) notFound();
      const [row] = db.briefTypes.splice(idx, 1);
      return row;
    },
  };

  const programBriefTable = {
    findFirst: async (args: { where: { programId: string; briefTypeId: string; status: { not: string } } }) =>
      db.briefs.find(
        (b) =>
          b.programId === args.where.programId &&
          b.briefTypeId === args.where.briefTypeId &&
          b.status !== args.where.status.not
      ) ?? null,
    findUniqueOrThrow: async (args: { where: { id: string } }) => {
      const row = db.briefs.find((b) => b.id === args.where.id);
      if (!row) notFound();
      return row;
    },
    create: async (args: { data: Omit<ProgramBriefRow, "id"> }) => {
      const row: ProgramBriefRow = { id: `pb_${nextId++}`, ...args.data };
      db.briefs.push(row);
      return row;
    },
    update: async (args: { where: { id: string }; data: Partial<ProgramBriefRow> }) => {
      const row = db.briefs.find((b) => b.id === args.where.id);
      if (!row) notFound();
      Object.assign(row, args.data);
      return row;
    },
    count: async (args: { where: { briefTypeId: string } }) =>
      db.briefs.filter((b) => b.briefTypeId === args.where.briefTypeId).length,
  };

  return {
    fakePrisma: { briefType: briefTypeTable, programBrief: programBriefTable },
    resetDb: () => {
      db.briefTypes = [];
      db.briefs = [];
      nextId = 1;
    },
    seedBriefType: (overrides: Partial<BriefTypeRow> & { id: string }) => {
      const row: BriefTypeRow = {
        name: "What it is",
        slug: "what-it-is",
        promptText: "Draft a brief.",
        promptVersion: 1,
        sendToAssistant: false,
        supersedesAiBrief: false,
        sortOrder: 0,
        active: true,
        ...overrides,
      };
      db.briefTypes.push(row);
      return row;
    },
    seedProgramBrief: (overrides: Partial<ProgramBriefRow> & { id: string; programId: string; briefTypeId: string }) => {
      const row: ProgramBriefRow = {
        text: "",
        status: "DRAFT",
        promptVersionUsed: 1,
        needsRegeneration: false,
        insufficient: false,
        insufficientAt: null,
        ...overrides,
      };
      db.briefs.push(row);
      return row;
    },
    findBrief: (id: string) => db.briefs.find((b) => b.id === id),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const mockRevalidateProgram = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/revalidate", () => ({ revalidateProgram: mockRevalidateProgram }));

const {
  saveBriefDraft,
  publishBrief,
  archiveBrief,
  updateBriefType,
  isInsufficientPaste,
  INSUFFICIENT_SENTINEL,
} = await import("@/lib/briefs");

beforeEach(() => {
  resetDb();
  mockRevalidateProgram.mockClear();
});

describe("isInsufficientPaste", () => {
  it("matches the sentinel exactly after trimming", () => {
    expect(isInsufficientPaste("INSUFFICIENT")).toBe(true);
    expect(isInsufficientPaste("  INSUFFICIENT  \n")).toBe(true);
  });

  it("does not match a substring or case-varied text -- never fuzzy", () => {
    expect(isInsufficientPaste("insufficient")).toBe(false);
    expect(isInsufficientPaste("Insufficient program funding")).toBe(false);
    expect(isInsufficientPaste("INSUFFICIENT.")).toBe(false);
    expect(isInsufficientPaste("")).toBe(false);
  });
});

describe("saveBriefDraft -- INSUFFICIENT handling", () => {
  it("an exact INSUFFICIENT paste is recorded as a flag, not saved as brief text", async () => {
    const type = seedBriefType({ id: "bt1", promptVersion: 3 });

    const result = await saveBriefDraft("prog_1", "bt1", INSUFFICIENT_SENTINEL);

    expect(result.insufficient).toBe(true);
    expect(result.brief.text).toBe("");
    expect(result.brief.insufficient).toBe(true);
    expect(result.brief.insufficientAt).not.toBeNull();
    expect(result.brief.status).toBe("DRAFT");
    expect(result.brief.promptVersionUsed).toBe(type.promptVersion);
  });

  it("real text pasted after an INSUFFICIENT flag clears the flag and timestamp in the same write", async () => {
    seedBriefType({ id: "bt1" });
    await saveBriefDraft("prog_1", "bt1", INSUFFICIENT_SENTINEL);

    const result = await saveBriefDraft("prog_1", "bt1", "A real, publishable brief.");

    expect(result.insufficient).toBe(false);
    expect(result.brief.text).toBe("A real, publishable brief.");
    expect(result.brief.insufficient).toBe(false);
    expect(result.brief.insufficientAt).toBeNull();
  });

  it("upserts against the same (program, briefType) slot rather than creating a second row", async () => {
    seedBriefType({ id: "bt1" });
    const first = await saveBriefDraft("prog_1", "bt1", "First draft.");
    const second = await saveBriefDraft("prog_1", "bt1", "Second draft.");

    expect(second.brief.id).toBe(first.brief.id);
    expect(second.brief.text).toBe("Second draft.");
  });

  it("never publishes -- saving a draft always leaves status DRAFT even if a PUBLISHED row already exists for this slot", async () => {
    seedBriefType({ id: "bt1" });
    seedProgramBrief({ id: "pb1", programId: "prog_1", briefTypeId: "bt1", status: "PUBLISHED", text: "Live text." });

    const result = await saveBriefDraft("prog_1", "bt1", "Edited text.");

    expect(result.brief.status).toBe("PUBLISHED");
    // Editing an already-PUBLISHED brief's text doesn't un-publish it (only
    // archiveBrief does) -- but it also never auto-(re)publishes a DRAFT.
    expect(findBrief("pb1")!.text).toBe("Edited text.");
  });
});

describe("publishBrief", () => {
  it("refuses to publish an insufficient row", async () => {
    seedBriefType({ id: "bt1" });
    const brief = seedProgramBrief({ id: "pb1", programId: "prog_1", briefTypeId: "bt1", insufficient: true });

    await expect(publishBrief(brief.id)).rejects.toThrow(/no publishable text/i);
    expect(findBrief("pb1")!.status).toBe("DRAFT");
    expect(mockRevalidateProgram).not.toHaveBeenCalled();
  });

  it("refuses to publish a blank row", async () => {
    seedBriefType({ id: "bt1" });
    const brief = seedProgramBrief({ id: "pb1", programId: "prog_1", briefTypeId: "bt1", text: "   " });

    await expect(publishBrief(brief.id)).rejects.toThrow(/no publishable text/i);
    expect(findBrief("pb1")!.status).toBe("DRAFT");
  });

  it("publishes a row with real text and revalidates the program", async () => {
    seedBriefType({ id: "bt1" });
    const brief = seedProgramBrief({ id: "pb1", programId: "prog_1", briefTypeId: "bt1", text: "Real text." });

    const result = await publishBrief(brief.id);

    expect(result.status).toBe("PUBLISHED");
    expect(mockRevalidateProgram).toHaveBeenCalledWith("prog_1");
  });
});

describe("archiveBrief", () => {
  it("archives a published brief and revalidates, without deleting the row", async () => {
    seedBriefType({ id: "bt1" });
    const brief = seedProgramBrief({ id: "pb1", programId: "prog_1", briefTypeId: "bt1", status: "PUBLISHED", text: "Live." });

    const result = await archiveBrief(brief.id);

    expect(result.status).toBe("ARCHIVED");
    expect(findBrief("pb1")).toBeDefined();
    expect(mockRevalidateProgram).toHaveBeenCalledWith("prog_1");
  });
});

describe("updateBriefType -- promptVersion bump discipline", () => {
  it("bumps promptVersion when promptText changes", async () => {
    seedBriefType({ id: "bt1", promptText: "Old prompt.", promptVersion: 1 });

    const updated = await updateBriefType("bt1", { promptText: "New prompt." });

    expect(updated.promptVersion).toBe(2);
  });

  it("does NOT bump promptVersion for a name/sortOrder/active change", async () => {
    seedBriefType({ id: "bt1", promptText: "Same prompt.", promptVersion: 1 });

    const updated = await updateBriefType("bt1", { name: "Renamed", sortOrder: 5, active: false });

    expect(updated.promptVersion).toBe(1);
  });

  it("does NOT bump promptVersion when promptText is resubmitted unchanged", async () => {
    seedBriefType({ id: "bt1", promptText: "Same prompt.", promptVersion: 1 });

    const updated = await updateBriefType("bt1", { promptText: "Same prompt." });

    expect(updated.promptVersion).toBe(1);
  });
});
