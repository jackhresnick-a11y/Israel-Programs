/**
 * Prisma-backed CRUD for the /match challenge flow: FlowQuestion/FlowOption and
 * FlowVideo/FlowVideoTrigger rows. Re-exports lib/flowShared.ts's pure symbols for
 * server callers -- a client component must import @/lib/flowShared directly (same
 * split as lib/finder.ts / lib/finderTargets.ts).
 */
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { UnknownTagSlugsError, slugifyValue, assertTagSlugsExist } from "@/lib/tagSlugValidation";
import { parseVideoLink } from "@/lib/videoEmbed";
import { youtubePosterFromEmbedUrl } from "@/lib/homeVideoConfig";
import { fetchVimeoPosterUrl } from "@/lib/homeVideo";
import {
  referencedQuestionKeys,
  flowConditionSchema,
  flowOptionSetRulesSchema,
  type FlowCondition,
  type FlowConditionNode,
  type FlowOptionSetRules,
} from "@/lib/flowShared";

export {
  FLOW_RULE_VERSION,
  flowConditionSchema,
  flowConditionNodeSchema,
  flowOptionSetRulesSchema,
  evaluateFlowCondition,
  shouldShowQuestion,
  referencedQuestionKeys,
  resolveOptionSetKey,
  optionsForSet,
  parseAnswerState,
  serializeAnswerState,
  withAnswer,
  toConditionAnswers,
  resolveFlow,
  buildMatchHref,
  answerStateToRecord,
  recordToAnswerState,
  applyOptionOverrides,
  type FlowConditionNode,
  type FlowCondition,
  type FlowAnswers,
  type FlowAnswerState,
  type FlowQuestionDTO,
  type FlowOptionDTO,
  type FlowOptionMatchMode,
  type ResolvedFlow,
  type CoverageContext,
  type CoverageEliminator,
  type OptionCoverageCounter,
  type QuestionGateInfo,
} from "@/lib/flowShared";

// Re-exported so callers (routes, the admin manager) can catch a single error type
// across both /find and /match -- the tag-picker contract ("only a real Tag.slug may
// be saved") is identical in both features, no reason to duplicate the class.
export { UnknownTagSlugsError };

/** dropdownOptions-style nullable Json columns need the Prisma.JsonNull sentinel to
 * explicitly clear them -- same idiom as lib/pollQuestions.ts's toJsonInput. */
function toJsonInput(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function listFlowQuestions({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  return prisma.flowQuestion.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: {
      options: {
        where: includeRetired ? undefined : { status: "ACTIVE" },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });
}

/** True if any FlowResponse row (ever) answered this question -- the trigger for
 * FlowQuestion.version's "bumped whenever prompt or an option label changes on a
 * question that already has responses" contract (see the schema.prisma doc comment).
 * A question nobody has answered yet can be reworded freely with no version bump,
 * since there's no historical distribution a silent rewording could contaminate. */
async function questionHasResponses(
  tx: Prisma.TransactionClient | typeof prisma,
  questionKey: string
): Promise<boolean> {
  const row = await tx.flowResponse.findFirst({ where: { questionKey }, select: { id: true } });
  return row !== null;
}

/** Every `answerIn` leaf inside a condition, as {questionKey, optionKeys} pairs --
 * unlike referencedQuestionKeys this keeps each question paired with the SPECIFIC
 * option keys asked about it, which is what lets the check below catch a typo'd or
 * stale option key (e.g. "workign" for "working") the same way assertTagSlugsExist
 * catches a typo'd tag slug. `answered` nodes carry no option keys to check. */
function collectAnswerInLeaves(node: FlowConditionNode): { questionKey: string; optionKeys: string[] }[] {
  switch (node.type) {
    case "answerIn":
      return [{ questionKey: node.questionKey, optionKeys: node.optionKeys }];
    case "answered":
      return [];
    case "not":
      return collectAnswerInLeaves(node.of);
    case "all":
    case "any":
      return node.of.flatMap(collectAnswerInLeaves);
  }
}

/** A show-condition/option-set rule may only reference a question ordered STRICTLY
 * BEFORE the one carrying it -- a forward or self reference can never evaluate true
 * (the referenced question hasn't been answered yet when this one is being shown)
 * and would silently hide the question forever. Also checks every answerIn leaf's
 * optionKeys against that question's REAL FlowOption.key values, same soft-ref
 * write-time discipline as assertTagSlugsExist -- an option key that matches
 * nothing can never make the condition true, which is indistinguishable from a
 * permanently-hidden question until someone notices. lib/flowShared.ts's zod
 * schemas validate the rule's STRUCTURE; this validates its REFERENCES against the
 * live question/option bank, which only the Prisma-backed side can do. Options of
 * any status (including RETIRED) count as valid targets -- a rule naming a
 * currently-retired option is unreachable, not a typo. */
async function assertConditionReferencesValid(
  tx: Prisma.TransactionClient | typeof prisma,
  questionOrder: number,
  node: FlowConditionNode
) {
  const keys = [...new Set(referencedQuestionKeys(node))];
  if (keys.length === 0) return;
  const rows = await tx.flowQuestion.findMany({
    where: { key: { in: keys } },
    select: { key: true, order: true, options: { select: { key: true } } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const problems: string[] = [];
  for (const key of keys) {
    const question = byKey.get(key);
    if (question === undefined) problems.push(`references unknown question "${key}"`);
    else if (question.order >= questionOrder) problems.push(`references "${key}", which isn't ordered before this question`);
  }
  for (const { questionKey, optionKeys } of collectAnswerInLeaves(node)) {
    const question = byKey.get(questionKey);
    if (!question) continue; // already reported as an unknown-question problem above
    const validKeys = new Set(question.options.map((o) => o.key));
    const unknownOptionKeys = optionKeys.filter((k) => !validKeys.has(k));
    if (unknownOptionKeys.length > 0) {
      problems.push(`references unknown option key(s) [${unknownOptionKeys.join(", ")}] on question "${questionKey}"`);
    }
  }
  if (problems.length > 0) throw new Error(`Invalid condition: ${problems.join("; ")}`);
}

/** After ANY order change (a single question's PATCH, or a bulk reorder), every
 * ACTIVE question's showWhen/optionSetRules must still only reference an
 * earlier-ordered question -- otherwise a plain reorder (which touches only the
 * `order` column, not the rule itself) could silently and permanently hide a
 * question with no error anywhere. `pendingOrder` lets a caller check a
 * NOT-YET-COMMITTED arrangement (a single order swap, or a whole new
 * reorderFlowQuestions arrangement) before writing it.
 *
 * `ruleOverrides` covers the case where ONE PATCH changes a question's `order`
 * AND its own showWhen/optionSetRules together: without it, this function would
 * read that row's STALE (not-yet-written) rule from the DB and validate it
 * against the NEW order, which can reject a perfectly valid edit (the new rule
 * satisfies the new order) on the strength of a rule that's about to be
 * replaced anyway. A key present in the map with value `undefined` means "not
 * being changed by this call -- read the DB row as normal." */
async function assertReorderKeepsConditionsValid(
  tx: Prisma.TransactionClient | typeof prisma,
  pendingOrder: Map<string, number>,
  ruleOverrides: Map<string, { showWhen?: unknown; optionSetRules?: unknown }> = new Map()
) {
  const rows = await tx.flowQuestion.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, key: true, order: true, showWhen: true, optionSetRules: true },
  });
  const orderByKey = new Map(rows.map((r) => [r.key, pendingOrder.get(r.id) ?? r.order]));

  const problems: string[] = [];
  const checkAgainst = (subjectKey: string, subjectOrder: number, referencedKey: string) => {
    const refOrder = orderByKey.get(referencedKey);
    if (refOrder !== undefined && refOrder >= subjectOrder) {
      problems.push(`"${subjectKey}" -> "${referencedKey}"`);
    }
  };

  for (const row of rows) {
    const myOrder = pendingOrder.get(row.id) ?? row.order;
    const override = ruleOverrides.get(row.id);
    const showWhenRaw = override && "showWhen" in override ? override.showWhen : row.showWhen;
    const optionSetRulesRaw = override && "optionSetRules" in override ? override.optionSetRules : row.optionSetRules;

    const showWhen = flowConditionSchema.safeParse(showWhenRaw);
    if (showWhen.success) {
      for (const key of referencedQuestionKeys(showWhen.data.when)) checkAgainst(row.key, myOrder, key);
    }
    const optionSetRules = flowOptionSetRulesSchema.safeParse(optionSetRulesRaw);
    if (optionSetRules.success) {
      for (const rule of optionSetRules.data.rules) {
        for (const key of referencedQuestionKeys(rule.when)) checkAgainst(row.key, myOrder, key);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`This reorder would break existing show-conditions (question -> reference): ${problems.join(", ")}`);
  }
}

/** Removing (deleting or retiring) an option is a live target for every OTHER
 * question's showWhen/optionSetRules, same failure class as
 * assertReorderKeepsConditionsValid: a rule naming this option can never observe
 * it being selected again once it's gone, which -- if it's the rule's only leaf --
 * permanently hides whatever question that rule gates, with no error anywhere.
 * assertConditionReferencesValid catches a typo'd/dead option key at WRITE time;
 * this is the same check run in the other direction, at REMOVAL time. */
async function assertOptionNotReferencedByOtherRules(
  tx: Prisma.TransactionClient | typeof prisma,
  questionKey: string,
  optionKey: string
) {
  const rows = await tx.flowQuestion.findMany({
    where: { status: "ACTIVE" },
    select: { key: true, showWhen: true, optionSetRules: true },
  });

  const referencedBy = new Set<string>();
  for (const row of rows) {
    const showWhen = flowConditionSchema.safeParse(row.showWhen);
    const showWhenLeaves = showWhen.success ? collectAnswerInLeaves(showWhen.data.when) : [];
    const optionSetRules = flowOptionSetRulesSchema.safeParse(row.optionSetRules);
    const ruleLeaves = optionSetRules.success
      ? optionSetRules.data.rules.flatMap((rule) => collectAnswerInLeaves(rule.when))
      : [];
    const referencesThisOption = [...showWhenLeaves, ...ruleLeaves].some(
      (leaf) => leaf.questionKey === questionKey && leaf.optionKeys.includes(optionKey)
    );
    if (referencesThisOption) referencedBy.add(row.key);
  }

  if (referencedBy.size > 0) {
    throw new Error(
      `This option is referenced by ${[...referencedBy].map((k) => `"${k}"`).join(", ")}'s show-condition and can't be removed -- update or remove that condition first`
    );
  }
}

/** `key` is derived from `prompt` once, at creation, and is never exposed as an
 * updatable field here -- same "stable identity assigned once" posture as
 * FinderQuestion (lib/finder.ts's createFinderQuestion) and Region. Renaming a
 * question's wording later never touches its key, so every showWhen/optionSetRules
 * rule that names it stays valid. */
export async function createFlowQuestion(input: {
  prompt: string;
  helpText?: string | null;
  type?: "FILTER" | "CHALLENGE" | "TRADEOFF";
  skippable?: boolean;
}) {
  const maxOrder = await prisma.flowQuestion.aggregate({ _max: { order: true } });
  return prisma.flowQuestion.create({
    data: {
      key: slugifyValue(input.prompt),
      prompt: input.prompt,
      helpText: input.helpText ?? null,
      type: input.type ?? "CHALLENGE",
      skippable: input.skippable ?? true,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateFlowQuestion(
  id: string,
  input: Partial<{
    prompt: string;
    helpText: string | null;
    type: "FILTER" | "CHALLENGE" | "TRADEOFF";
    skippable: boolean;
    showWhen: FlowCondition | null;
    optionSetRules: FlowOptionSetRules | null;
    defaultOptionSetKey: string | null;
    order: number;
    status: "ACTIVE" | "RETIRED";
  }>
) {
  return prisma.$transaction(async (tx) => {
    const data: Prisma.FlowQuestionUpdateInput = {
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.skippable !== undefined ? { skippable: input.skippable } : {}),
      ...(input.showWhen !== undefined ? { showWhen: toJsonInput(input.showWhen) } : {}),
      ...(input.optionSetRules !== undefined ? { optionSetRules: toJsonInput(input.optionSetRules) } : {}),
      ...(input.defaultOptionSetKey !== undefined ? { defaultOptionSetKey: input.defaultOptionSetKey } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    if (
      input.prompt !== undefined ||
      input.showWhen !== undefined ||
      input.optionSetRules !== undefined ||
      input.order !== undefined
    ) {
      const existing = await tx.flowQuestion.findUniqueOrThrow({
        where: { id },
        select: { key: true, prompt: true, order: true },
      });
      // The order this question will carry AFTER this write -- used both to
      // validate its own rules and (if order is changing) every OTHER question's
      // rules against the new arrangement.
      const effectiveOrder = input.order ?? existing.order;

      if (input.prompt !== undefined && input.prompt !== existing.prompt && (await questionHasResponses(tx, existing.key))) {
        data.version = { increment: 1 };
      }

      if (input.showWhen != null) {
        await assertConditionReferencesValid(tx, effectiveOrder, input.showWhen.when);
      }
      if (input.optionSetRules != null) {
        for (const rule of input.optionSetRules.rules) {
          await assertConditionReferencesValid(tx, effectiveOrder, rule.when);
        }
      }
      // A plain order change (e.g. the admin's up/down move) touches no rule at
      // all, but can still silently invalidate an EXISTING rule elsewhere in the
      // bank -- see assertReorderKeepsConditionsValid's doc comment. When this
      // SAME call also changes showWhen/optionSetRules, pass the NEW value as an
      // override so the check doesn't validate this row's about-to-be-replaced
      // rule against its new order.
      if (input.order !== undefined && input.order !== existing.order) {
        const ruleOverrides = new Map<string, { showWhen?: unknown; optionSetRules?: unknown }>();
        if (input.showWhen !== undefined || input.optionSetRules !== undefined) {
          ruleOverrides.set(id, {
            ...(input.showWhen !== undefined ? { showWhen: input.showWhen } : {}),
            ...(input.optionSetRules !== undefined ? { optionSetRules: input.optionSetRules } : {}),
          });
        }
        await assertReorderKeepsConditionsValid(tx, new Map([[id, input.order]]), ruleOverrides);
      }
    }

    return tx.flowQuestion.update({ where: { id }, data });
  });
}

/** Retire-never-delete once real data exists: FlowResponse.questionKey is a soft
 * reference specifically so history survives a question's removal, but deleting a
 * question that respondents have actually answered would still silently orphan
 * that history from anything that could resolve it back to live config (labels,
 * option keys). Same guard shape as lib/pollQuestions.ts's deleteQuestion. A
 * never-answered question (the common case while still authoring content) deletes
 * freely, same low-friction UX as v1's FinderQuestion. */
export async function deleteFlowQuestion(id: string) {
  const question = await prisma.flowQuestion.findUniqueOrThrow({ where: { id }, select: { key: true } });
  const hasResponses = await questionHasResponses(prisma, question.key);
  if (hasResponses) {
    throw new Error("This question has responses and can’t be deleted — retire it instead");
  }
  return prisma.flowQuestion.delete({ where: { id } });
}

/** Sets `order` to each question's index in `ids` (0..n-1), in one transaction --
 * same shape as lib/finder.ts's reorderFinderQuestions / lib/tags.ts's reorderTags. */
export async function reorderFlowQuestions(ids: string[]) {
  await prisma.$transaction(async (tx) => {
    const pendingOrder = new Map(ids.map((id, index) => [id, index]));
    await assertReorderKeepsConditionsValid(tx, pendingOrder);
    for (const [id, order] of pendingOrder) {
      await tx.flowQuestion.update({ where: { id }, data: { order } });
    }
  });
}

/** `key` is derived from `label` at creation, same "type a label, get a stable
 * identity" UX as createFlowQuestion -- never a field the admin types separately.
 * A collision within the same question (two labels that slugify the same) hits the
 * @@unique([questionId, key]) constraint and surfaces as a 409, same as
 * FinderQuestion's duplicate-prompt handling. */
export async function createFlowOption(input: {
  questionId: string;
  label: string;
  rationale?: string | null;
  tagSlugs?: string[];
  durationValues?: string[];
  matchMode?: "WEIGHT" | "REQUIRE";
  weight?: number;
  requireIncludesUntagged?: boolean;
  optionSetKeys?: string[];
}) {
  await assertTagSlugsExist(input.tagSlugs ?? []);
  const maxOrder = await prisma.flowOption.aggregate({
    where: { questionId: input.questionId },
    _max: { order: true },
  });
  return prisma.flowOption.create({
    data: {
      questionId: input.questionId,
      key: slugifyValue(input.label),
      label: input.label,
      rationale: input.rationale ?? null,
      tagSlugs: input.tagSlugs ?? [],
      durationValues: input.durationValues ?? [],
      matchMode: input.matchMode ?? "WEIGHT",
      weight: input.weight ?? 1,
      requireIncludesUntagged: input.requireIncludesUntagged ?? true,
      optionSetKeys: input.optionSetKeys ?? [],
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateFlowOption(
  id: string,
  input: Partial<{
    label: string;
    rationale: string | null;
    order: number;
    status: "ACTIVE" | "RETIRED";
    tagSlugs: string[];
    durationValues: string[];
    matchMode: "WEIGHT" | "REQUIRE";
    weight: number;
    requireIncludesUntagged: boolean;
    optionSetKeys: string[];
  }>
) {
  if (input.tagSlugs !== undefined) await assertTagSlugsExist(input.tagSlugs);

  return prisma.$transaction(async (tx) => {
    if (input.label !== undefined || input.status === "RETIRED") {
      const existing = await tx.flowOption.findUniqueOrThrow({
        where: { id },
        select: { key: true, label: true, question: { select: { key: true } } },
      });

      if (input.label !== undefined && input.label !== existing.label && (await questionHasResponses(tx, existing.question.key))) {
        await tx.flowQuestion.update({ where: { key: existing.question.key }, data: { version: { increment: 1 } } });
      }

      // Retiring is the same "quietly hides a question forever" failure as
      // deleting -- same guard, run before either.
      if (input.status === "RETIRED") {
        await assertOptionNotReferencedByOtherRules(tx, existing.question.key, existing.key);
      }
    }

    return tx.flowOption.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.tagSlugs !== undefined ? { tagSlugs: input.tagSlugs } : {}),
        ...(input.durationValues !== undefined ? { durationValues: input.durationValues } : {}),
        ...(input.matchMode !== undefined ? { matchMode: input.matchMode } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.requireIncludesUntagged !== undefined
          ? { requireIncludesUntagged: input.requireIncludesUntagged }
          : {}),
        ...(input.optionSetKeys !== undefined ? { optionSetKeys: input.optionSetKeys } : {}),
      },
    });
  });
}

/** Retire-never-delete once real data exists, same posture as deleteFlowQuestion --
 * but checked per OPTION, not per question: a sibling option that was never
 * actually selected can still be deleted even after the question has other
 * responses, since FlowResponse.optionKeys is what makes that precise. */
export async function deleteFlowOption(id: string) {
  const option = await prisma.flowOption.findUniqueOrThrow({
    where: { id },
    select: { key: true, question: { select: { key: true } } },
  });
  const hasResponses = await prisma.flowResponse.findFirst({
    where: { questionKey: option.question.key, optionKeys: { has: option.key } },
    select: { id: true },
  });
  if (hasResponses) {
    throw new Error("This option has responses and can’t be deleted — retire it instead");
  }
  await assertOptionNotReferencedByOtherRules(prisma, option.question.key, option.key);
  return prisma.flowOption.delete({ where: { id } });
}

/** Sets `order` to each option's index in `ids` (0..n-1) within its question, in one
 * transaction -- same shape as reorderFlowQuestions above. */
export async function reorderFlowOptions(ids: string[]) {
  await prisma.$transaction(ids.map((id, index) => prisma.flowOption.update({ where: { id }, data: { order: index } })));
}

/** Standing admin signal for the "N programs have no gender tag" / "N programs have
 * no program-type tag" warnings the /admin/flow/questions screen surfaces next to the
 * two-eliminator guard and the Q6 taxonomy build-out (see CLAUDE.md's "/find v2"
 * section) -- counts PUBLISHED programs carrying none of the given tag slugs' shared
 * category. Read-only, computed fresh on every page load rather than cached, since
 * the underlying tag data changes independently of this admin page. */
export async function countProgramsMissingCategoryTags(category: string): Promise<{ total: number; missing: number }> {
  const [total, missing] = await Promise.all([
    prisma.program.count({ where: { status: "PUBLISHED" } }),
    prisma.program.count({ where: { status: "PUBLISHED", tags: { none: { category } } } }),
  ]);
  return { total, missing };
}

// ---------------------------------------------------------------------------
// FlowVideo / FlowVideoTrigger -- the clip layer (find-v2-question-spec.md: "the
// video is conditional, not the question"). Paste-a-link only: provider/embedUrl/
// watchUrl are always derived from parseVideoLink, never a Blob upload -- see
// CLAUDE.md's "Upload storage" section on why video uploads to Blob are a standing
// no, and only youtube/vimeo of parseVideoLink's five providers are accepted (the
// clip manager doesn't offer facebook/instagram/tiktok).
// ---------------------------------------------------------------------------

async function resolvePosterUrl(provider: "youtube" | "vimeo", embedUrl: string, watchUrl: string): Promise<string | null> {
  return provider === "youtube" ? youtubePosterFromEmbedUrl(embedUrl) : await fetchVimeoPosterUrl(watchUrl);
}

export async function listFlowVideos({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  return prisma.flowVideo.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: [{ createdAt: "desc" }],
  });
}

/** `key` is derived from `title` at creation, same "type a name, get a stable
 * identity" posture as questions/options. `videoUrl` is parsed and canonicalized
 * server-side via lib/videoEmbed.ts's parseVideoLink -- the stored embedUrl/watchUrl
 * are always built from the extracted id, never the raw pasted string. */
export async function createFlowVideo(input: {
  videoUrl: string;
  title: string;
  transcript?: string | null;
  notes?: string | null;
  speaker?: string | null;
  durationSeconds?: number | null;
}) {
  const parsed = parseVideoLink(input.videoUrl);
  if (!parsed || (parsed.provider !== "youtube" && parsed.provider !== "vimeo")) {
    throw new Error("Only YouTube and Vimeo links are supported for /match clips");
  }
  const posterUrl = await resolvePosterUrl(parsed.provider, parsed.embedUrl, parsed.watchUrl);
  return prisma.flowVideo.create({
    data: {
      key: slugifyValue(input.title),
      title: input.title,
      provider: parsed.provider,
      embedUrl: parsed.embedUrl,
      watchUrl: parsed.watchUrl,
      posterUrl,
      transcript: input.transcript ?? null,
      notes: input.notes ?? null,
      speaker: input.speaker ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  });
}

/** Re-filming a clip is an edit to THIS row (same key, same id) -- every trigger
 * pointing at it keeps working with no admin re-wiring. Passing `videoUrl`
 * re-parses and re-derives the poster (unless `posterUrl` is ALSO given in the same
 * call, which wins as an explicit override). There is deliberately no
 * deleteFlowVideo -- retire only, since deleting would cascade-drop its triggers'
 * firing points; see the FlowVideoTrigger.videoId FK note in schema.prisma. */
export async function updateFlowVideo(
  id: string,
  input: Partial<{
    videoUrl: string;
    title: string;
    transcript: string | null;
    notes: string | null;
    speaker: string | null;
    durationSeconds: number | null;
    posterUrl: string | null;
    status: "ACTIVE" | "RETIRED";
  }>
) {
  const data: Prisma.FlowVideoUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.speaker !== undefined ? { speaker: input.speaker } : {}),
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  if (input.videoUrl !== undefined) {
    const parsed = parseVideoLink(input.videoUrl);
    if (!parsed || (parsed.provider !== "youtube" && parsed.provider !== "vimeo")) {
      throw new Error("Only YouTube and Vimeo links are supported for /match clips");
    }
    data.provider = parsed.provider;
    data.embedUrl = parsed.embedUrl;
    data.watchUrl = parsed.watchUrl;
    if (input.posterUrl === undefined) {
      data.posterUrl = await resolvePosterUrl(parsed.provider, parsed.embedUrl, parsed.watchUrl);
    }
  }
  if (input.posterUrl !== undefined) data.posterUrl = input.posterUrl;

  return prisma.flowVideo.update({ where: { id }, data });
}

export async function listFlowVideoTriggers({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  return prisma.flowVideoTrigger.findMany({
    where: includeRetired ? undefined : { status: "ACTIVE" },
    orderBy: [{ questionId: "asc" }, { order: "asc" }, { id: "asc" }],
  });
}

/** optionKeys/mode pairing is enforced here with a readable error BEFORE it ever
 * reaches the hand-written DB CHECK (FlowVideoTrigger_option_keys_match_mode) --
 * same "validate first, let the constraint be the last line of defense" posture as
 * everywhere else in this file. optionKeys are also checked against the REAL
 * FlowOption.key values on the trigger's question (same discipline as
 * assertConditionReferencesValid), and `when`, if given, must only reference a
 * question ordered before the trigger's OWN question -- identical rule and
 * evaluator as FlowQuestion.showWhen. */
export async function createFlowVideoTrigger(input: {
  videoId: string;
  questionId: string;
  mode: "ON_DISPLAY" | "ON_ANSWER";
  optionKeys?: string[];
  when?: FlowCondition | null;
  rolloutPercent?: number;
}) {
  const optionKeys = input.optionKeys ?? [];
  if (input.mode === "ON_ANSWER" && optionKeys.length === 0) {
    throw new Error("An ON_ANSWER trigger needs at least one option key");
  }
  if (input.mode === "ON_DISPLAY" && optionKeys.length > 0) {
    throw new Error("An ON_DISPLAY trigger fires on the question's display, before any answer exists -- it can't carry option keys");
  }

  const question = await prisma.flowQuestion.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { order: true, options: { select: { key: true } } },
  });

  if (optionKeys.length > 0) {
    const validKeys = new Set(question.options.map((o) => o.key));
    const unknown = optionKeys.filter((k) => !validKeys.has(k));
    if (unknown.length > 0) throw new Error(`Unknown option key(s) on this question: ${unknown.join(", ")}`);
  }
  if (input.when != null) {
    await assertConditionReferencesValid(prisma, question.order, input.when.when);
  }

  const maxOrder = await prisma.flowVideoTrigger.aggregate({
    where: { questionId: input.questionId },
    _max: { order: true },
  });
  return prisma.flowVideoTrigger.create({
    data: {
      videoId: input.videoId,
      questionId: input.questionId,
      mode: input.mode,
      optionKeys,
      when: toJsonInput(input.when ?? null),
      rolloutPercent: input.rolloutPercent ?? 100,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateFlowVideoTrigger(
  id: string,
  input: Partial<{
    mode: "ON_DISPLAY" | "ON_ANSWER";
    optionKeys: string[];
    when: FlowCondition | null;
    rolloutPercent: number;
    order: number;
    status: "ACTIVE" | "RETIRED";
  }>
) {
  const existing = await prisma.flowVideoTrigger.findUniqueOrThrow({
    where: { id },
    select: { mode: true, optionKeys: true, questionId: true },
  });
  const effectiveMode = input.mode ?? existing.mode;
  const effectiveOptionKeys = input.optionKeys ?? existing.optionKeys;

  if (effectiveMode === "ON_ANSWER" && effectiveOptionKeys.length === 0) {
    throw new Error("An ON_ANSWER trigger needs at least one option key");
  }
  if (effectiveMode === "ON_DISPLAY" && effectiveOptionKeys.length > 0) {
    throw new Error("An ON_DISPLAY trigger fires on the question's display, before any answer exists -- it can't carry option keys");
  }

  if (input.optionKeys !== undefined && input.optionKeys.length > 0) {
    const question = await prisma.flowQuestion.findUniqueOrThrow({
      where: { id: existing.questionId },
      select: { options: { select: { key: true } } },
    });
    const validKeys = new Set(question.options.map((o) => o.key));
    const unknown = input.optionKeys.filter((k) => !validKeys.has(k));
    if (unknown.length > 0) throw new Error(`Unknown option key(s) on this question: ${unknown.join(", ")}`);
  }
  if (input.when != null) {
    const question = await prisma.flowQuestion.findUniqueOrThrow({ where: { id: existing.questionId }, select: { order: true } });
    await assertConditionReferencesValid(prisma, question.order, input.when.when);
  }

  return prisma.flowVideoTrigger.update({
    where: { id },
    data: {
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.optionKeys !== undefined ? { optionKeys: input.optionKeys } : {}),
      ...(input.when !== undefined ? { when: toJsonInput(input.when) } : {}),
      ...(input.rolloutPercent !== undefined ? { rolloutPercent: input.rolloutPercent } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

/** Unlike options/questions, a trigger carries no historical-response data of its
 * own (FlowResponse.videoKeysShown references FlowVideo.key, never a trigger id),
 * so deleting one can't orphan any measurement -- delete is unguarded, matching
 * FinderOption's precedent rather than the retire-never-delete posture above. */
export async function deleteFlowVideoTrigger(id: string) {
  return prisma.flowVideoTrigger.delete({ where: { id } });
}

/** Sets `order` to each trigger's index in `ids` (0..n-1) WITHIN one question --
 * same shape as reorderFlowOptions. Callers must pass only one question's trigger
 * ids at a time; mixing questions would silently renumber them against each other. */
export async function reorderFlowVideoTriggers(ids: string[]) {
  await prisma.$transaction(ids.map((id, index) => prisma.flowVideoTrigger.update({ where: { id }, data: { order: index } })));
}
