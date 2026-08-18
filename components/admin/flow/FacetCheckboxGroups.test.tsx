// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FacetCheckboxGroups from "./FacetCheckboxGroups";

afterEach(() => cleanup());

const TAGS_BY_CATEGORY = new Map([
  ["affiliation", [{ slug: "orthodox", name: "Orthodox" }, { slug: "secular", name: "Secular" }]],
  ["gender", [{ slug: "boys", name: "Boys" }]],
]);
const DURATION_OPTIONS = [{ value: "GAP_YEAR", label: "Gap year" }];

describe("FacetCheckboxGroups", () => {
  it("collapses every section by default when nothing is selected and there's no filter", () => {
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={[]}
        selectedDurationValues={[]}
        onToggleTag={vi.fn()}
        onToggleDuration={vi.fn()}
      />
    );
    expect(screen.queryByRole("checkbox", { name: "Orthodox" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "affiliation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duration" })).toBeInTheDocument();
  });

  it("auto-expands a section that already has a selection, with a pinned chip at top", () => {
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={["orthodox"]}
        selectedDurationValues={[]}
        onToggleTag={vi.fn()}
        onToggleDuration={vi.fn()}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Orthodox" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Orthodox" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Remove Orthodox/i })).toBeInTheDocument();
    // A section with no selection stays collapsed even while a sibling is expanded.
    expect(screen.queryByRole("checkbox", { name: "Boys" })).not.toBeInTheDocument();
  });

  it("clicking a section header expands it, revealing its checkboxes", async () => {
    const user = userEvent.setup();
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={[]}
        selectedDurationValues={[]}
        onToggleTag={vi.fn()}
        onToggleDuration={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "affiliation" }));
    expect(screen.getByRole("checkbox", { name: "Orthodox" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Secular" })).toBeInTheDocument();
  });

  it("shows a selected-count badge on a collapsed section", async () => {
    const user = userEvent.setup();
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={["orthodox", "secular"]}
        selectedDurationValues={[]}
        onToggleTag={vi.fn()}
        onToggleDuration={vi.fn()}
      />
    );
    // Auto-expanded (has a selection) -- collapse it back to see the badge.
    await user.click(screen.getByRole("button", { name: "affiliation" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("the filter box narrows checkboxes by name across sections and auto-expands matches", async () => {
    const user = userEvent.setup();
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={[]}
        selectedDurationValues={[]}
        onToggleTag={vi.fn()}
        onToggleDuration={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("Filter tags/duration..."), "orth");
    expect(screen.getByRole("checkbox", { name: "Orthodox" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Secular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "gender" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duration" })).not.toBeInTheDocument();
  });

  it("toggling a tag checkbox calls onToggleTag with the slug; toggling duration calls onToggleDuration", async () => {
    const user = userEvent.setup();
    const onToggleTag = vi.fn();
    const onToggleDuration = vi.fn();
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={[]}
        selectedDurationValues={[]}
        onToggleTag={onToggleTag}
        onToggleDuration={onToggleDuration}
      />
    );
    await user.click(screen.getByRole("button", { name: "affiliation" }));
    await user.click(screen.getByRole("checkbox", { name: "Orthodox" }));
    expect(onToggleTag).toHaveBeenCalledWith("orthodox");

    await user.click(screen.getByRole("button", { name: "Duration" }));
    await user.click(screen.getByRole("checkbox", { name: "Gap year" }));
    expect(onToggleDuration).toHaveBeenCalledWith("GAP_YEAR");
  });

  it("clicking a pinned chip toggles that item off via the same callback", async () => {
    const user = userEvent.setup();
    const onToggleTag = vi.fn();
    render(
      <FacetCheckboxGroups
        tagsByCategory={TAGS_BY_CATEGORY}
        durationOptions={DURATION_OPTIONS}
        selectedTagSlugs={["orthodox"]}
        selectedDurationValues={[]}
        onToggleTag={onToggleTag}
        onToggleDuration={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /Remove Orthodox/i }));
    expect(onToggleTag).toHaveBeenCalledWith("orthodox");
  });
});
