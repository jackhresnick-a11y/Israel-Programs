import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listProgramsWithPollConfig } from "@/lib/pollConfig";
import { listBuckets, listQuestions } from "@/lib/pollQuestions";
import { listAllTags } from "@/lib/programs";
import ProgramPollConfigManager from "@/components/admin/polls/ProgramPollConfigManager";

export default async function AdminPollsProgramsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [programs, buckets, questions, tags] = await Promise.all([
    listProgramsWithPollConfig(),
    listBuckets({ includeRetired: false }),
    listQuestions({ includeRetired: false }),
    listAllTags(),
  ]);

  const extraBuckets = buckets.filter((b) => !b.isCore);

  return (
    <ProgramPollConfigManager
      programs={programs}
      buckets={extraBuckets}
      allBuckets={buckets}
      questions={questions}
      tags={tags.map((t) => ({ slug: t.slug, name: t.name }))}
    />
  );
}
