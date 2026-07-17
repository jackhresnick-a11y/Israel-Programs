import { describe, it, expect } from "vitest";
import { meanToPercent, formatStarsMean, summaryState } from "./pollFormat";

describe("meanToPercent / formatStarsMean: same mean, arithmetically consistent", () => {
  it("4.2 -> 84/100 and 4.2 stars", () => {
    expect(meanToPercent(4.2)).toBe(84);
    expect(formatStarsMean(4.2)).toBe("4.2");
  });

  it("rounds percent to the nearest integer", () => {
    expect(meanToPercent(3.0)).toBe(60);
    expect(meanToPercent(1.0)).toBe(20);
    expect(meanToPercent(5.0)).toBe(100);
    expect(meanToPercent(3.33)).toBe(67); // 66.6 rounds up
    expect(meanToPercent(3.32)).toBe(66); // 66.4 rounds down
  });

  it("stars always render one decimal place, even for whole numbers", () => {
    expect(formatStarsMean(5)).toBe("5.0");
    expect(formatStarsMean(1)).toBe("1.0");
  });
});

describe("summaryState", () => {
  it("zero counted-verified responses -> be_first, regardless of other flags", () => {
    expect(summaryState(0, 7, true, false)).toBe("be_first");
    expect(summaryState(0, 7, false, true)).toBe("be_first");
  });

  it("below the publish threshold -> collecting", () => {
    expect(summaryState(1, 7, true, false)).toBe("collecting");
    expect(summaryState(6, 7, true, false)).toBe("collecting");
  });

  it("threshold met but resultsVisible is false -> under_review", () => {
    expect(summaryState(7, 7, false, false)).toBe("under_review");
  });

  it("threshold met and visible, but the global kill switch is on -> under_review", () => {
    expect(summaryState(50, 7, true, true)).toBe("under_review");
  });

  it("threshold met, visible, kill switch off -> published", () => {
    expect(summaryState(7, 7, true, false)).toBe("published");
    expect(summaryState(100, 7, true, false)).toBe("published");
  });
});
