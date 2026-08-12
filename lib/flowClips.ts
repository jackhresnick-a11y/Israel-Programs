/**
 * Pure, Prisma-free trigger matching for /match's inline clips
 * (find-v2-question-spec.md: "The video is conditional, not the question"). Given a
 * question's FlowVideoTrigger rows and the respondent's current answer, decides which
 * FlowVideo (if any) should be showing right now. No import of lib/prisma, so this
 * runs identically in the public flow and the admin live preview -- see
 * lib/flowShared.ts's header for why that split matters.
 */
import { evaluateFlowCondition, flowConditionSchema, type FlowAnswers } from "@/lib/flowShared";

export type FlowVideoTriggerDTO = {
  id: string;
  videoId: string;
  questionId: string;
  mode: "ON_DISPLAY" | "ON_ANSWER";
  /** FlowOption.key values that fire this trigger. Non-empty for ON_ANSWER, empty
   * for ON_DISPLAY -- enforced by a hand-written CHECK in the migration (see
   * schema.prisma's FlowVideoTrigger doc comment). */
  optionKeys: string[];
  /** An extra show-condition, same rule format as FlowQuestion.showWhen, evaluated
   * against answers to questions PRIOR to this one -- what lets Q6 carve one
   * question into a taxonomy clip for the single-gender paths and a shorter one for
   * the mixed path. */
  when: unknown;
  rolloutPercent: number;
  order: number;
  status: "ACTIVE" | "RETIRED";
};

export type FlowVideoDTO = {
  id: string;
  key: string;
  title: string;
  provider: string;
  embedUrl: string;
  watchUrl: string;
  posterUrl: string | null;
  transcript: string | null;
  notes: string | null;
  speaker: string | null;
  durationSeconds: number | null;
  status: "ACTIVE" | "RETIRED";
};

/** Small deterministic string hash (djb2 variant) -- not cryptographic, doesn't need
 * to be: it only has to spread (sessionId, triggerId) pairs roughly evenly across
 * 0..99 and produce the SAME bucket every time for the same pair, so Back/refresh
 * never flips a session across the rollout boundary. */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash) % 100;
}

/** rolloutPercent = 100 (the default -- everyone) and 0 (nobody) are special-cased
 * so the common cases never depend on hash behavior at all. This is the spec's own
 * "cheapest test before building any of this" as a data edit -- see
 * FlowVideoTrigger.rolloutPercent's doc comment in schema.prisma. */
export function isInRollout(sessionId: string, triggerId: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  return stableHash(`${sessionId}:${triggerId}`) < rolloutPercent;
}

function pickLowest(candidates: FlowVideoTriggerDTO[]): FlowVideoTriggerDTO | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
}

function isEligible(trigger: FlowVideoTriggerDTO, conditionAnswers: FlowAnswers, sessionId: string): boolean {
  if (trigger.status !== "ACTIVE") return false;
  if (trigger.when != null) {
    const parsed = flowConditionSchema.safeParse(trigger.when);
    // Same fail-open posture as shouldShowQuestion: an unparseable trigger condition
    // must not silently suppress a clip that should be firing.
    if (parsed.success && !evaluateFlowCondition(parsed.data.when, conditionAnswers)) return false;
  }
  return isInRollout(sessionId, trigger.id, trigger.rolloutPercent);
}

/**
 * Which FlowVideo (by id) should render for this question right now, or null.
 * ON_ANSWER always beats ON_DISPLAY: once the current selection fires an
 * answer-triggered clip, that's the argument being made, not the question's default
 * opener. Revising to a different answer re-evaluates from scratch, so a new
 * ON_ANSWER match swaps the clip and an answer with no trigger of its own falls back
 * to whatever ON_DISPLAY clip qualifies (or null). Ties within either mode resolve
 * by `order` then `id`, fully deterministic.
 */
export function selectClip(
  triggers: FlowVideoTriggerDTO[],
  selectedOptionKeys: string[] | null,
  conditionAnswers: FlowAnswers,
  sessionId: string
): string | null {
  if (selectedOptionKeys && selectedOptionKeys.length > 0) {
    const answerTriggers = triggers.filter(
      (t) =>
        t.mode === "ON_ANSWER" &&
        t.optionKeys.some((k) => selectedOptionKeys.includes(k)) &&
        isEligible(t, conditionAnswers, sessionId)
    );
    const picked = pickLowest(answerTriggers);
    if (picked) return picked.videoId;
  }

  const displayTriggers = triggers.filter((t) => t.mode === "ON_DISPLAY" && isEligible(t, conditionAnswers, sessionId));
  const picked = pickLowest(displayTriggers);
  return picked ? picked.videoId : null;
}
