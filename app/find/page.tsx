import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listFinderQuestions, buildProgramsHref } from "@/lib/finder";
import { SITE_NAME } from "@/lib/siteUrl";
import FindStep from "@/components/FindStep";

const FIND_DESCRIPTION =
  "A few quick questions to narrow the directory down to the programs worth a closer look.";

export const metadata: Metadata = {
  title: "Narrow the directory",
  description: FIND_DESCRIPTION,
  alternates: { canonical: "/find" },
  openGraph: {
    title: "Narrow the directory",
    description: FIND_DESCRIPTION,
    url: "/find",
    type: "website",
    siteName: SITE_NAME,
    // Nested `openGraph` objects replace the parent's wholesale (not merge) --
    // see app/programs/page.tsx's identical note.
    images: "/opengraph-image",
  },
};

type SearchParams = Promise<{ step?: string; a?: string }>;

export default async function FindPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { step: stepParam, a: aParam } = await searchParams;
  const step = Math.max(0, Number.parseInt(stepParam ?? "0", 10) || 0);
  const answeredIds = aParam ? aParam.split(",").filter(Boolean) : [];

  const questions = await listFinderQuestions();

  if (questions.length === 0 || step >= questions.length) {
    redirect(await buildProgramsHref(answeredIds));
  }

  const current = questions[step];
  const nextStep = step + 1;

  const options = current.options.map((option) => ({
    id: option.id,
    label: option.label,
    helpText: option.helpText,
    href: `/find?step=${nextStep}&a=${[...answeredIds, option.id].join(",")}`,
  }));

  const skipHref =
    answeredIds.length > 0 ? `/find?step=${nextStep}&a=${answeredIds.join(",")}` : `/find?step=${nextStep}`;

  return (
    <FindStep
      stepNumber={step + 1}
      totalSteps={questions.length}
      prompt={current.prompt}
      helpText={current.helpText}
      options={options}
      skipHref={skipHref}
    />
  );
}
