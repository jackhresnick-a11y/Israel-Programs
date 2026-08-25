// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowQuestionsManager, { type FlowOptionRow, type FlowQuestionRow } from "./FlowQuestionsManager";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Coverage for QuestionCard collapsing to a summary row by default (title · type · v ·
 * active/retired · #options · has-conditions), expanding on click, so the admin page
 * is scannable with many questions on screen. See FlowQuestionsManager.tsx's
 * QuestionCard.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function option(overrides: Partial<FlowOptionRow> & Pick<FlowOptionRow, "id" | "key" | "label">): FlowOptionRow {
  return {
    rationale: null,
    order: 0,
    status: "ACTIVE",
    tagSlugs: [],
    durationValues: [],
    matchMode: "WEIGHT",
    weight: 1,
    requireIncludesUntagged: true,
    optionSetKeys: [],
    showWhen: null,
    ...overrides,
  };
}

function question(overrides: Partial<FlowQuestionRow> & Pick<FlowQuestionRow, "id" | "key" | "options">): FlowQuestionRow {
  return {
    prompt: `Question ${overrides.key}`,
    helpText: null,
    type: "CHALLENGE",
    skippable: true,
    showWhen: null,
    optionSetRules: null,
    defaultOptionSetKey: null,
    version: 1,
    order: 0,
    status: "ACTIVE",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("QuestionCard: collapsed by default", () => {
  it("shows only a summary row -- no field inputs are on screen until expanded", () => {
    const q = question({
      id: "q1",
      key: "program-gender",
      prompt: "What kind of program are you looking for?",
      version: 3,
      status: "RETIRED",
      options: [option({ id: "opt-1", key: "boys-only", label: "Boys only" }), option({ id: "opt-2", key: "mixed", label: "Mixed" })],
    });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    const toggle = screen.getByTestId("question-card-toggle-q1");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText("What kind of program are you looking for?")).toBeInTheDocument();
    expect(within(toggle).getByText("CHALLENGE")).toBeInTheDocument();
    expect(within(toggle).getByText("v3")).toBeInTheDocument();
    expect(within(toggle).getByText("Retired")).toBeInTheDocument();
    expect(within(toggle).getByText("2 options")).toBeInTheDocument();

    // No field inputs anywhere -- the body hasn't rendered.
    expect(screen.queryByDisplayValue("What kind of program are you looking for?")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Boys only")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("uses singular 'option' for exactly one option", () => {
    const q = question({ id: "q1", key: "life-stage", options: [option({ id: "opt-1", key: "a", label: "A" })] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expect(within(screen.getByTestId("question-card-toggle-q1")).getByText("1 option")).toBeInTheDocument();
  });

  it("shows a 'has conditions' badge only when showWhen or optionSetRules is set", () => {
    const withCondition = question({
      id: "q1",
      key: "service-intent",
      showWhen: { v: 1, when: { type: "answered", questionKey: "life-stage" } },
      options: [],
    });
    const withoutCondition = question({ id: "q2", key: "life-stage", order: -1, options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[withoutCondition, withCondition]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expect(within(screen.getByTestId("question-card-toggle-q1")).getByText("has conditions")).toBeInTheDocument();
    expect(within(screen.getByTestId("question-card-toggle-q2")).queryByText("has conditions")).not.toBeInTheDocument();
  });
});

describe("QuestionCard: expanding on click", () => {
  it("clicking the summary row reveals the full editable body", async () => {
    const user = userEvent.setup();
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    await user.click(screen.getByTestId("question-card-toggle-q1"));

    expect(screen.getByTestId("question-card-toggle-q1")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByDisplayValue("Question life-stage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("clicking again collapses it back", async () => {
    const user = userEvent.setup();
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    const toggle = screen.getByTestId("question-card-toggle-q1");
    await user.click(toggle);
    expect(screen.getByDisplayValue("Question life-stage")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByDisplayValue("Question life-stage")).not.toBeInTheDocument();
  });
});

describe("QuestionCard: a dirty card auto-expands and shows Unsaved in its summary", () => {
  it("stays expanded and shows the collapsed row's Unsaved badge even after clicking the toggle to collapse", async () => {
    const user = userEvent.setup();
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    const toggle = screen.getByTestId("question-card-toggle-q1");
    await user.click(toggle);
    const promptInput = screen.getByDisplayValue("Question life-stage");
    await user.clear(promptInput);
    await user.type(promptInput, "Changed prompt");

    expect(within(toggle).getByText("Unsaved")).toBeInTheDocument();

    // Attempting to collapse a dirty card is a no-op -- the body (and its Save/Cancel
    // bar, and any inline error) must never be hidden while there's something to
    // resolve.
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByDisplayValue("Changed prompt")).toBeInTheDocument();
  });
});
