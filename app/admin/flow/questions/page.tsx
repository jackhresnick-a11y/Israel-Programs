import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listFlowQuestions, countProgramsMissingCategoryTags } from "@/lib/flow";
import { listAllTags } from "@/lib/programs";
import { listDurationOptions } from "@/lib/duration";
import FlowQuestionsManager from "@/components/admin/FlowQuestionsManager";

export default async function AdminFlowQuestionsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [questions, tags, durationOptions, programTypeCoverage] = await Promise.all([
    listFlowQuestions({ includeRetired: true }),
    listAllTags(),
    listDurationOptions(),
    countProgramsMissingCategoryTags("program-type"),
  ]);

  return (
    <FlowQuestionsManager
      questions={questions}
      tags={tags.map((t) => ({ slug: t.slug, name: t.name, category: t.category }))}
      durationOptions={durationOptions.map((d) => ({ value: d.value, label: d.label }))}
      programTypeCoverage={programTypeCoverage}
    />
  );
}
