/**
 * Pure logic for the rating flow's contact opt-in and the CTA region's layout -- no
 * Prisma import, safe for any "use client" component, same split as lib/pollBestFor.ts.
 * Two distinct concerns share this file because both are small, response-count-driven
 * gates around the same region of the program page (see components/PollSummaryStrip.tsx).
 */
import { MIN_RESPONSES_PER_QUESTION } from "@/lib/pollBestFor";

/** The client-submitted opt-in payload, once both checkboxes are checked and both fields
 * are filled -- see lib/pollShared.ts's contactOptInSchema, which this mirrors. */
export type ContactOptInInput = {
  contactMethod: string;
  contactName: string;
};

/** The six PollResponse columns a contact opt-in touches, in the exact shape
 * lib/pollResponses.ts writes into a Prisma `data` object on both the signed-in and
 * anonymous create paths (and the signed-in update path, on resubmit). */
export type ContactOptInFields = {
  contactOptIn: boolean;
  contactOptInAt: Date | null;
  contactAgeAttested: boolean;
  contactAgeAttestedAt: Date | null;
  contactMethod: string | null;
  contactName: string | null;
};

/**
 * Builds the six-column write for a submission. `input` is null when the respondent
 * didn't opt in (or unchecked it on resubmit) -- returns every column cleared, which is
 * what makes a resubmit-without-opt-in actually retract a prior opt-in rather than
 * silently keeping it (this function has no "merge with existing row" behavior; the
 * caller always writes its full return value). When `input` is present, both consent and
 * age-attestation are true with the SAME timestamp (`now`) -- one transaction, one moment
 * of assertion, mirroring PollReview.consentGiven/consentAt's precedent of stamping
 * consent and its timestamp together rather than deriving one from the other later.
 */
export function buildContactOptInFields(input: ContactOptInInput | null, now: Date): ContactOptInFields {
  if (!input) {
    return {
      contactOptIn: false,
      contactOptInAt: null,
      contactAgeAttested: false,
      contactAgeAttestedAt: null,
      contactMethod: null,
      contactName: null,
    };
  }
  return {
    contactOptIn: true,
    contactOptInAt: now,
    contactAgeAttested: true,
    contactAgeAttestedAt: now,
    contactMethod: input.contactMethod,
    contactName: input.contactName,
  };
}

/** The program page's poll-results/CTA region, reduced to what to show -- one function so
 * "is the button reachable when there's no data yet" is a single testable decision rather
 * than an inline `visible` check duplicated across the top and bottom CTA instances. */
export type CtaLayout = {
  /** The results grid (strip + bucket cards) -- exactly `summary.visible`. */
  showResults: boolean;
  /** The top "Rate this program" button, directly under the strip region -- always
   * reachable, including the empty/ships-dark state, since driving the FIRST responses
   * is exactly when a program has no visible results yet. */
  showTopCta: true;
  /** The second CTA instance at the bottom of the results grid -- only meaningful once
   * there's a grid to be at the bottom of. */
  showBottomCta: boolean;
  /** The "{n} people have rated this program" line -- suppressed below the same n>=3
   * floor every individual question uses, so a thin program never advertises how thin
   * it is. */
  showResponseCount: boolean;
};

export function deriveCtaLayout(summary: { visible: boolean; responseCount: number }): CtaLayout {
  return {
    showResults: summary.visible,
    showTopCta: true,
    showBottomCta: summary.visible,
    showResponseCount: summary.responseCount >= MIN_RESPONSES_PER_QUESTION,
  };
}

/** The Alumni References section's aggregate hint -- shown when there's ANY reason to
 * believe past participants are reachable, from either source (poll opt-ins or approved
 * references), without exposing which. Both-zero suppresses the hint entirely -- no
 * empty affordance implying a possibility that doesn't exist yet. */
export function shouldShowContactHint(openContactOptIns: number, approvedReferenceCount: number): boolean {
  return openContactOptIns > 0 || approvedReferenceCount > 0;
}
