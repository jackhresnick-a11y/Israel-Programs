import { describe, it, expect, beforeEach, vi } from "vitest";

// --- In-memory Prisma fake --------------------------------------------------------
// Mirrors the calls buildProgramsHref/createFinderOption/updateFinderOption actually
// make (finderOption.findMany/aggregate/create/update, tag.findMany by slug) -- same
// "hand-rolled fake via vi.mock" shape as lib/folders.test.ts, sized to this module's
// much smaller Prisma surface.
const { fakePrisma, resetDb, seedOption, seedTag } = vi.hoisted(() => {
  type OptionRow = {
    id: string;
    questionId?: string;
    order?: number;
    tagSlugs: string[];
    durationValues: string[];
  };
  type TagRow = { slug: string };

  const db = { options: [] as OptionRow[], tags: [] as TagRow[], seq: 0 };

  const fakePrisma = {
    finderOption: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        db.options.filter((o) => where.id.in.includes(o.id)),
      aggregate: async ({ where }: { where?: { questionId?: string } }) => {
        const rows = where?.questionId
          ? db.options.filter((o) => o.questionId === where.questionId)
          : db.options;
        const orders = rows.map((o) => o.order ?? 0);
        return { _max: { order: orders.length > 0 ? Math.max(...orders) : null } };
      },
      create: async ({ data }: { data: Omit<OptionRow, "id"> }) => {
        db.seq += 1;
        const row: OptionRow = { id: `opt_${db.seq}`, ...data };
        db.options.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<OptionRow> }) => {
        const row = db.options.find((o) => o.id === where.id);
        if (!row) throw new Error("fake prisma: no FinderOption with that id");
        Object.assign(row, data);
        return row;
      },
    },
    tag: {
      findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
        db.tags.filter((t) => where.slug.in.includes(t.slug)).map((t) => ({ slug: t.slug })),
    },
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.options = [];
      db.tags = [];
      db.seq = 0;
    },
    seedOption: (row: OptionRow) => db.options.push(row),
    seedTag: (slug: string) => db.tags.push({ slug }),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const { buildProgramsHref, createFinderOption, updateFinderOption, UnknownTagSlugsError } =
  await import("./finder");

function tagsOf(href: string): string[] {
  const url = new URL(href, "http://x");
  return (url.searchParams.get("tags") ?? "").split(",").filter(Boolean).sort();
}

function durationOf(href: string): string[] {
  const url = new URL(href, "http://x");
  return (url.searchParams.get("duration") ?? "").split(",").filter(Boolean).sort();
}

beforeEach(() => {
  resetDb();
  seedTag("essence-spiritual-growth");
  seedTag("essence-pre-military");
  seedTag("integration-high");
});

describe("buildProgramsHref", () => {
  it("empty input -> bare /programs", async () => {
    expect(await buildProgramsHref([])).toBe("/programs");
  });

  it("unknown option ids (e.g. every question skipped) -> bare /programs", async () => {
    expect(await buildProgramsHref(["does-not-exist"])).toBe("/programs");
  });

  it("unions tagSlugs and durationValues across multiple answered options", async () => {
    seedOption({ id: "opt-essence", tagSlugs: ["essence-spiritual-growth"], durationValues: [] });
    seedOption({ id: "opt-duration", tagSlugs: [], durationValues: ["GAP_YEAR", "MULTI_YEAR"] });

    const href = await buildProgramsHref(["opt-essence", "opt-duration"]);
    expect(tagsOf(href)).toEqual(["essence-spiritual-growth"]);
    expect(durationOf(href)).toEqual(["GAP_YEAR", "MULTI_YEAR"].sort());
  });

  it("dedups a tag slug contributed by more than one selected option", async () => {
    seedOption({ id: "opt-a", tagSlugs: ["essence-pre-military"], durationValues: [] });
    seedOption({ id: "opt-b", tagSlugs: ["essence-pre-military"], durationValues: [] });

    const href = await buildProgramsHref(["opt-a", "opt-b"]);
    expect(tagsOf(href)).toEqual(["essence-pre-military"]);
  });

  it("a skipped question contributes nothing -- only the ids actually passed in are used", async () => {
    seedOption({ id: "opt-integration", tagSlugs: ["integration-high"], durationValues: [] });
    seedOption({ id: "opt-essence", tagSlugs: ["essence-spiritual-growth"], durationValues: [] });

    // Simulates skipping the essence question: its option id is never included.
    const href = await buildProgramsHref(["opt-integration"]);
    expect(tagsOf(href)).toEqual(["integration-high"]);
  });

  it("drops a tag slug with no live Tag row (e.g. the tag was renamed/deleted after this option was configured)", async () => {
    seedOption({ id: "opt-stale", tagSlugs: ["essence-spiritual-growth", "retired-slug"], durationValues: [] });

    const href = await buildProgramsHref(["opt-stale"]);
    expect(tagsOf(href)).toEqual(["essence-spiritual-growth"]);
  });

  it("drops a duration value outside the DurationType enum", async () => {
    seedOption({ id: "opt-bad-duration", tagSlugs: [], durationValues: ["GAP_YEAR", "NOT_A_REAL_VALUE"] });

    const href = await buildProgramsHref(["opt-bad-duration"]);
    expect(durationOf(href)).toEqual(["GAP_YEAR"]);
  });

  it("an option contributing only stale/invalid values collapses to bare /programs", async () => {
    seedOption({ id: "opt-all-stale", tagSlugs: ["retired-slug"], durationValues: ["NOT_A_REAL_VALUE"] });

    expect(await buildProgramsHref(["opt-all-stale"])).toBe("/programs");
  });

  it("never emits q, hasScholarship, hasCollegeCredit, or travelType -- this feature must never read or write those params", async () => {
    seedOption({
      id: "opt-full",
      tagSlugs: ["essence-spiritual-growth", "integration-high"],
      durationValues: ["GAP_YEAR"],
    });

    const href = await buildProgramsHref(["opt-full"]);
    for (const forbidden of ["q=", "hasScholarship", "hasCollegeCredit", "travelType"]) {
      expect(href).not.toContain(forbidden);
    }
  });
});

describe("createFinderOption / updateFinderOption reject unknown tag slugs", () => {
  it("createFinderOption rejects an option pointing at a nonexistent tag", async () => {
    await expect(
      createFinderOption({ questionId: "q1", label: "Bogus", tagSlugs: ["not-a-real-tag"] })
    ).rejects.toBeInstanceOf(UnknownTagSlugsError);
  });

  it("createFinderOption succeeds when every tag slug is real", async () => {
    const option = await createFinderOption({
      questionId: "q1",
      label: "Spiritual growth",
      tagSlugs: ["essence-spiritual-growth"],
    });
    expect(option.tagSlugs).toEqual(["essence-spiritual-growth"]);
  });

  it("createFinderOption with a mix of real and fake slugs still rejects (all-or-nothing)", async () => {
    await expect(
      createFinderOption({
        questionId: "q1",
        label: "Mixed",
        tagSlugs: ["essence-spiritual-growth", "not-a-real-tag"],
      })
    ).rejects.toBeInstanceOf(UnknownTagSlugsError);
  });

  it("updateFinderOption rejects retagging an existing option onto a nonexistent tag", async () => {
    seedOption({ id: "opt-1", tagSlugs: [], durationValues: [] });

    await expect(
      updateFinderOption("opt-1", { tagSlugs: ["not-a-real-tag"] })
    ).rejects.toBeInstanceOf(UnknownTagSlugsError);
  });

  it("updateFinderOption leaves tagSlugs untouched when the rejected write throws", async () => {
    seedOption({ id: "opt-1", tagSlugs: ["essence-spiritual-growth"], durationValues: [] });

    await expect(updateFinderOption("opt-1", { tagSlugs: ["not-a-real-tag"] })).rejects.toThrow();

    const options = await buildProgramsHref(["opt-1"]);
    expect(tagsOf(options)).toEqual(["essence-spiritual-growth"]);
  });

  it("updateFinderOption succeeds when every tag slug is real", async () => {
    seedOption({ id: "opt-1", tagSlugs: [], durationValues: [] });

    const updated = await updateFinderOption("opt-1", { tagSlugs: ["integration-high"] });
    expect(updated.tagSlugs).toEqual(["integration-high"]);
  });

  it("an option with no tagSlugs at all (e.g. the army question's 'No preference') is always accepted", async () => {
    const created = await createFinderOption({ questionId: "q1", label: "No preference" });
    expect(created.tagSlugs).toEqual([]);

    seedOption({ id: "opt-2", tagSlugs: ["essence-spiritual-growth"], durationValues: [] });
    const updated = await updateFinderOption("opt-2", { durationValues: ["GAP_YEAR"] });
    expect(updated.tagSlugs).toEqual(["essence-spiritual-growth"]);
  });
});
