import { describe, it, expect } from "vitest";
import { countWords, previewText, matchFilesToSlugs, type SlugOption } from "./transcriptsShared";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });

  it("collapses multiple spaces/newlines between words", () => {
    expect(countWords("one\n\ntwo   three")).toBe(3);
  });
});

describe("previewText", () => {
  it("returns the trimmed text unchanged when under the limit", () => {
    expect(previewText("  short text  ", 200)).toBe("short text");
  });

  it("truncates at maxLength without adding an ellipsis itself", () => {
    const long = "a".repeat(250);
    const preview = previewText(long, 200);
    expect(preview).toHaveLength(200);
    expect(preview).toBe("a".repeat(200));
  });
});

const SLUGS: SlugOption[] = [
  { id: "prog_1", slug: "aish-hatorah", name: "Aish HaTorah" },
  { id: "prog_2", slug: "example-program", name: "Example Program" },
];

describe("matchFilesToSlugs", () => {
  it("matches an exact slug.txt filename", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "aish-hatorah.txt", text: "hello world" }],
      SLUGS,
      new Map()
    );
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({
      slug: "aish-hatorah",
      programId: "prog_1",
      programName: "Aish HaTorah",
      wordCount: 2,
      existingCount: 0,
    });
  });

  it("never fuzzily matches -- case mismatch is unmatched, not resolved", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "Aish-Hatorah.txt", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "Aish-Hatorah.txt" }]);
  });

  it("never fuzzily matches -- a whitespace variant is unmatched, not resolved", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "aish hatorah.txt", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "aish hatorah.txt" }]);
  });

  it("never fuzzily matches -- a single-dash-suffixed filename (not the '--' disambiguator) is unmatched, not resolved", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "aish-hatorah-2.txt", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "aish-hatorah-2.txt" }]);
  });

  it("rejects a non-.txt filename even if the stem matches a real slug", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "aish-hatorah.mp4", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "aish-hatorah.mp4" }]);
  });

  it("classifies a slug with no existing transcripts as existingCount 0", () => {
    const { matched } = matchFilesToSlugs(
      [{ filename: "example-program.txt", text: "one two three" }],
      SLUGS,
      new Map()
    );
    expect(matched[0].existingCount).toBe(0);
  });

  it("carries the current transcript count for a slug that already has some", () => {
    const { matched } = matchFilesToSlugs(
      [{ filename: "example-program.txt", text: "one two three" }],
      SLUGS,
      new Map([["example-program", 2]])
    );
    expect(matched[0].existingCount).toBe(2);
  });

  it("handles a mixed batch: matched and unmatched files independently", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [
        { filename: "aish-hatorah.txt", text: "a b" },
        { filename: "not-a-real-slug.txt", text: "c d" },
      ],
      SLUGS,
      new Map()
    );
    expect(matched.map((m) => m.slug)).toEqual(["aish-hatorah"]);
    expect(unmatched).toEqual([{ filename: "not-a-real-slug.txt" }]);
  });

  it("'<slug>--1.txt' and '<slug>--2.txt' both match the same program, letting several transcripts attach in one batch", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [
        { filename: "aish-hatorah--1.txt", text: "a" },
        { filename: "aish-hatorah--2.txt", text: "b" },
      ],
      SLUGS,
      new Map()
    );
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => m.slug)).toEqual(["aish-hatorah", "aish-hatorah"]);
    expect(matched.map((m) => m.filename)).toEqual(["aish-hatorah--1.txt", "aish-hatorah--2.txt"]);
  });

  it("a '--' disambiguator on a slug that doesn't otherwise match is still unmatched -- no fuzzing", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "not-a-real-slug--1.txt", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "not-a-real-slug--1.txt" }]);
  });

  it("a non-.txt file with a '--' disambiguator is unmatched, same as any other non-.txt file", () => {
    const { matched, unmatched } = matchFilesToSlugs(
      [{ filename: "aish-hatorah--1.md", text: "x" }],
      SLUGS,
      new Map()
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ filename: "aish-hatorah--1.md" }]);
  });
});
