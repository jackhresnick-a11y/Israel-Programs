import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listQuestions, listBuckets } from "@/lib/pollQuestions";
import { listPublishedProgramNames } from "@/lib/programs";
import PollQuestionsAdminManager, {
  type CategoryGroup,
} from "@/components/admin/PollQuestionsAdminManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminPollQuestionsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [questions, buckets, programs] = await Promise.all([
    listQuestions({ includeRetired: false }),
    listBuckets({ includeRetired: false }),
    listPublishedProgramNames(),
  ]);

  // A question can belong to more than one bucket's questionIds (a real case in this
  // question bank) -- it appears once under each, so tier decisions are legible
  // side-by-side within every category it actually shows up in. A question in zero
  // buckets lands in a trailing "Uncategorized" group rather than vanishing.
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const groups: CategoryGroup[] = [];
  const seenInAnyBucket = new Set<string>();

  for (const bucket of [...buckets].sort((a, b) => a.order - b.order)) {
    const bucketQuestions = bucket.questionIds
      .map((id) => questionsById.get(id))
      .filter((q): q is NonNullable<typeof q> => q !== undefined);
    for (const q of bucketQuestions) seenInAnyBucket.add(q.id);
    if (bucketQuestions.length === 0) continue;
    groups.push({ id: bucket.id, name: bucket.name, questions: bucketQuestions });
  }

  const uncategorized = questions.filter((q) => !seenInAnyBucket.has(q.id));
  if (uncategorized.length > 0) {
    groups.push({ id: "uncategorized", name: "Uncategorized", questions: uncategorized });
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Poll Questions"
        description="Tier controls how much weight a question's mean carries in the &ldquo;Best for&rdquo; strip ranking -- independent of whether it renders as a donut or a spectrum track. Pick a program below to preview a strip before committing a tier change."
      />
      <PollQuestionsAdminManager groups={groups} programs={programs} />
    </PageContainer>
  );
}
