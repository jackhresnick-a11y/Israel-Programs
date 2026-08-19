// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferenceRemovalActions from "./ReferenceRemovalActions";

/**
 * The self-removal confirm-and-POST. Two properties matter enough to pin:
 *
 * 1. Rendering the page must not remove anyone. The whole reason this is a button and not
 *    a GET link is that an email scanner or browser prefetch would otherwise unlist people
 *    who never opened the message -- same reasoning as ReferenceApprovalActions.
 * 2. A failure must say so. Someone trying to take their contact details off a public page
 *    is the last person who should be left unsure whether it worked.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReferenceRemovalActions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as Response));
  });

  it("sends nothing until the button is pressed", () => {
    render(<ReferenceRemovalActions token="tok_live" />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /remove me as a reference/i })).toBeInTheDocument();
  });

  it("POSTs to the token route and confirms in place", async () => {
    const user = userEvent.setup();
    render(<ReferenceRemovalActions token="tok_live" />);

    await user.click(screen.getByRole("button", { name: /remove me as a reference/i }));

    await waitFor(() => expect(screen.getByText(/you’ve been removed/i)).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/references/remove/tok_live", { method: "POST" });
  });

  it("says plainly that nothing happened when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    const user = userEvent.setup();
    render(<ReferenceRemovalActions token="tok_live" />);

    await user.click(screen.getByRole("button", { name: /remove me as a reference/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/have not been removed yet/i);
    // The button stays available so they can retry.
    expect(screen.getByRole("button", { name: /remove me as a reference/i })).toBeEnabled();
  });
});
