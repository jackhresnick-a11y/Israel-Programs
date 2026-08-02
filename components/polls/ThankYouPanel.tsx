import ProgramProgressLine from "@/components/polls/ProgramProgressLine";
import WhatsAppShareButton from "@/components/polls/WhatsAppShareButton";
import PartnerCta from "@/components/PartnerCta";
import type { PartnerLinkSlot } from "@/lib/partnerLinksConfig";

/**
 * The post-poll confirmation panel -- replaces RateForm.tsx's old inline success banner
 * (signed-in) / ThankYouScreen (anonymous), now shared by both so the two thank-you states
 * never drift apart (same reasoning as QuestionWithReview being shared between the two
 * modes). Adds the referral loop on top of the pre-existing banner + PartnerCta: a
 * collective-progress line and a one-tap WhatsApp share aimed at the respondent's own
 * program group.
 *
 * `headline` is passed in verbatim by the caller so the existing copy per mode
 * ("Thanks — your rating of X has been recorded!" / "Thanks for rating this program!" /
 * "Your rating has been updated.") is preserved exactly, unchanged by this refactor.
 */
export default function ThankYouPanel({
  mode,
  programId,
  programName,
  responseId,
  sharePollLink,
  counted,
  headline,
  postPollCta,
}: {
  /** Carried onto the wrapper as data-poll-mode, same attribute the pre-refactor inline
   *  blocks rendered -- scripts/verify-choice-layout.ts and
   *  scripts/verify-unified-color.ts both wait on `[data-poll-mode]` to know either state
   *  (form or confirmation) has rendered. */
  mode: "signed-in" | "anonymous";
  programId: string;
  programName: string;
  responseId: string | null;
  sharePollLink: string | null;
  /** Whether this response actually crossed the readiness bar. False when the respondent
   *  pressed Submit having answered too little to count -- which is allowed, since submit
   *  is deliberately never gated on completeness. */
  counted: boolean;
  headline: string;
  postPollCta: PartnerLinkSlot | null;
}) {
  return (
    <div data-poll-mode={mode} data-poll-thankyou className="flex flex-col gap-6">
      <div
        className={
          counted
            ? "rounded border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success"
            : "rounded border border-border bg-surface-muted p-6 text-center text-sm font-medium text-foreground"
        }
      >
        {headline}
      </div>
      {/* Both suppressed for an uncounted response: the progress line would be talking
          about a program this response didn't contribute to, and asking someone who
          answered two questions to recruit their whole program group is both off-brand and
          a way to pollute share_button_shown with respondents who have nothing to share. */}
      {counted && <ProgramProgressLine programId={programId} />}
      {counted && (
        <WhatsAppShareButton programName={programName} sharePollLink={sharePollLink} responseId={responseId} />
      )}
      <PartnerCta slot={postPollCta} />
    </div>
  );
}
