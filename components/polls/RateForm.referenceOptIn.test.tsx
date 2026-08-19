// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RateForm from "./RateForm";
import {
  POLL_REFERENCE_SECTION_TITLE,
  POLL_REFERENCE_SECTION_ASSURANCE,
  POLL_REFERENCE_CONSENT_LABEL,
  type PollQuestionDTO,
} from "@/lib/pollShared";

/**
 * The reference opt-in as a section: that it renders with its own header, that it keeps
 * its place in the form, that the 18+ gate still holds, and that the two client beacons
 * fire once each. Same jsdom/@testing-library precedent as ElaborationBlock.test.tsx --
 * the ordering and the beacons are both live DOM/effect behaviour that a pure-function
 * test can't reach.
 *
 * Anonymous mode is the one exercised here because it is the path that produces almost
 * every reference; the block itself is one shared component rendered identically by both
 * forms, so covering it twice would only assert that JSX was copied correctly.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function question(id: string): PollQuestionDTO {
  return {
    id,
    key: id,
    text: `Question ${id}`,
    type: "STARS",
    labels: ["1", "2", "3", "4", "5"],
    dropdownOptions: null,
    version: 1,
    status: "ACTIVE",
    scaleType: "EVALUATIVE",
    lowPhrase: null,
    highPhrase: null,
    tier: "CONTEXTUAL",
    optionKind: null,
  };
}

/** Records every POST /api/polls/events beacon so the tests can assert on type + count. */
let events: { type: string; responseId: string }[] = [];

/** jsdom has no IntersectionObserver. This one exposes its callback so a test can drive a
 *  real intersection rather than reaching into component internals. */
let triggerIntersection: (() => void) | null = null;

function installIntersectionObserver() {
  class FakeIntersectionObserver {
    constructor(private cb: IntersectionObserverCallback) {
      triggerIntersection = () =>
        this.cb(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}

beforeEach(() => {
  events = [];
  triggerIntersection = null;
  installIntersectionObserver();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/polls/events")) {
        events.push(JSON.parse(String(init?.body)));
        return { ok: true, status: 204, json: async () => ({}) } as Response;
      }
      if (url.includes("/responses/open")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            responseId: "resp_1",
            status: "INCOMPLETE",
            answers: {},
            naQuestionIds: [],
            submittedAt: null,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderForm() {
  return render(
    <RateForm
      mode="anonymous"
      programId="prog_1"
      programSlug="a-program"
      programName="A Program"
      referrerToken="tok"
      questions={[question("q1"), question("q2")]}
      extras={[]}
      postPollCta={null}
      sharePollLink={null}
      elaborationPrompts={[{ key: "wish_known", text: "What do you wish you had known?", enabled: true }]}
    />
  );
}

describe("the reference opt-in section", () => {
  it("renders its own header and the full assurance line", async () => {
    renderForm();
    expect(await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE })).toBeInTheDocument();
    expect(screen.getByText(POLL_REFERENCE_SECTION_ASSURANCE)).toBeInTheDocument();
    expect(screen.getByText(POLL_REFERENCE_CONSENT_LABEL)).toBeInTheDocument();
  });

  it("sits above the elaboration block, with submit last in normal flow", async () => {
    const { container } = renderForm();
    await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE });

    const optIn = container.querySelector("[data-poll-reference-optin]")!;
    const elaboration = container.querySelector("[data-poll-elaboration]")!;
    const submit = container.querySelector("[data-poll-submit]")!;
    expect(optIn).toBeTruthy();
    expect(elaboration).toBeTruthy();

    // Node.compareDocumentPosition: FOLLOWING (4) means the argument comes after the node.
    expect(optIn.compareDocumentPosition(elaboration) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(elaboration.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Submit is a plain in-flow element -- no sticky/fixed docked bar.
    const submitWrapper = submit.closest("div")!;
    expect(submitWrapper.className).not.toMatch(/sticky|fixed/);
  });

  it("keeps the email field gated behind the 18+ attestation", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE });

    const email = container.querySelector("[data-poll-reference-email]") as HTMLInputElement;
    expect(email).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    expect(email).toBeEnabled();
  });

  it("fires reference_optin_viewed once, when the section is actually scrolled to", async () => {
    renderForm();
    await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE });
    await waitFor(() => expect(triggerIntersection).not.toBeNull());

    // Rendered is not seen: nothing fires until the section intersects.
    expect(events.filter((e) => e.type === "reference_optin_viewed")).toHaveLength(0);

    triggerIntersection!();
    triggerIntersection!();
    await waitFor(() =>
      expect(events.filter((e) => e.type === "reference_optin_viewed")).toHaveLength(1)
    );
    expect(events.find((e) => e.type === "reference_optin_viewed")?.responseId).toBe("resp_1");
  });

  it("fires reference_optin_focused once, on first focus of the email field", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE });

    await user.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    const email = container.querySelector("[data-poll-reference-email]") as HTMLInputElement;

    await user.click(email);
    await user.click(document.body);
    await user.click(email);

    await waitFor(() =>
      expect(events.filter((e) => e.type === "reference_optin_focused")).toHaveLength(1)
    );
  });

  it("never blocks submission on the email — it stays entirely optional", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await screen.findByRole("heading", { name: POLL_REFERENCE_SECTION_TITLE });

    await user.click(container.querySelector("[data-poll-submit]") as HTMLElement);

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("/submit"))).toBe(true);
    });
    // No error surfaced, and nothing asked for an email first.
    expect(container.querySelector("[data-poll-error]")).toBeNull();
  });
});
