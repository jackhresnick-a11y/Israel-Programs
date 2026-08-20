import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FlowCondition, FlowOptionSetRules } from "./flowShared";

// --- In-memory Prisma fake --------------------------------------------------------
// Same hand-rolled shape as lib/finder.test.ts's fake, sized to lib/flow.ts's larger
// Prisma surface: FlowQuestion/FlowOption CRUD + reorder, FlowResponse existence
// checks (for the version-bump and retire-never-delete guards), and Tag lookups (for
// the shared UnknownTagSlugsError contract).
const { fakePrisma, resetDb, seedQuestion, seedOption, seedTag, seedResponse, seedProgram } = vi.hoisted(() => {
  type QuestionRow = {
    id: string;
    key: string;
    prompt: string;
    helpText: string | null;
    type: string;
    skippable: boolean;
    showWhen: unknown;
    optionSetRules: unknown;
    defaultOptionSetKey: string | null;
    version: number;
    order: number;
    status: string;
  };
  type OptionRow = {
    id: string;
    questionId: string;
    key: string;
    label: string;
    rationale: string | null;
    order: number;
    status: string;
    tagSlugs: string[];
    durationValues: string[];
    matchMode: string;
    weight: number;
    requireIncludesUntagged: boolean;
    optionSetKeys: string[];
  };
  type ResponseRow = { id: string; questionKey: string; optionKeys: string[] };
  type TagRow = { slug: string; category?: string | null };
  type ProgramRow = { id: string; status: string; tagSlugs: string[] };

  const db = {
    questions: [] as QuestionRow[],
    options: [] as OptionRow[],
    responses: [] as ResponseRow[],
    tags: [] as TagRow[],
    programs: [] as ProgramRow[],
    seq: 0,
  };

  function nextId(prefix: string) {
    db.seq += 1;
    return `${prefix}_${db.seq}`;
  }

  // A minimal in-transaction handle: since these tests never need real rollback
  // semantics, both array-form and callback-form $transaction operate directly
  // against the same `db`, and the callback form is handed the SAME fakePrisma
  // object as `tx` -- structurally identical to what lib/flow.ts's Prisma.
  // TransactionClient | typeof prisma union type expects.
  const fakePrisma: Record<string, unknown> = {
    flowQuestion: {
      findMany: async ({ where }: { where?: { key?: { in: string[] }; status?: string } }) => {
        let rows = [...db.questions];
        if (where?.key?.in) rows = rows.filter((q) => where.key!.in.includes(q.key));
        if (where?.status) rows = rows.filter((q) => q.status === where.status);
        // Every real query that fetches question rows here also wants each
        // question's options (assertConditionReferencesValid's optionKeys check),
        // so the fake always attaches them rather than modeling select/include
        // shape precisely.
        return rows.map((q) => ({
          ...q,
          options: db.options.filter((o) => o.questionId === q.id).map((o) => ({ key: o.key })),
        }));
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = db.questions.find((q) => q.id === where.id);
        if (!row) throw new Error("fake prisma: no FlowQuestion with that id");
        return row;
      },
      aggregate: async () => {
        const orders = db.questions.map((q) => q.order);
        return { _max: { order: orders.length > 0 ? Math.max(...orders) : null } };
      },
      create: async ({ data }: { data: Omit<QuestionRow, "id" | "version"> & { version?: number } }) => {
        const row: QuestionRow = { id: nextId("q"), version: 1, ...data };
        db.questions.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id?: string; key?: string };
        data: Record<string, unknown>;
      }) => {
        const row = where.id
          ? db.questions.find((q) => q.id === where.id)
          : db.questions.find((q) => q.key === where.key);
        if (!row) throw new Error("fake prisma: no FlowQuestion matched");
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in v) {
            (row as unknown as Record<string, number>)[k] += (v as { increment: number }).increment;
          } else {
            (row as unknown as Record<string, unknown>)[k] = v;
          }
        }
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = db.questions.findIndex((q) => q.id === where.id);
        if (idx === -1) throw new Error("fake prisma: no FlowQuestion with that id");
        const [row] = db.questions.splice(idx, 1);
        db.options = db.options.filter((o) => o.questionId !== row.id);
        return row;
      },
    },
    flowOption: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = db.options.find((o) => o.id === where.id);
        if (!row) throw new Error("fake prisma: no FlowOption with that id");
        const question = db.questions.find((q) => q.id === row.questionId);
        return { ...row, question: { key: question?.key ?? "" } };
      },
      aggregate: async ({ where }: { where?: { questionId?: string } }) => {
        const rows = where?.questionId ? db.options.filter((o) => o.questionId === where.questionId) : db.options;
        const orders = rows.map((o) => o.order);
        return { _max: { order: orders.length > 0 ? Math.max(...orders) : null } };
      },
      create: async ({ data }: { data: Omit<OptionRow, "id"> }) => {
        const row: OptionRow = { id: nextId("opt"), ...data };
        db.options.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<OptionRow> }) => {
        const row = db.options.find((o) => o.id === where.id);
        if (!row) throw new Error("fake prisma: no FlowOption with that id");
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = db.options.findIndex((o) => o.id === where.id);
        if (idx === -1) throw new Error("fake prisma: no FlowOption with that id");
        const [row] = db.options.splice(idx, 1);
        return row;
      },
    },
    flowResponse: {
      findFirst: async ({
        where,
      }: {
        where: { questionKey: string; optionKeys?: { has: string } };
      }) => {
        const row = db.responses.find(
          (r) => r.questionKey === where.questionKey && (!where.optionKeys || r.optionKeys.includes(where.optionKeys.has))
        );
        return row ?? null;
      },
    },
    tag: {
      findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
        db.tags.filter((t) => where.slug.in.includes(t.slug)).map((t) => ({ slug: t.slug })),
    },
    // Minimal fake for countProgramsMissingCategoryTags's two `prisma.program.count`
    // calls -- a plain status equality filter, plus a `tags.none.category` relation
    // filter resolved by looking each of a program's tagSlugs up in db.tags.
    program: {
      count: async ({
        where,
      }: {
        where?: { status?: string; tags?: { none?: { category?: string } } };
      }) => {
        let rows = [...db.programs];
        if (where?.status) rows = rows.filter((p) => p.status === where.status);
        const category = where?.tags?.none?.category;
        if (category !== undefined) {
          rows = rows.filter(
            (p) => !p.tagSlugs.some((slug) => db.tags.find((t) => t.slug === slug)?.category === category)
          );
        }
        return rows.length;
      },
    },
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === "function") return arg(fakePrisma);
      throw new Error("fake prisma: unsupported $transaction argument");
    },
  };

  return {
    fakePrisma,
    resetDb: () => {
      db.questions = [];
      db.options = [];
      db.responses = [];
      db.tags = [];
      db.programs = [];
      db.seq = 0;
    },
    seedQuestion: (row: Partial<QuestionRow> & { id: string; key: string }) =>
      db.questions.push({
        prompt: row.key,
        helpText: null,
        type: "CHALLENGE",
        skippable: true,
        showWhen: null,
        optionSetRules: null,
        defaultOptionSetKey: null,
        version: 1,
        order: 0,
        status: "ACTIVE",
        ...row,
      }),
    seedOption: (row: Partial<OptionRow> & { id: string; questionId: string; key: string }) =>
      db.options.push({
        label: row.key,
        rationale: null,
        order: 0,
        status: "ACTIVE",
        tagSlugs: [],
        durationValues: [],
        matchMode: "WEIGHT",
        weight: 1,
        requireIncludesUntagged: true,
        optionSetKeys: [],
        ...row,
      }),
    seedTag: (slug: string, category?: string) => db.tags.push({ slug, category }),
    seedResponse: (row: ResponseRow) => db.responses.push(row),
    seedProgram: (row: Partial<ProgramRow> & { id: string }) =>
      db.programs.push({ status: "PUBLISHED", tagSlugs: [], ...row }),
  };
});

// lib/flow.ts imports UnknownTagSlugsError from lib/finder.ts, which itself imports
// @/lib/prisma -- mocking that one module is enough for both files, no separate
// lib/finder mock needed.
vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const {
  createFlowQuestion,
  updateFlowQuestion,
  deleteFlowQuestion,
  reorderFlowQuestions,
  createFlowOption,
  updateFlowOption,
  deleteFlowOption,
  reorderFlowOptions,
  UnknownTagSlugsError,
  countProgramsMissingCategoryTags,
} = await import("./flow");

beforeEach(() => {
  resetDb();
  seedTag("essence-spiritual-growth");
  seedTag("integration-high");
});

// Typed accessor for the handful of direct fake-prisma reads a few assertions below
// need -- `fakePrisma` itself is a plain `Record<string, unknown>` so lib/flow.ts's
// mocked-out prisma import stays untyped and simple to hoist.
const rawPrisma = fakePrisma as unknown as {
  flowQuestion: {
    findMany: (args: object) => Promise<{ id: string; order: number; version: number }[]>;
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<{ version: number }>;
  };
  flowOption: {
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<{ order: number }>;
  };
};

describe("createFlowQuestion / key derivation", () => {
  it("derives key from prompt at creation", async () => {
    const q = await createFlowQuestion({ prompt: "What stage will you be in?" });
    expect(q.key).toBe("what-stage-will-you-be-in");
  });

  it("key survives a relabel -- prompt changes, key does not", async () => {
    const q = await createFlowQuestion({ prompt: "Original prompt" });
    const updated = await updateFlowQuestion(q.id, { prompt: "A totally different prompt" });
    expect(updated.prompt).toBe("A totally different prompt");
    expect(updated.key).toBe(q.key); // unchanged -- key is never an updatable field
  });
});

describe("createFlowOption / updateFlowOption reject unknown tag slugs", () => {
  it("rejects an option pointing at a nonexistent tag", async () => {
    seedQuestion({ id: "q1", key: "q1" });
    await expect(
      createFlowOption({ questionId: "q1", label: "Bogus", tagSlugs: ["not-a-real-tag"] })
    ).rejects.toBeInstanceOf(UnknownTagSlugsError);
  });

  it("succeeds when every tag slug is real", async () => {
    seedQuestion({ id: "q1", key: "q1" });
    const option = await createFlowOption({
      questionId: "q1",
      label: "Spiritual growth",
      tagSlugs: ["essence-spiritual-growth"],
    });
    expect(option.tagSlugs).toEqual(["essence-spiritual-growth"]);
    expect(option.key).toBe("spiritual-growth"); // derived from label, same as questions
  });

  it("updateFlowOption rejects retagging onto a nonexistent tag", async () => {
    seedQuestion({ id: "q1", key: "q1" });
    seedOption({ id: "opt-1", questionId: "q1", key: "opt-1" });
    await expect(updateFlowOption("opt-1", { tagSlugs: ["not-a-real-tag"] })).rejects.toBeInstanceOf(
      UnknownTagSlugsError
    );
  });
});

describe("reorder writes order 0..n-1 in one pass", () => {
  it("reorderFlowQuestions", async () => {
    seedQuestion({ id: "q1", key: "q1", order: 5 });
    seedQuestion({ id: "q2", key: "q2", order: 2 });
    seedQuestion({ id: "q3", key: "q3", order: 9 });
    await reorderFlowQuestions(["q3", "q1", "q2"]);
    const rows = await rawPrisma.flowQuestion.findMany({});
    const orderById = Object.fromEntries((rows as { id: string; order: number }[]).map((r) => [r.id, r.order]));
    expect(orderById).toEqual({ q3: 0, q1: 1, q2: 2 });
  });

  it("reorderFlowOptions", async () => {
    seedQuestion({ id: "q1", key: "q1" });
    seedOption({ id: "opt-a", questionId: "q1", key: "a", order: 5 });
    seedOption({ id: "opt-b", questionId: "q1", key: "b", order: 1 });
    await reorderFlowOptions(["opt-b", "opt-a"]);
    const optA = await rawPrisma.flowOption.findUniqueOrThrow({ where: { id: "opt-a" } });
    const optB = await rawPrisma.flowOption.findUniqueOrThrow({ where: { id: "opt-b" } });
    expect((optB as { order: number }).order).toBe(0);
    expect((optA as { order: number }).order).toBe(1);
  });
});

describe("retire, never delete once a question/option has real responses", () => {
  it("deleteFlowQuestion succeeds when nobody has ever answered it", async () => {
    seedQuestion({ id: "q1", key: "q1" });
    await expect(deleteFlowQuestion("q1")).resolves.toBeDefined();
  });

  it("deleteFlowQuestion refuses once a FlowResponse references its key", async () => {
    seedQuestion({ id: "q1", key: "life-stage" });
    seedResponse({ id: "r1", questionKey: "life-stage", optionKeys: ["working"] });
    await expect(deleteFlowQuestion("q1")).rejects.toThrow(/retire it instead/);
  });

  it("deleteFlowOption refuses once a FlowResponse actually selected it, but a NEVER-selected sibling option can still be deleted", async () => {
    seedQuestion({ id: "q1", key: "life-stage" });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedOption({ id: "opt-still-hs", questionId: "q1", key: "still-in-hs" });
    seedResponse({ id: "r1", questionKey: "life-stage", optionKeys: ["working"] });

    await expect(deleteFlowOption("opt-working")).rejects.toThrow(/retire it instead/);
    await expect(deleteFlowOption("opt-still-hs")).resolves.toBeDefined(); // never selected -- safe to delete
  });
});

describe("removing an option a show-condition depends on -- the same failure class as reordering", () => {
  it("deleteFlowOption refuses when another question's showWhen references it", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedQuestion({
      id: "q2",
      key: "opener",
      order: 1,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    });
    await expect(deleteFlowOption("opt-working")).rejects.toThrow(/can't be removed/);
  });

  it("updateFlowOption refuses to RETIRE an option another question's optionSetRules references", async () => {
    seedQuestion({ id: "q1", key: "program-gender", order: 0 });
    seedOption({ id: "opt-boys", questionId: "q1", key: "boys-only" });
    seedQuestion({
      id: "q2",
      key: "program-essence",
      order: 1,
      optionSetRules: {
        v: 1,
        default: "mixed",
        rules: [{ optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } }],
      },
    });
    await expect(updateFlowOption("opt-boys", { status: "RETIRED" })).rejects.toThrow(/can't be removed/);
  });

  it("an option nobody's condition references deletes/retires freely", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedOption({ id: "opt-unreferenced", questionId: "q1", key: "unreferenced" });
    await expect(deleteFlowOption("opt-unreferenced")).resolves.toBeDefined();
    await expect(updateFlowOption("opt-working", { status: "RETIRED" })).resolves.toBeDefined();
  });

  it("a RETIRED question's rule referencing the option doesn't block removal", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedQuestion({
      id: "q2",
      key: "opener",
      order: 1,
      status: "RETIRED",
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    });
    await expect(deleteFlowOption("opt-working")).resolves.toBeDefined();
  });
});

describe("version bump on reword, only once the question has responses", () => {
  it("rewording a never-answered question does NOT bump version", async () => {
    seedQuestion({ id: "q1", key: "q1", prompt: "Original", version: 1 });
    const updated = await updateFlowQuestion("q1", { prompt: "Reworded" });
    expect(updated.version).toBe(1);
  });

  it("rewording an ANSWERED question bumps version", async () => {
    seedQuestion({ id: "q1", key: "life-stage", prompt: "Original", version: 1 });
    seedResponse({ id: "r1", questionKey: "life-stage", optionKeys: ["working"] });
    const updated = await updateFlowQuestion("q1", { prompt: "Reworded" });
    expect(updated.version).toBe(2);
  });

  it("rewording an option label bumps the PARENT question's version once it has responses", async () => {
    seedQuestion({ id: "q1", key: "life-stage", version: 1 });
    seedOption({ id: "opt-1", questionId: "q1", key: "working", label: "Working" });
    seedResponse({ id: "r1", questionKey: "life-stage", optionKeys: ["working"] });
    await updateFlowOption("opt-1", { label: "Working full-time" });
    const question = await rawPrisma.flowQuestion.findUniqueOrThrow({ where: { id: "q1" } });
    expect((question as { version: number }).version).toBe(2);
  });
});

describe("show-condition forward-reference validation at write time", () => {
  it("accepts a condition referencing an EARLIER question by a REAL option key", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedQuestion({ id: "q2", key: "opener", order: 1 });
    const rule: FlowCondition = {
      v: 1,
      when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] },
    };
    await expect(updateFlowQuestion("q2", { showWhen: rule })).resolves.toBeDefined();
  });

  it("rejects a condition naming an option key that doesn't exist on the referenced question (a typo, like 'workign')", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });
    seedQuestion({ id: "q2", key: "opener", order: 1 });
    const rule: FlowCondition = {
      v: 1,
      when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["workign"] },
    };
    await expect(updateFlowQuestion("q2", { showWhen: rule })).rejects.toThrow(/unknown option key/);
  });

  it("a rule naming a RETIRED option's key is still accepted -- unreachable is not a typo", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working", status: "RETIRED" });
    seedQuestion({ id: "q2", key: "opener", order: 1 });
    const rule: FlowCondition = {
      v: 1,
      when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] },
    };
    await expect(updateFlowQuestion("q2", { showWhen: rule })).resolves.toBeDefined();
  });

  it("rejects a condition referencing a LATER question", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({ id: "q2", key: "opener", order: 1 });
    const rule: FlowCondition = { v: 1, when: { type: "answerIn", questionKey: "opener", optionKeys: ["x"] } };
    // life-stage (order 0) referencing opener (order 1) -- opener comes AFTER it
    await expect(updateFlowQuestion("q1", { showWhen: rule })).rejects.toThrow(/isn't ordered before/);
  });

  it("rejects a self-reference", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    const rule: FlowCondition = { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["x"] } };
    await expect(updateFlowQuestion("q1", { showWhen: rule })).rejects.toThrow(/isn't ordered before/);
  });

  it("rejects a condition referencing an unknown question key", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    const rule: FlowCondition = {
      v: 1,
      when: { type: "answerIn", questionKey: "does-not-exist", optionKeys: ["x"] },
    };
    await expect(updateFlowQuestion("q1", { showWhen: rule })).rejects.toThrow(/unknown question/);
  });

  it("also validates every rule inside optionSetRules", async () => {
    seedQuestion({ id: "q1", key: "program-gender", order: 0 });
    seedOption({ id: "opt-boys", questionId: "q1", key: "boys-only" });
    seedQuestion({ id: "q2", key: "program-essence", order: 1 });
    const goodRules: FlowOptionSetRules = {
      v: 1,
      default: "mixed",
      rules: [{ optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } }],
    };
    await expect(updateFlowQuestion("q2", { optionSetRules: goodRules })).resolves.toBeDefined();

    const badRules: FlowOptionSetRules = {
      v: 1,
      default: "mixed",
      rules: [{ optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-essence", optionKeys: ["x"] } }],
    };
    await expect(updateFlowQuestion("q2", { optionSetRules: badRules })).rejects.toThrow(/isn't ordered before/);
  });
});

describe("reordering can't silently break an EXISTING show-condition elsewhere in the bank", () => {
  it("rejects a single order change that would leave another question's saved rule referencing something no longer earlier", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({ id: "q2", key: "opener", order: 1, showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } } });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });

    // Moving life-stage to AFTER opener would make opener's already-saved showWhen
    // reference a question that's no longer earlier -- this PATCH only changes
    // `order`, never touching q2's showWhen at all.
    await expect(updateFlowQuestion("q1", { order: 2 })).rejects.toThrow(/would break existing show-conditions/);
  });

  it("an order change with no dependency anywhere succeeds normally", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({ id: "q2", key: "opener", order: 1 }); // no showWhen at all
    await expect(updateFlowQuestion("q1", { order: 5 })).resolves.toBeDefined();
  });

  it("reorderFlowQuestions (bulk) rejects an arrangement that would break an existing rule", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({
      id: "q2",
      key: "opener",
      order: 1,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });

    // Putting opener (q2) BEFORE life-stage (q1) breaks opener's saved showWhen.
    await expect(reorderFlowQuestions(["q2", "q1"])).rejects.toThrow(/would break existing show-conditions/);

    // Nothing should have been written -- both questions keep their original order.
    const rows = await rawPrisma.flowQuestion.findMany({});
    const orderById = Object.fromEntries(rows.map((r) => [r.id, r.order]));
    expect(orderById).toEqual({ q1: 0, q2: 1 });
  });

  it("reorderFlowQuestions accepts an arrangement that preserves every dependency", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({
      id: "q2",
      key: "opener",
      order: 1,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    });
    seedQuestion({ id: "q3", key: "unrelated", order: 2 });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });

    // Swapping q2 and q3 leaves life-stage still before opener.
    await expect(reorderFlowQuestions(["q1", "q3", "q2"])).resolves.toBeUndefined();
    const rows = await rawPrisma.flowQuestion.findMany({});
    const orderById = Object.fromEntries(rows.map((r) => [r.id, r.order]));
    expect(orderById).toEqual({ q1: 0, q3: 1, q2: 2 });
  });

  it("a RETIRED question's stale rule doesn't block reordering everyone else", async () => {
    seedQuestion({ id: "q1", key: "life-stage", order: 0 });
    seedQuestion({
      id: "q2",
      key: "opener",
      order: 1,
      status: "RETIRED",
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
    });
    seedOption({ id: "opt-working", questionId: "q1", key: "working" });

    // q2 is RETIRED, so its condition is never re-checked, and moving life-stage
    // anywhere doesn't matter to it.
    await expect(updateFlowQuestion("q1", { order: 5 })).resolves.toBeDefined();
  });

  it("a single PATCH clearing its OWN showWhen while also moving order doesn't get rejected by its own stale rule", async () => {
    // Regression: assertReorderKeepsConditionsValid must validate the NEW rule
    // value being written in this same call, not re-read the row's OLD
    // (not-yet-committed) showWhen from the DB and check THAT against the new
    // order -- Q (order 6) references R (order 5, valid); moving Q to order 2
    // while ALSO clearing its own condition must succeed, since the condition
    // being written is null, not the stale "references R" rule.
    seedQuestion({ id: "r", key: "r", order: 5 });
    seedQuestion({
      id: "q",
      key: "q",
      order: 6,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "r", optionKeys: ["x"] } },
    });
    await expect(updateFlowQuestion("q", { showWhen: null, order: 2 })).resolves.toBeDefined();
  });

  it("a single PATCH REPLACING its own showWhen while also moving order validates the NEW rule against the NEW order, not the old one", async () => {
    seedQuestion({ id: "r", key: "r", order: 0 });
    seedQuestion({ id: "s", key: "s", order: 1 });
    seedQuestion({
      id: "q",
      key: "q",
      order: 5,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "r", optionKeys: ["x"] } }, // valid: r(0) < q(5)
    });
    // Move q to order 0 (before both r and s) while replacing its condition to
    // reference s -- the NEW rule (references s, order 1) against the NEW order
    // (0) is invalid (1 >= 0), and must be rejected on that basis.
    const badRule = { v: 1 as const, when: { type: "answerIn" as const, questionKey: "s", optionKeys: ["x"] } };
    await expect(updateFlowQuestion("q", { showWhen: badRule, order: 0 })).rejects.toThrow(/isn't ordered before/);
  });
});

describe("countProgramsMissingCategoryTags", () => {
  beforeEach(() => {
    seedTag("israeli-yeshiva", "program-type");
    seedTag("essence-travel", "essence");
  });

  it("total is PUBLISHED programs only; missing is PUBLISHED programs with no tag in the given category", async () => {
    seedProgram({ id: "p1", status: "PUBLISHED", tagSlugs: ["israeli-yeshiva"] }); // has a program-type tag
    seedProgram({ id: "p2", status: "PUBLISHED", tagSlugs: [] }); // no tags at all -- missing
    seedProgram({ id: "p3", status: "PUBLISHED", tagSlugs: ["essence-travel"] }); // tagged, but wrong category -- still missing
    seedProgram({ id: "p4", status: "PENDING", tagSlugs: [] }); // not PUBLISHED -- excluded from both total and missing

    await expect(countProgramsMissingCategoryTags("program-type")).resolves.toEqual({ total: 3, missing: 2 });
  });

  it("missing is 0 once every PUBLISHED program carries a tag in the category", async () => {
    seedProgram({ id: "p1", status: "PUBLISHED", tagSlugs: ["israeli-yeshiva"] });
    seedProgram({ id: "p2", status: "PENDING", tagSlugs: [] });

    await expect(countProgramsMissingCategoryTags("program-type")).resolves.toEqual({ total: 1, missing: 0 });
  });
});
