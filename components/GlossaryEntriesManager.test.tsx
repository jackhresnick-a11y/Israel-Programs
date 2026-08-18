// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlossaryEntriesManager from "./GlossaryEntriesManager";
import { ToastProvider } from "@/components/ui/Toast";
import type { GlossaryEntry } from "@/lib/glossaryContent";

// Mirrors app/admin/glossary/page.tsx + the manager's own fetch-then-router.refresh()
// contract -- a plain vi.fn() no-op never exercises the prop update a real refresh
// would deliver, which is exactly what the dirty-state-clears-on-save behavior depends
// on (see components/admin/FlowQuestionsManager.repro.test.tsx for the same pattern).
const refreshSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refreshSpy(), push: vi.fn() }),
}));

let savedEntries: GlossaryEntry[] | null = null;

/** Re-renders with whatever the last successful PATCH body was, simulating what the
 * real server would return via getGlossaryEntries() after router.refresh(). */
function Harness({ initial }: { initial: GlossaryEntry[] }) {
  const [entries, setEntries] = useState(initial);
  refreshSpy.mockImplementation(() => {
    if (savedEntries) setEntries(savedEntries);
  });
  return (
    <ToastProvider>
      <GlossaryEntriesManager initial={entries} />
    </ToastProvider>
  );
}

function entry(overrides: Partial<GlossaryEntry> & Pick<GlossaryEntry, "slug" | "term">): GlossaryEntry {
  return {
    termHe: null,
    alsoKnownAs: [],
    kind: "term",
    summary: "A summary long enough to pass validation.",
    sections: [{ heading: "Overview", body: "Some body text." }],
    programLinks: [],
    related: [],
    published: true,
    ...overrides,
  };
}

describe("GlossaryEntriesManager", () => {
  let patchBodies: Array<{ entries: GlossaryEntry[] }>;
  let patchStatus: number;
  let patchError: string | null;

  beforeEach(() => {
    patchBodies = [];
    patchStatus = 200;
    patchError = null;
    savedEntries = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/admin/glossary" && init?.method === "PATCH") {
          const body = JSON.parse(init.body as string);
          patchBodies.push(body);
          if (patchStatus !== 200) {
            return new Response(JSON.stringify({ error: patchError ?? "Failed to save" }), { status: patchStatus });
          }
          savedEntries = body.entries;
          return new Response(JSON.stringify({ entries: body.entries }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("typing into an entry shows an Unsaved badge and the sticky counter", async () => {
    const initial = [entry({ slug: "mechina", term: "Mechina" })];
    render(<Harness initial={initial} />);

    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();

    const summary = screen.getByDisplayValue("A summary long enough to pass validation.");
    fireEvent.change(summary, { target: { value: "An updated summary long enough to pass validation." } });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByText(/1 entry has unsaved changes/)).toBeInTheDocument();
  });

  it("clicking an entry's Save PATCHes the full entries array (honest-scope contract) and toasts success", async () => {
    const user = userEvent.setup();
    const initial = [
      entry({ slug: "mechina", term: "Mechina" }),
      entry({ slug: "hesder", term: "Hesder" }),
    ];
    render(<Harness initial={initial} />);

    // Two entries share the same placeholder summary text -- scope to the first.
    const summaries = screen.getAllByDisplayValue("A summary long enough to pass validation.");
    fireEvent.change(summaries[0], { target: { value: "Mechina updated summary text here." } });

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    await user.click(saveButtons[0]);

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0].entries).toHaveLength(2);
    expect(patchBodies[0].entries[0].summary).toBe("Mechina updated summary text here.");
    expect(patchBodies[0].entries[1].slug).toBe("hesder");

    await waitFor(() => expect(screen.getByText("Glossary saved")).toBeInTheDocument());
  });

  it("after the simulated refresh, Unsaved clears on every entry and the sticky bar unmounts", async () => {
    const user = userEvent.setup();
    const initial = [entry({ slug: "mechina", term: "Mechina" })];
    render(<Harness initial={initial} />);

    const summary = screen.getByDisplayValue("A summary long enough to pass validation.");
    fireEvent.change(summary, { target: { value: "Updated summary text goes here now." } });
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
  });

  it("Add term then Save shows a slug error on the NEW entry and fires no request", async () => {
    const user = userEvent.setup();
    const initial = [entry({ slug: "mechina", term: "Mechina" })];
    render(<Harness initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Add term" }));

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    // The new blank entry is the second "term" card.
    await user.click(saveButtons[saveButtons.length - 1]);

    expect(patchBodies).toHaveLength(0);
    expect(screen.getByText(/Slug:/)).toBeInTheDocument();
  });

  it("a non-ok response surfaces its error on the entry that was saved, not only at the top of the form", async () => {
    const user = userEvent.setup();
    patchStatus = 500;
    patchError = "Failed to save the glossary";
    const initial = [entry({ slug: "mechina", term: "Mechina" })];
    render(<Harness initial={initial} />);

    const summary = screen.getByDisplayValue("A summary long enough to pass validation.");
    fireEvent.change(summary, { target: { value: "Updated summary text goes here now." } });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Failed to save the glossary")).toBeInTheDocument());
  });
});
