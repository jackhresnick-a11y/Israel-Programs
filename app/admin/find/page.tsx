import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listFinderQuestions } from "@/lib/finder";
import { listAllTags } from "@/lib/programs";
import { listDurationOptions } from "@/lib/duration";
import FinderQuestionsManager from "@/components/admin/FinderQuestionsManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminFindPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [questions, tags, durationOptions] = await Promise.all([
    listFinderQuestions({ includeRetired: true }),
    listAllTags(),
    listDurationOptions(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Find flow"
        description="Manage the questions, options, help text, and order for the /find narrowing flow — no code changes needed."
      />
      <FinderQuestionsManager
        questions={questions}
        tags={tags.map((t) => ({ slug: t.slug, name: t.name, category: t.category }))}
        durationOptions={durationOptions.map((d) => ({ value: d.value, label: d.label }))}
      />
    </PageContainer>
  );
}
