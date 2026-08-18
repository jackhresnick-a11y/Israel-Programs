// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowQuestionsManager, { type FlowOptionRow, type FlowQuestionRow } from "./FlowQuestionsManager";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Coverage for the visual rule builder (components/admin/flow/*) introduced to replace
 * the bare showWhen textarea -- see lib/flowRuleBuilder.ts for the pure builder<->JSON
 * translation this exercises through the real admin UI. Mirrors
 * FlowQuestionsManager.repro.test.tsx's fixture/mocking shape.
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

/** QuestionCard (commit 5) collapses to a summary row by default -- every field this
 * test file interacts with lives in the expanded body. */
function expandCard(questionId: string) {
  fireEvent.click(screen.getByTestId(`question-card-toggle-${questionId}`));
}

let patchCalls: Array<{ id: string; body: Record<string, unknown> }>;

beforeEach(() => {
  patchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const match = /^\/api\/admin\/flow\/questions\/(.+)$/.exec(url);
      if (match && init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        patchCalls.push({ id: match[1], body });
        return new Response(JSON.stringify({ id: match[1], ...body }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("Building a show-condition rule through the dropdowns", () => {
  it("produces the expected JSON and Save PATCHes exactly that value once", async () => {
    const user = userEvent.setup();
    const earlier = question({
      id: "q0",
      key: "life-stage",
      order: 0,
      options: [option({ id: "opt-working", key: "working", label: "Working / later" })],
    });
    const target = question({ id: "q1", key: "program-gender", order: 1, options: [] });

    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, target]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const container = screen.getByTestId("show-when-q1");
    await user.click(within(container).getByRole("button", { name: "Add rule row" }));

    // Row appears with default operator "answered" and no question chosen yet. Its two
    // <select>s (question, operator) are the only comboboxes in this container -- the
    // "Match all of/any of" selector only appears once rows.length > 1.
    const rowSelects = within(container).getAllByRole("combobox");
    const [questionDropdown, operatorDropdown] = rowSelects;
    await user.selectOptions(questionDropdown, "life-stage");
    await user.selectOptions(operatorDropdown, "isOneOf");

    await user.click(within(container).getByRole("button", { name: /choose options/i }));
    await user.click(within(container).getByRole("checkbox", { name: "Working / later" }));

    const saveButton = within(container).getByRole("button", { name: /Save show-condition/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({
      id: "q1",
      body: {
        showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
      },
    });
  });
});

describe("A show-condition the builder can't model stays raw-JSON-only", () => {
  const UNMODELABLE_SHOW_WHEN = {
    v: 1,
    when: {
      type: "all",
      of: [
        { type: "answered", questionKey: "opener" },
        { type: "any", of: [{ type: "answered", questionKey: "opener" }] },
      ],
    },
  };

  it("survives an unrelated field save on the same card byte-for-byte", async () => {
    const earlier = question({ id: "q0", key: "opener", order: 0, options: [] });
    const target = question({
      id: "q1",
      key: "service-intent",
      order: 1,
      showWhen: UNMODELABLE_SHOW_WHEN,
      options: [],
    });

    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, target]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const container = screen.getByTestId("show-when-q1");
    // Locked to raw view (the row builder can't model nested groups) and untouched, so
    // there's nothing to save -- no Save button, no "Unsaved" badge.
    expect(within(container).queryByRole("button", { name: /Builder/i })).toBeDisabled();
    expect(within(container).queryByRole("button", { name: /Save show-condition/i })).not.toBeInTheDocument();
    expect(within(container).queryByText("Unsaved")).not.toBeInTheDocument();

    const textarea = within(container).getByRole("textbox") as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value)).toEqual(UNMODELABLE_SHOW_WHEN);

    // Editing an UNRELATED field on the same card (the prompt) and saving the card
    // (per-field edits stage behind one card-wide Save -- see QuestionCard) doesn't
    // touch this field at all.
    const promptInput = screen.getByDisplayValue("Question service-intent");
    fireEvent.change(promptInput, { target: { value: "New prompt text" } });
    const saveQuestionButton = await screen.findByRole("button", { name: /Save question/i });
    fireEvent.click(saveQuestionButton);

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ id: "q1", body: { prompt: "New prompt text" } });

    // The unmodelable rule was never touched by that save.
    expect(JSON.parse(textarea.value)).toEqual(UNMODELABLE_SHOW_WHEN);
  });
});

describe("A rule naming an unknown option key blocks Save", () => {
  it("disables Save with an inline error and sends no request", async () => {
    const earlier = question({
      id: "q0",
      key: "life-stage",
      order: 0,
      options: [option({ id: "opt-working", key: "working", label: "Working / later" })],
    });
    const target = question({ id: "q1", key: "program-gender", order: 1, options: [] });

    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, target]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const container = screen.getByTestId("show-when-q1");
    fireEvent.click(within(container).getByRole("button", { name: "Raw JSON" }));
    const textarea = within(container).getByRole("textbox");

    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          v: 1,
          when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["typo-key"] },
        }),
      },
    });

    await waitFor(() =>
      expect(within(container).getByText(/unknown option key\(s\) \[typo-key\]/)).toBeInTheDocument()
    );
    const saveButton = within(container).getByRole("button", { name: /Save show-condition/i });
    expect(saveButton).toBeDisabled();

    expect(patchCalls).toHaveLength(0);
  });
});

describe("The plain-English rule summary line", () => {
  it("uses the real question prompt and option label, and stays visible after switching to Raw JSON", async () => {
    const user = userEvent.setup();
    const earlier = question({
      id: "q0",
      key: "life-stage",
      order: 0,
      prompt: "What stage will you be in when you go?",
      options: [option({ id: "opt-working", key: "working", label: "Working / later" })],
    });
    const target = question({
      id: "q1",
      key: "program-gender",
      order: 1,
      showWhen: { v: 1, when: { type: "answerIn", questionKey: "life-stage", optionKeys: ["working"] } },
      options: [],
    });

    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, target]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const container = screen.getByTestId("show-when-q1");
    const summary = "'What stage will you be in when you go?' is Working / later";
    expect(within(container).getByText(`Shown when ${summary}`)).toBeInTheDocument();

    // Still shown after toggling to the raw-JSON view -- it's more useful there, not less.
    fireEvent.click(within(container).getByRole("button", { name: "Raw JSON" }));
    expect(within(container).getByText(`Shown when ${summary}`)).toBeInTheDocument();

    // And back again.
    await user.click(within(container).getByRole("button", { name: "Builder" }));
    expect(within(container).getByText(`Shown when ${summary}`)).toBeInTheDocument();
  });

  it("renders one line per option-set rule plus a default line, in both views", () => {
    const earlier = question({
      id: "q0",
      key: "program-gender",
      order: 0,
      prompt: "What kind of program are you looking for?",
      options: [option({ id: "opt-boys", key: "boys-only", label: "Boys only" })],
    });
    const target = question({
      id: "q1",
      key: "program-essence",
      order: 1,
      optionSetRules: {
        v: 1,
        default: "mixed",
        rules: [{ optionSetKey: "boys", when: { type: "answerIn", questionKey: "program-gender", optionKeys: ["boys-only"] } }],
      },
      options: [],
    });

    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, target]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const container = screen.getByTestId("option-set-rules-q1");
    expect(
      within(container).getByText("'What kind of program are you looking for?' is Boys only → option set: boys")
    ).toBeInTheDocument();
    expect(within(container).getByText("Otherwise → option set: mixed")).toBeInTheDocument();

    fireEvent.click(within(container).getByRole("button", { name: "Raw JSON" }));
    expect(
      within(container).getByText("'What kind of program are you looking for?' is Boys only → option set: boys")
    ).toBeInTheDocument();
  });
});
