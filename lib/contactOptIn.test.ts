import { describe, it, expect } from "vitest";
import { buildContactOptInFields, deriveCtaLayout, shouldShowContactHint } from "./contactOptIn";

describe("buildContactOptInFields", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("clears every column when the respondent did not opt in", () => {
    const result = buildContactOptInFields(null, now);
    expect(result).toEqual({
      contactOptIn: false,
      contactOptInAt: null,
      contactAgeAttested: false,
      contactAgeAttestedAt: null,
      contactMethod: null,
      contactName: null,
    });
  });

  it("sets both flags true with the same timestamp when the respondent opted in", () => {
    const result = buildContactOptInFields({ contactMethod: "whatsapp +972501234567", contactName: "Yaakov B." }, now);
    expect(result.contactOptIn).toBe(true);
    expect(result.contactAgeAttested).toBe(true);
    expect(result.contactOptInAt).toBe(now);
    expect(result.contactAgeAttestedAt).toBe(now);
    expect(result.contactOptInAt).toBe(result.contactAgeAttestedAt);
  });

  it("carries the contact method and name through verbatim", () => {
    const result = buildContactOptInFields({ contactMethod: "someone@example.com", contactName: "S." }, now);
    expect(result.contactMethod).toBe("someone@example.com");
    expect(result.contactName).toBe("S.");
  });

  it("a resubmit that omits opt-in retracts a prior one -- returns fully cleared, not merged", () => {
    // The caller always writes this function's full return value over the existing row,
    // so passing null here (as a resubmit-without-opt-in would) must not leave any trace
    // of a previous opt-in for the caller to accidentally preserve.
    const retracted = buildContactOptInFields(null, now);
    expect(retracted.contactOptIn).toBe(false);
    expect(retracted.contactMethod).toBeNull();
    expect(retracted.contactName).toBeNull();
  });
});

describe("deriveCtaLayout", () => {
  it("the top CTA is reachable even with zero responses and hidden results (empty state)", () => {
    const layout = deriveCtaLayout({ visible: false, responseCount: 0 });
    expect(layout.showTopCta).toBe(true);
    expect(layout.showResults).toBe(false);
    expect(layout.showBottomCta).toBe(false);
  });

  it("the top CTA stays reachable even once results are visible", () => {
    const layout = deriveCtaLayout({ visible: true, responseCount: 10 });
    expect(layout.showTopCta).toBe(true);
  });

  it("the bottom CTA only shows once results are visible", () => {
    expect(deriveCtaLayout({ visible: false, responseCount: 50 }).showBottomCta).toBe(false);
    expect(deriveCtaLayout({ visible: true, responseCount: 50 }).showBottomCta).toBe(true);
  });

  it("suppresses the response count below n=3", () => {
    expect(deriveCtaLayout({ visible: true, responseCount: 0 }).showResponseCount).toBe(false);
    expect(deriveCtaLayout({ visible: true, responseCount: 1 }).showResponseCount).toBe(false);
    expect(deriveCtaLayout({ visible: true, responseCount: 2 }).showResponseCount).toBe(false);
  });

  it("shows the response count at and above n=3", () => {
    expect(deriveCtaLayout({ visible: true, responseCount: 3 }).showResponseCount).toBe(true);
    expect(deriveCtaLayout({ visible: true, responseCount: 100 }).showResponseCount).toBe(true);
  });
});

describe("shouldShowContactHint", () => {
  it("hides the hint when both sources are zero", () => {
    expect(shouldShowContactHint(0, 0)).toBe(false);
  });

  it("shows the hint from poll opt-ins alone", () => {
    expect(shouldShowContactHint(1, 0)).toBe(true);
  });

  it("shows the hint from published references alone", () => {
    expect(shouldShowContactHint(0, 1)).toBe(true);
  });

  it("shows the hint when both sources have signal", () => {
    expect(shouldShowContactHint(5, 3)).toBe(true);
  });
});
