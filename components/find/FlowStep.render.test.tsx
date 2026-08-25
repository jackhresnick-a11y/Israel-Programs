import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FlowStep from "./FlowStep";
import type { FlowOptionDTO, FlowQuestionDTO } from "@/lib/flowShared";
import type { FlowVideoDTO, FlowVideoTriggerDTO } from "@/lib/flowClips";

/** A real `disabled` HTML boolean attribute renders as `disabled=""` in React's
 * SSR output -- checking for the bare substring "disabled" would false-positive
 * on Tailwind's `disabled:cursor-not-allowed` variant class living in the SAME
 * tag's className. */
function isDisabled(tag: string): boolean {
  return tag.includes('disabled=""');
}

/**
 * Proves "the video never blocks the options" as an assertion on the actual
 * rendered markup, not a promise in a comment -- find-v2-question-spec.md: "the
 * options are usable before it finishes." Renders the REAL FlowStep component (the
 * one app/match/page.tsx mounts) via react-dom/server's renderToStaticMarkup, with
 * a trigger wired so a clip is actually mounted, and asserts no radio/Continue
 * button carries a `disabled` attribute. "use client" has no effect outside Next's
 * bundler (same note as ReviewsSection.render.test.tsx), so this is plain SSR --
 * useState just renders with its initial value, which is exactly what's needed
 * here: no interactivity is under test, only the static output.
 */

function option(overrides: Partial<FlowOptionDTO> & Pick<FlowOptionDTO, "key" | "label">): FlowOptionDTO {
  return {
    id: overrides.key,
    questionId: "q1",
    rationale: null,
    order: 0,
    optionSetKeys: [],
    showWhen: null,
    tagSlugs: [],
    durationValues: [],
    matchMode: "WEIGHT",
    weight: 1,
    requireIncludesUntagged: true,
    status: "ACTIVE",
    ...overrides,
  };
}

const question: FlowQuestionDTO = {
  id: "q1",
  key: "service-timing",
  order: 0,
  type: "CHALLENGE",
  prompt: "When would you want to start serving?",
  helpText: null,
  skippable: true,
  showWhen: null,
  optionSetRules: null,
  defaultOptionSetKey: null,
  version: 1,
  status: "ACTIVE",
  options: [
    option({ key: "straight-in", label: "Straight in, as soon as I can" }),
    option({ key: "a-year-first", label: "A year first" }),
  ],
};

const video: FlowVideoDTO = {
  id: "v1",
  key: "hebrew-misery",
  title: "The misery clip",
  provider: "youtube",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
  watchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  posterUrl: null,
  transcript: "You might get the unit you want with weak Hebrew...",
  notes: null,
  speaker: "Lone soldier, Golani",
  durationSeconds: 45,
  status: "ACTIVE",
};

const answerTrigger: FlowVideoTriggerDTO = {
  id: "t1",
  videoId: "v1",
  questionId: "q1",
  mode: "ON_ANSWER",
  optionKeys: ["straight-in"],
  when: null,
  rolloutPercent: 100,
  order: 0,
  status: "ACTIVE",
};

function render(overrides: Partial<Parameters<typeof FlowStep>[0]> = {}) {
  return renderToStaticMarkup(
    <FlowStep
      sessionId="session-1"
      question={question}
      options={question.options}
      state={new Map()}
      prevKey={null}
      stepNumber={1}
      totalSteps={5}
      triggers={[answerTrigger]}
      videosById={{ v1: video }}
      conditionAnswers={{}}
      {...overrides}
    />
  );
}

describe("FlowStep never blocks the options while a clip is mounted", () => {
  it("with the answer-triggered clip mounted, every radio is enabled and Continue is not disabled", () => {
    const html = render({ state: new Map([["service-timing", ["straight-in"]]]) });

    // The clip actually mounted (sanity check the fixture wiring is real).
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(video.embedUrl.split("?")[0]);

    // Every option radio stays enabled -- no disabled attribute anywhere.
    const radioMatches = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)];
    expect(radioMatches.length).toBe(2);
    for (const [tag] of radioMatches) {
      expect(isDisabled(tag)).toBe(false);
    }

    // Continue (name="advance") is present and not disabled.
    const continueMatch = html.match(/<button[^>]*name="advance"[^>]*>/);
    expect(continueMatch).not.toBeNull();
    expect(isDisabled(continueMatch![0])).toBe(false);
  });

  it("with NO clip mounted (no answer selected yet), options are still fully enabled", () => {
    const html = render({ state: new Map() });
    expect(html).not.toContain(video.embedUrl.split("?")[0]);

    const radioMatches = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)];
    expect(radioMatches.length).toBe(2);
    for (const [tag] of radioMatches) {
      expect(isDisabled(tag)).toBe(false);
    }
  });

  it("selecting a DIFFERENT option than the trigger targets mounts no clip, and still doesn't block", () => {
    const html = render({ state: new Map([["service-timing", ["a-year-first"]]]) });
    expect(html).not.toContain(video.embedUrl.split("?")[0]);

    const radioMatches = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)];
    for (const [tag] of radioMatches) {
      expect(isDisabled(tag)).toBe(false);
    }
  });
});
