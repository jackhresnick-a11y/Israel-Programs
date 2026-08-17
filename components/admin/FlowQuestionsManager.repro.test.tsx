// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowQuestionsManager, { type FlowOptionRow, type FlowQuestionRow } from "./FlowQuestionsManager";
import { ToastProvider } from "@/components/ui/Toast";

// The real app's useRouter().refresh() re-runs the server component tree and delivers
// FRESH props -- a plain vi.fn() no-op (as used by every other test below) never
// exercises that prop update at all. This mock instead calls a test-controlled
// callback so a wrapper component can re-render FlowQuestionsManager with data that
// reflects what the server would actually return after the PATCH landed.
const refreshSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refreshSpy(), push: vi.fn() }),
}));

/** Mirrors app/admin/flow/questions/page.tsx + FlowQuestionsManager's own
 * fetch-then-router.refresh() contract: after a PATCH succeeds and onSaved() (->
 * router.refresh()) fires, the REAL server would return the OPTION'S NEW matchMode.
 * This wrapper simulates that round trip by reading the option's live server-side
 * value straight out of the mocked fetch call history, so "what would a real refresh
 * actually deliver" isn't guessed at -- it's read back from the same PATCH call
 * MatchModeControl made. */
function Harness({ initialQuestions }: { initialQuestions: FlowQuestionRow[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  refreshSpy.mockImplementation(() => {
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        showWhen: savedShowWhen.has(q.id) ? savedShowWhen.get(q.id) : q.showWhen,
        options: q.options.map((o) => {
          const saved = savedMatchModes.get(o.id);
          return saved ? { ...o, matchMode: saved } : o;
        }),
      }))
    );
  });
  return (
    <ToastProvider>
      <FlowQuestionsManager questions={questions} tags={[]} durationOptions={[]} />
    </ToastProvider>
  );
}

const savedMatchModes = new Map<string, "WEIGHT" | "REQUIRE">();
const savedShowWhen = new Map<string, unknown>();

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

describe("MatchModeControl (via FlowQuestionsManager): Save button after a staged matchMode change", () => {
  const q = question({
    id: "q1",
    key: "program-gender",
    options: [
      option({ id: "opt-boys", key: "boys-only", label: "Boys only", matchMode: "WEIGHT" }),
      option({ id: "opt-mixed", key: "mixed", label: "Mixed", matchMode: "WEIGHT" }),
    ],
  });

  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    savedMatchModes.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/admin/flow/preview") {
          callCount++;
          // Real network latency, unlike an immediately-resolved mock -- matches
          // Next.js dev's actual timing where React 19 StrictMode's double-invoked
          // effect + an in-flight request can interleave.
          await new Promise((r) => setTimeout(r, 20));
          return new Response(JSON.stringify({ survivorCount: 185, totalCount: 460 }), { status: 200 });
        }
        const optionPatchMatch = /^\/api\/admin\/flow\/options\/(.+)$/.exec(url);
        if (optionPatchMatch && init?.method === "PATCH") {
          const body = JSON.parse(init.body as string);
          if (body.matchMode) savedMatchModes.set(optionPatchMatch[1], body.matchMode);
          return new Response(JSON.stringify({ id: optionPatchMatch[1], ...body }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("enables the Save button once the preview for the CURRENT selection has returned (React.StrictMode, as Next dev runs it)", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ToastProvider>
          <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
        </ToastProvider>
      </StrictMode>
    );

    const matchModeSelects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).value === "WEIGHT");
    expect(matchModeSelects).toHaveLength(2);
    const [matchModeSelect] = matchModeSelects;

    await user.selectOptions(matchModeSelect, "REQUIRE");

    await waitFor(
      () => {
        expect(screen.getByText(/185 of 460 programs would survive/)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    console.log("preview fetch call count:", callCount);

    const saveButton = screen.getByRole("button", { name: /Save eliminator change/i });
    expect(saveButton).toBeEnabled();
  });

  it("re-enables Save after toggling back to the original value and forward again", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    const matchModeSelects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).value === "WEIGHT");
    const [matchModeSelect] = matchModeSelects;

    await user.selectOptions(matchModeSelect, "REQUIRE");
    await waitFor(() => expect(screen.getByRole("button", { name: /Save eliminator change/i })).toBeEnabled());

    await user.selectOptions(matchModeSelect, "WEIGHT"); // back to original -- Save/Cancel block should vanish
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save eliminator change/i })).not.toBeInTheDocument());

    await user.selectOptions(matchModeSelect, "REQUIRE"); // forward again -- same key as the first attempt
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Save eliminator change/i });
      expect(btn).toBeEnabled();
    });
  });

  it("both options on the same question can be staged and saved independently", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );

    const matchModeSelects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).value === "WEIGHT");
    expect(matchModeSelects).toHaveLength(2);

    await user.selectOptions(matchModeSelects[0], "REQUIRE");
    await user.selectOptions(matchModeSelects[1], "REQUIRE");

    await waitFor(() => {
      const saveButtons = screen.getAllByRole("button", { name: /Save eliminator change/i });
      expect(saveButtons).toHaveLength(2);
      for (const btn of saveButtons) expect(btn).toBeEnabled();
    });
  });

  it("a real save-then-refresh cycle: Save disappears after saving, and a NEW edit on a DIFFERENT option still works", async () => {
    const user = userEvent.setup();
    render(<Harness initialQuestions={[q]} />);

    const matchModeSelects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).value === "WEIGHT");
    const [boysSelect, mixedSelect] = matchModeSelects;

    await user.selectOptions(boysSelect, "REQUIRE");
    const saveButton = await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Save eliminator change/i });
      expect(btn).toBeEnabled();
      return btn;
    });
    await user.click(saveButton);

    // After the real refresh delivers option.matchMode = "REQUIRE" (matching what was
    // just saved), the staging block should disappear entirely -- nothing left to save.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save eliminator change/i })).not.toBeInTheDocument());

    // Now stage a change on the OTHER (mixed) option, previously untouched.
    await user.selectOptions(mixedSelect, "REQUIRE");
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Save eliminator change/i });
      expect(btn).toBeEnabled();
    });
  });

  it("real save-then-refresh cycle: re-editing the SAME option after saving still enables Save", async () => {
    const user = userEvent.setup();
    render(<Harness initialQuestions={[q]} />);

    const matchModeSelects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).value === "WEIGHT");
    const [boysSelect] = matchModeSelects;

    await user.selectOptions(boysSelect, "REQUIRE");
    const saveButton = await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Save eliminator change/i });
      expect(btn).toBeEnabled();
      return btn;
    });
    await user.click(saveButton);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save eliminator change/i })).not.toBeInTheDocument());

    // boysSelect's DOM value is now "REQUIRE" (post-refresh, matching what was saved).
    // Toggle it back down to WEIGHT -- a second, independent staged edit on the SAME option.
    await user.selectOptions(boysSelect, "WEIGHT");
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Save eliminator change/i });
      expect(btn).toBeEnabled();
    });
  });
});

// The show-condition (showWhen) editor -- an explicit Save/Cancel added because the
// field used to save silently on blur (an uncontrolled defaultValue textarea, so a
// successful save produced zero visible change) and, on failure, surfaced a bare
// "Unauthorized" or validation string in a page-top banner disconnected from the field.
// Since RuleEditor (components/admin/flow/RuleEditor.tsx) replaced that bare textarea
// with a builder/raw-JSON toggle, these tests open the "Raw JSON" view first -- every
// other invariant (no silent save, Unsaved badge, disabled-on-invalid-JSON, Cancel is a
// zero-write revert, 401/403 reads as "session expired") is unchanged and re-asserted
// here scoped to this question's data-testid="show-when-<id>" container, since a real
// page renders one RuleEditor + one OptionSetRulesEditor per question and an unscoped
// query would be ambiguous the moment more than one question is on screen.
describe("RuleEditor (via FlowQuestionsManager): explicit Save/Cancel for the show-condition field", () => {
  // An earlier question is required so VALID_SHOW_WHEN can name a legitimate backward
  // reference -- RuleEditor now validates references client-side before allowing Save
  // (see lib/flowRuleBuilder.ts's validateRawCondition), so a condition naming its own
  // question (the old fixture's shape) would correctly be blocked as a self-reference.
  const earlier = question({ id: "q0", key: "opener", order: -1, options: [] });
  const q = question({ id: "q1", key: "life-stage", order: 0, options: [] });

  const SHOW_WHEN_PLACEHOLDER =
    '{"v":1,"when":{"type":"answerIn","questionKey":"life-stage","optionKeys":["working"]}}';
  const VALID_SHOW_WHEN = { v: 1, when: { type: "answered", questionKey: "opener" } };
  const VALID_SHOW_WHEN_TEXT = JSON.stringify(VALID_SHOW_WHEN, null, 2);

  let patchCalls: Array<{ id: string; body: { showWhen?: unknown } }>;
  let patchStatus: number;

  beforeEach(() => {
    patchCalls = [];
    patchStatus = 200;
    savedShowWhen.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const match = /^\/api\/admin\/flow\/questions\/(.+)$/.exec(url);
        if (match && init?.method === "PATCH") {
          const body = JSON.parse(init.body as string);
          patchCalls.push({ id: match[1], body });
          if (patchStatus !== 200) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: patchStatus });
          }
          if ("showWhen" in body) savedShowWhen.set(match[1], body.showWhen);
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

  /** Switches question "q1"'s show-condition editor to raw-JSON view and returns its
   * textarea, scoped to that question's own container. */
  function openRawShowWhen() {
    const container = screen.getByTestId("show-when-q1");
    fireEvent.click(within(container).getByRole("button", { name: "Raw JSON" }));
    return within(container).getByPlaceholderText(SHOW_WHEN_PLACEHOLDER);
  }

  it("editing the text alone fires no PATCH -- saving now requires the explicit button", async () => {
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: VALID_SHOW_WHEN_TEXT } });
    fireEvent.blur(textarea);
    expect(patchCalls).toHaveLength(0);
  });

  it("a valid edit shows Unsaved and enables Save; clicking Save PATCHes once and shows a success toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: VALID_SHOW_WHEN_TEXT } });

    const container = screen.getByTestId("show-when-q1");
    expect(within(container).getByText("Unsaved")).toBeInTheDocument();
    const saveButton = within(container).getByRole("button", { name: /Save show-condition/i });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ id: "q1", body: { showWhen: VALID_SHOW_WHEN } });
    await waitFor(() => expect(screen.getByText("Show-condition saved")).toBeInTheDocument());
  });

  it("invalid JSON keeps Save disabled with an inline parse error and sends no request", async () => {
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: "{ not json" } });

    const container = screen.getByTestId("show-when-q1");
    expect(within(container).getByText("Not valid JSON")).toBeInTheDocument();
    const saveButton = within(container).getByRole("button", { name: /Save show-condition/i });
    expect(saveButton).toBeDisabled();

    await userEvent.setup().click(saveButton);
    expect(patchCalls).toHaveLength(0);
  });

  it("Cancel reverts to the live value with zero writes", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: VALID_SHOW_WHEN_TEXT } });
    const container = screen.getByTestId("show-when-q1");
    expect(within(container).getByText("Unsaved")).toBeInTheDocument();

    await user.click(within(container).getByRole("button", { name: /Cancel/i }));

    expect(textarea).toHaveValue(""); // q.showWhen is null -> jsonText(null) === ""
    expect(within(container).queryByText("Unsaved")).not.toBeInTheDocument();
    expect(patchCalls).toHaveLength(0);
  });

  it("a 401/403 from the server renders a session-expired message, not the raw 'Unauthorized' string", async () => {
    const user = userEvent.setup();
    patchStatus = 403;
    render(
      <ToastProvider>
        <FlowQuestionsManager questions={[earlier, q]} tags={[]} durationOptions={[]} />
      </ToastProvider>
    );
    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: VALID_SHOW_WHEN_TEXT } });
    const container = screen.getByTestId("show-when-q1");
    await user.click(within(container).getByRole("button", { name: /Save show-condition/i }));

    await waitFor(() => expect(within(container).getByText(/session expired/i)).toBeInTheDocument());
    expect(within(container).queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("a real save-then-refresh cycle: the staging block disappears once the saved value comes back as props", async () => {
    const user = userEvent.setup();
    render(<Harness initialQuestions={[earlier, q]} />);

    const textarea = openRawShowWhen();
    fireEvent.change(textarea, { target: { value: VALID_SHOW_WHEN_TEXT } });
    const container = screen.getByTestId("show-when-q1");
    const saveButton = within(container).getByRole("button", { name: /Save show-condition/i });
    await user.click(saveButton);

    await waitFor(() => expect(within(container).queryByText("Unsaved")).not.toBeInTheDocument());
  });
});
