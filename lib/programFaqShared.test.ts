import { describe, it, expect } from "vitest";
import { faqQuestionSubmitSchema } from "./programFaqShared";

describe("faqQuestionSubmitSchema: consent must be the literal true", () => {
  it("accepts a question with consent: true", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "Is there a scholarship?", consent: true });
    expect(result.success).toBe(true);
  });

  it("rejects consent: false -- an unconsented question is never sent, not sent-and-flagged", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "Is there a scholarship?", consent: false });
    expect(result.success).toBe(false);
  });

  it("rejects a missing consent field", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "Is there a scholarship?" });
    expect(result.success).toBe(false);
  });
});

describe("faqQuestionSubmitSchema: question length", () => {
  it("rejects an empty question", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "", consent: true });
    expect(result.success).toBe(false);
  });

  it("rejects a question over 500 characters", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "a".repeat(501), consent: true });
    expect(result.success).toBe(false);
  });

  it("accepts a question at exactly 500 characters", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "a".repeat(500), consent: true });
    expect(result.success).toBe(true);
  });
});

describe("faqQuestionSubmitSchema: honeypot", () => {
  it("accepts a submission with no website field at all -- real users never see it", () => {
    const result = faqQuestionSubmitSchema.safeParse({ question: "Is there a scholarship?", consent: true });
    expect(result.success).toBe(true);
  });

  it("still parses successfully when a bot fills in the honeypot -- the route silently fakes success instead of 400ing, which would reveal the honeypot's existence", () => {
    const result = faqQuestionSubmitSchema.safeParse({
      question: "Is there a scholarship?",
      consent: true,
      website: "http://spam.example",
    });
    expect(result.success).toBe(true);
  });
});
