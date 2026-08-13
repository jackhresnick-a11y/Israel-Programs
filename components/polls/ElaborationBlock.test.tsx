// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElaborationBlock from "./ElaborationBlock";
import type { ElaborationPrompt } from "@/lib/pollElaborationPromptsConfig";

/**
 * The end-of-poll elaboration block's interactive behavior -- the first interactive
 * (not renderToStaticMarkup) test for this component, same jsdom/@testing-library
 * precedent as components/admin/FlowQuestionsManager.repro.test.tsx: chooser → open →
 * added → "Answer another" is real onClick/onChange sequences and live useEffect-driven
 * state (the answered-keys fetch on mount), which a pure-function or SSR-snapshot test
 * can't reach.
 */

const PROMPTS: ElaborationPrompt[] = [
  { key: "wish_known", text: "What do you wish you'd known before you came?", enabled: true },
  { key: "wrong_for", text: "Who would this program be wrong for?", enabled: true },
  { key: "surprised", text: "What surprised you most?", enabled: true },
  { key: "year_before", text: "What would you tell yourself the year before you went?", enabled: true },
];

function mockFetchOk(handlers: { get?: object; post?: object }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = method === "POST" ? handlers.post ?? { ok: true, skipped: false } : handlers.get ?? { ok: true, answeredPromptKeys: [] };
    return {
      ok: true,
      json: async () => body,
    } as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOk({}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ElaborationBlock chooser", () => {
  it("renders all four prompts as tappable rows and zero <select> elements", async () => {
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await waitFor(() => expect(screen.getAllByRole("button", { hidden: false })).not.toHaveLength(0));

    for (const prompt of PROMPTS) {
      expect(screen.getByText(prompt.text)).toBeInTheDocument();
    }
    expect(document.querySelectorAll("select")).toHaveLength(0);
  });

  it("renders nothing when there are no prompts configured", () => {
    const { container } = render(<ElaborationBlock responseId="resp_1" prompts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ElaborationBlock choose → open → add flow", () => {
  it("tapping a prompt row reveals a textarea for that prompt", async () => {
    const user = userEvent.setup();
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await user.click(await screen.findByText("What surprised you most?"));

    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add this/i })).toBeInTheDocument();
  });

  it("a successful submission shows the confirmation and an 'Answer another' link", async () => {
    const user = userEvent.setup();
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await user.click(await screen.findByText("What surprised you most?"));
    await user.type(screen.getByRole("textbox"), "It was much more physical than I expected.");
    await user.click(screen.getByRole("button", { name: /add this/i }));

    expect(await screen.findByText(/a moderator will review it/i)).toBeInTheDocument();
    expect(screen.getByText("Answer another")).toBeInTheDocument();
  });

  it("'Answer another' reopens the chooser with exactly the three remaining prompts", async () => {
    const user = userEvent.setup();
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await user.click(await screen.findByText("What surprised you most?"));
    await user.type(screen.getByRole("textbox"), "Some answer text here.");
    await user.click(screen.getByRole("button", { name: /add this/i }));

    await user.click(await screen.findByText("Answer another"));

    expect(screen.getByText("What do you wish you'd known before you came?")).toBeInTheDocument();
    expect(screen.getByText("Who would this program be wrong for?")).toBeInTheDocument();
    expect(screen.getByText("What would you tell yourself the year before you went?")).toBeInTheDocument();
    expect(screen.queryByText("What surprised you most?")).not.toBeInTheDocument();
  });

  it("a reload with already-answered prompts (fetched from the server) excludes them from the chooser", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ get: { ok: true, answeredPromptKeys: ["wish_known", "wrong_for"] } }));
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await waitFor(() => {
      expect(screen.queryByText("What do you wish you'd known before you came?")).not.toBeInTheDocument();
    });
    expect(screen.getByText("What surprised you most?")).toBeInTheDocument();
    expect(screen.getByText("What would you tell yourself the year before you went?")).toBeInTheDocument();
  });

  it("cancel returns to the chooser without submitting", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetchOk({});
    vi.stubGlobal("fetch", fetchSpy);
    render(<ElaborationBlock responseId="resp_1" prompts={PROMPTS} />);

    await user.click(await screen.findByText("What surprised you most?"));
    await user.type(screen.getByRole("textbox"), "Draft I don't want to send");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("What surprised you most?")).toBeInTheDocument();
    // Only the GET (answered keys, on mount) fired -- no POST for the cancelled draft.
    const postCalls = fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(0);
  });
});
