import ProgramProgressLine from "@/components/polls/ProgramProgressLine";
import WhatsAppShareButton from "@/components/polls/WhatsAppShareButton";
import PartnerCta from "@/components/PartnerCta";
import Button from "@/components/ui/Button";
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
  incomplete,
  headline,
  postPollCta,
  onKeepAnswering,
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
  /** Strictly `status === "COUNTED"`. A FLAGGED response is NOT counted: it's held for
   *  moderation and contributes to no public aggregate, so it must not be handed the share
   *  CTA or a progress line either. */
  counted: boolean;
  /** `status === "INCOMPLETE"` -- the one case where carrying on is the actual fix, so it
   *  gets the leading button. Distinct from `!counted`, which is also true for FLAGGED. */
  incomplete: boolean;
  headline: string;
  postPollCta: PartnerLinkSlot | null;
  /** Returns to the form with every saved answer intact. Submitting is never a one-way
   *  door: re-submitting is idempotent server-side, so there is no reason to strand
   *  someone here -- least of all the uncounted respondent, who is exactly the person who
   *  should carry on answering. */
  onKeepAnswering: () => void;
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

      {/* Incomplete: carrying on is the actual fix, so it leads. */}
      {incomplete && (
        <Button type="button" data-poll-keep-answering className="min-h-11 w-full" onClick={onKeepAnswering}>
          Keep answering
        </Button>
      )}

      {/* Both suppressed for an uncounted response: the progress line would be talking
          about a program this response didn't contribute to, and asking someone who
          answered three questions to recruit their whole program group is both off-brand
          and a way to pollute share_button_shown with respondents who have nothing to
          share. */}
      {counted && <ProgramProgressLine programId={programId} />}
      {counted && (
        <WhatsAppShareButton programName={programName} sharePollLink={sharePollLink} responseId={responseId} />
      )}

      {/* Everything else (counted, or held for review): the way back stays available --
          there are still questions left to answer and a re-submit costs nothing -- but it
          doesn't lead, since nothing is actually wrong. */}
      {!incomplete && (
        <Button
          type="button"
          variant="secondary"
          data-poll-keep-answering
          className="min-h-11 w-full"
          onClick={onKeepAnswering}
        >
          Keep answering
        </Button>
      )}

      <PartnerCta slot={postPollCta} />
    </div>
  );
}
