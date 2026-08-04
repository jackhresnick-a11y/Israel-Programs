import { describe, it, expect } from "vitest";
import { ringSentence, trackSentence } from "./pollSentences";

const RECOMMEND_LABELS = ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"];
const STAFF_DEPENDENT_LABELS = ["Same for everyone", "Depended slightly ", "Depended somewhat", "Depended greatly ", "Depended completely "];
const COHORT_SOCIAL_LABELS = ["Would have been similar with any group", "2", "3", "4", "Made or broken by who was there"];

describe("ringSentence", () => {
  it("renders the full template with the mean, anchors, and response count", () => {
    const result = ringSentence({
      questionText: "Would you recommend it to a friend?",
      programName: "Otzem Overseas Program (Atzmona)",
      mean: 4.9,
      count: 8,
      labels: RECOMMEND_LABELS,
    });
    expect(result).toBe(
      'Asked "Would you recommend it to a friend?", alumni of Otzem Overseas Program (Atzmona) averaged 4.9 out of 5 (1 = Definitely not, 5 = Definitely), based on 8 responses.'
    );
  });

  it("returns null when mean is null", () => {
    expect(ringSentence({ questionText: "Q", programName: "P", mean: null, count: 0, labels: RECOMMEND_LABELS })).toBeNull();
  });

  it("uses singular 'response' for count === 1", () => {
    const result = ringSentence({ questionText: "Q", programName: "P", mean: 5, count: 1, labels: RECOMMEND_LABELS });
    expect(result).toContain("based on 1 response.");
    expect(result).not.toContain("1 responses");
  });

  it("drops the anchor clause but keeps the rest when an end label is blank", () => {
    const result = ringSentence({ questionText: "Q", programName: "P", mean: 3.2, count: 5, labels: ["", "b", "c", "d", "e"] });
    expect(result).toBe('Asked "Q", alumni of P averaged 3.2 out of 5, based on 5 responses.');
  });

  it("preserves anchor labels verbatim, including trailing whitespace after trim", () => {
    const labels = ["Not good at all", "2", "3", "4", "5 Star Hotel "];
    const result = ringSentence({ questionText: "Q", programName: "P", mean: 4.1, count: 10, labels });
    expect(result).toContain("(1 = Not good at all, 5 = 5 Star Hotel)");
  });
});

describe("trackSentence", () => {
  it("renders the full template with the closest label and no numeric average", () => {
    const result = trackSentence({
      questionText: "How much did your experience depend on which specific staff/rabbis/madrichim you got?",
      programName: "Otzem Overseas Program (Atzmona)",
      mean: 3.4,
      count: 9,
      labels: STAFF_DEPENDENT_LABELS,
    });
    expect(result).toBe(
      'Asked "How much did your experience depend on which specific staff/rabbis/madrichim you got?", alumni of Otzem Overseas Program (Atzmona) answered closest to "Depended somewhat", based on 9 responses.'
    );
    expect(result).not.toMatch(/averaged|out of 5/);
  });

  it("returns null when mean is null", () => {
    expect(trackSentence({ questionText: "Q", programName: "P", mean: null, count: 0, labels: STAFF_DEPENDENT_LABELS })).toBeNull();
  });

  it("returns null when the closest label is a bare number (real cohort_social case)", () => {
    // mean 2.0 -> index 1 -> "2"
    expect(trackSentence({ questionText: "Q", programName: "P", mean: 2.0, count: 6, labels: COHORT_SOCIAL_LABELS })).toBeNull();
    // mean 3.0 -> index 2 -> "3"
    expect(trackSentence({ questionText: "Q", programName: "P", mean: 3.0, count: 6, labels: COHORT_SOCIAL_LABELS })).toBeNull();
    // mean 4.0 -> index 3 -> "4"
    expect(trackSentence({ questionText: "Q", programName: "P", mean: 4.0, count: 6, labels: COHORT_SOCIAL_LABELS })).toBeNull();
  });

  it("renders when the mean rounds to a real label even in a mostly-numeric label set", () => {
    // mean 1.4 -> round -> 1 -> index 0 -> real label
    const result = trackSentence({ questionText: "Q", programName: "P", mean: 1.4, count: 6, labels: COHORT_SOCIAL_LABELS });
    expect(result).toContain('closest to "Would have been similar with any group"');
  });

  it("returns null when the resolved label is blank", () => {
    expect(trackSentence({ questionText: "Q", programName: "P", mean: 5, count: 2, labels: ["a", "b", "c", "d", ""] })).toBeNull();
  });
});
