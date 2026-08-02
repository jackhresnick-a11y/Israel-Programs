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
  headline: string;
  postPollCta: PartnerLinkSlot | null;
}) {
  return (
    <div data-poll-mode={mode} data-poll-thankyou className="flex flex-col gap-6">
      <div className="rounded border border-success/30 bg-success-bg p-6 text-center text-sm font-medium text-success">
        {headline}
      </div>
      <ProgramProgressLine programId={programId} />
      <WhatsAppShareButton programName={programName} sharePollLink={sharePollLink} responseId={responseId} />
      <PartnerCta slot={postPollCta} />
    </div>
  );
}
