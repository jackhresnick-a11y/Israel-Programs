import { describe, it, expect, vi } from "vitest";
import {
  POLL_SHARE_EVENTS,
  POLL_REFERENCE_OPTIN_EVENTS,
  POLL_CLIENT_EVENTS,
  pollClientEventSchema,
} from "./pollShared";

// lib/pollAnalytics.ts pulls in Prisma (and, transitively, lib/pollConfig.ts) purely to
// write rows; none of that is exercised here -- this file only reads the event registry,
// so the boundary is stubbed rather than simulated. Same hoisted-mock + dynamic-import
// shape as the rest of the suite.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/pollConfig", () => ({ getQuestionsForProgram: vi.fn() }));

const { POLL_ANALYTICS_EVENTS } = await import("./pollAnalytics");

/**
 * The registry is a plain object literal assembled from three sources, and both
 * POLL_ANALYTICS_EVENTS and POLL_REFERENCE_OPTIN_EVENTS have a `SUBMITTED` key. Spreading
 * the latter in -- the obvious way to write it, and how POLL_SHARE_EVENTS is composed --
 * silently overwrites `SUBMITTED: "poll_submitted"`, which would redirect every
 * trackPollSubmitted call into reference_optin_submitted rows. TypeScript permits it,
 * nothing else would catch it, and the damage would only show up as a quietly wrong admin
 * funnel weeks later. Hence this test.
 */
describe("poll analytics event registry", () => {
  it("keeps poll_submitted distinct from reference_optin_submitted", () => {
    expect(POLL_ANALYTICS_EVENTS.SUBMITTED).toBe("poll_submitted");
    expect(POLL_ANALYTICS_EVENTS.REFERENCE_OPTIN_SUBMITTED).toBe("reference_optin_submitted");
  });

  it("has no duplicate event strings", () => {
    const values = Object.values(POLL_ANALYTICS_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("carries every client-emitted type, so the route and the registry can't drift", () => {
    const registry = new Set<string>(Object.values(POLL_ANALYTICS_EVENTS));
    for (const type of POLL_CLIENT_EVENTS) expect(registry.has(type)).toBe(true);
  });
});

/**
 * reference_optin_submitted records whether an opt-in actually became a Reference -- a
 * server fact. Letting a client POST it would make the one metric that distinguishes
 * "opted in and it worked" from the silent-skip paths assertable by anyone with curl.
 */
describe("client event allowlist", () => {
  it("accepts the share events and the opt-in view/focus events", () => {
    for (const type of [
      POLL_SHARE_EVENTS.SHARE_SHOWN,
      POLL_SHARE_EVENTS.SHARE_CLICKED,
      POLL_REFERENCE_OPTIN_EVENTS.VIEWED,
      POLL_REFERENCE_OPTIN_EVENTS.FOCUSED,
    ]) {
      expect(pollClientEventSchema.safeParse({ type, responseId: "resp_1" }).success).toBe(true);
    }
  });

  it("rejects reference_optin_submitted from a client", () => {
    const parsed = pollClientEventSchema.safeParse({
      type: POLL_REFERENCE_OPTIN_EVENTS.SUBMITTED,
      responseId: "resp_1",
    });
    expect(parsed.success).toBe(false);
    expect(POLL_CLIENT_EVENTS).not.toContain(POLL_REFERENCE_OPTIN_EVENTS.SUBMITTED);
  });
});
