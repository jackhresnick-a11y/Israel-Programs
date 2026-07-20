import type { ProgramFaqDTO } from "@/lib/programFaqShared";
import AskQuestionForm from "@/components/AskQuestionForm";

/**
 * Server component -- `faqs` is the public DTO from lib/programFaq.ts's
 * listPublishedFaqs, never a raw ProgramFAQ row. A program with zero published entries
 * still renders the "Ask a question" button (no empty-state graveyard), same
 * capture-stays-open-even-when-display-is-empty posture as ReviewsSection's submit box,
 * but distinct in that the Ask button always shows regardless of any gate.
 */
export default function ProgramFaqSection({ programId, faqs }: { programId: string; faqs: ProgramFaqDTO[] }) {
  return (
    <div className="flex flex-col gap-6">
      {faqs.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <div key={faq.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-foreground">{faq.question}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      <AskQuestionForm programId={programId} />
    </div>
  );
}
