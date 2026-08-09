import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";

export type FindStepOption = {
  id: string;
  label: string;
  helpText: string | null;
  href: string;
};

/**
 * One step of the /find flow -- a single question, its options as a vertical list of
 * full-width rows (STYLE_GUIDE.md §6's stacked choice-chip variant), and a skip link.
 * Every option and the skip control are plain links to the next step's URL (see
 * app/find/page.tsx), so the whole flow works with JavaScript disabled and needs no
 * client-side state of its own.
 */
export default function FindStep({
  stepNumber,
  totalSteps,
  prompt,
  helpText,
  options,
  skipHref,
}: {
  stepNumber: number;
  totalSteps: number;
  prompt: string;
  helpText: string | null;
  options: FindStepOption[];
  skipHref: string;
}) {
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Narrow the directory"
        description="A few quick questions — skip any of them."
      />
      <div className="flex flex-col gap-6">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
          Question {stepNumber} of {totalSteps}
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">{prompt}</h3>
          {helpText && <p className="text-sm text-muted">{helpText}</p>}
        </div>

        {options.length > 0 && (
          <div className="flex flex-col divide-y divide-border rounded border border-border">
            {options.map((option) => (
              <Link
                key={option.id}
                href={option.href}
                prefetch={false}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm text-foreground transition-colors duration-[120ms] ease-out hover:bg-accent/10"
              >
                <span className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  {option.helpText && (
                    <span className="text-xs text-muted">{option.helpText}</span>
                  )}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
              </Link>
            ))}
          </div>
        )}

        <Link
          href={skipHref}
          prefetch={false}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
        >
          Skip this question
        </Link>
      </div>
    </PageContainer>
  );
}
