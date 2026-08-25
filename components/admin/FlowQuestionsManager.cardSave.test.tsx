// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowQuestionsManager, { type FlowOptionRow, type FlowQuestionRow } from "./FlowQuestionsManager";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Coverage for QuestionCard's staged, explicit per-question Save/Cancel -- the
 * replacement for the prior save-on-blur/save-on-change behavior every field in this
 * manager used to have. Nothing here should PATCH before "Save question" is clicked;
 * Cancel must revert with zero writes; a save failure must surface inline and leave
 * the draft intact rather than silently discarding it.
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

let patchCalls: Array<{ url: string; body: Record<string, unknown> }>;
let patchStatus: number;

beforeEach(() => {
  patchCalls = [];
  patchStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        patchCalls.push({ url, body });
        if (patchStatus !== 200) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: patchStatus });
        }
        return new Response(JSON.stringify({ ...body }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** QuestionCard (commit 5) collapses to a summary row by default -- every field this
 * test file interacts with lives in the expanded body. */
function expandCard(questionId: string) {
  fireEvent.click(screen.getByTestId(`question-card-toggle-${questionId}`));
}

describe("QuestionCard: editing a field alone fires no PATCH", () => {
  it("typing in the prompt field sends no request until Save is clicked", async () => {
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const promptInput = screen.getByDisplayValue("Question life-stage");
    fireEvent.change(promptInput, { target: { value: "New prompt" } });

    expect(patchCalls).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Save question/i })).toBeEnabled();
  });
});

describe("QuestionCard: Save batches question + changed-option PATCHes and toasts once", () => {
  it("saves a question field and a dirty option's field together", async () => {
    const user = userEvent.setup();
    const q = question({
      id: "q1",
      key: "program-gender",
      options: [option({ id: "opt-1", key: "boys-only", label: "Boys only" })],
    });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    fireEvent.change(screen.getByDisplayValue("Question program-gender"), {
      target: { value: "What kind of program?" },
    });
    fireEvent.change(screen.getByDisplayValue("Boys only"), { target: { value: "Boys Only (Yeshiva)" } });

    const saveButton = screen.getByRole("button", { name: /Save question/i });
    await user.click(saveButton);

    await waitFor(() => expect(patchCalls).toHaveLength(2));
    const questionPatch = patchCalls.find((c) => c.url === "/api/admin/flow/questions/q1");
    const optionPatch = patchCalls.find((c) => c.url === "/api/admin/flow/options/opt-1");
    expect(questionPatch?.body).toEqual({ prompt: "What kind of program?" });
    expect(optionPatch?.body).toEqual({ label: "Boys Only (Yeshiva)" });

    await waitFor(() => expect(screen.getByText("Question saved")).toBeInTheDocument());
  });

  it("toggling an option's tag checkbox stages it rather than saving immediately", async () => {
    const user = userEvent.setup();
    const q = question({
      id: "q1",
      key: "program-gender",
      options: [option({ id: "opt-1", key: "boys-only", label: "Boys only" })],
    });
    render(
      <ToastProvider>
        <FlowQuestionsManager
          questions={[q]}
          tags={[{ slug: "orthodox", name: "Orthodox", category: "affiliation" }]}
          durationOptions={[]}
        />
      </ToastProvider>
    );
    expandCard("q1");

    // The "affiliation" facet section is collapsed by default (nothing selected, no
    // filter) -- FacetCheckboxGroups (commit 4) requires expanding it first.
    await user.click(screen.getByRole("button", { name: "affiliation" }));
    const checkbox = screen.getByRole("checkbox", { name: "Orthodox" });
    await user.click(checkbox);
    expect(patchCalls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Save question/i }));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({
      url: "/api/admin/flow/options/opt-1",
      body: { tagSlugs: ["orthodox"] },
    });
  });
});

describe("QuestionCard: Cancel reverts with zero writes", () => {
  it("reverts both a question field and an option field edit", async () => {
    const user = userEvent.setup();
    const q = question({
      id: "q1",
      key: "program-gender",
      options: [option({ id: "opt-1", key: "boys-only", label: "Boys only" })],
    });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    const promptInput = screen.getByDisplayValue("Question program-gender");
    fireEvent.change(promptInput, { target: { value: "Changed" } });
    const labelInput = screen.getByDisplayValue("Boys only");
    fireEvent.change(labelInput, { target: { value: "Changed label" } });

    expect(screen.getAllByText("Unsaved").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(screen.getByDisplayValue("Question program-gender")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Boys only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save question/i })).not.toBeInTheDocument();
    expect(patchCalls).toHaveLength(0);
  });
});

describe("QuestionCard: a save failure surfaces inline and preserves the draft", () => {
  it("a 403 renders a session-expired message, not the raw 'Unauthorized' string, and keeps the edit", async () => {
    const user = userEvent.setup();
    patchStatus = 403;
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    fireEvent.change(screen.getByDisplayValue("Question life-stage"), { target: { value: "New prompt" } });
    await user.click(screen.getByRole("button", { name: /Save question/i }));

    await waitFor(() => expect(screen.getByText(/session expired/i)).toBeInTheDocument());
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
    // The edit itself is preserved, not silently discarded.
    expect(screen.getByDisplayValue("New prompt")).toBeInTheDocument();
  });
});

describe("QuestionCard: a blank touched prompt or option label blocks Save", () => {
  it("disables Save while the prompt is blank", async () => {
    const q = question({ id: "q1", key: "life-stage", options: [] });
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    expandCard("q1");

    fireEvent.change(screen.getByDisplayValue("Question life-stage"), { target: { value: "" } });

    const saveButton = await screen.findByRole("button", { name: /Save question/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/must be non-empty/i)).toBeInTheDocument();
  });
});
