import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listPendingQuestions, listFaqsForProgram } from "@/lib/programFaq";
import { listPublishedProgramNames } from "@/lib/programs";
import FaqManager from "@/components/admin/polls/FaqManager";

export default async function AdminPollsFaqsPage({
  searchParams,
}: {
  searchParams: Promise<{ programId?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const sp = await searchParams;
  const programs = await listPublishedProgramNames();
  const selectedProgramId =
    sp.programId && programs.some((p) => p.id === sp.programId) ? sp.programId : (programs[0]?.id ?? "");

  const [pending, faqs] = await Promise.all([
    listPendingQuestions(),
    selectedProgramId ? listFaqsForProgram(selectedProgramId) : Promise.resolve([]),
  ]);

  return (
    <FaqManager
      pending={pending.map((p) => ({
        id: p.id,
        question: p.question,
        createdAt: p.createdAt,
        program: p.program,
      }))}
      programs={programs}
      selectedProgramId={selectedProgramId}
      faqs={faqs.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        status: f.status,
        sortOrder: f.sortOrder,
        source: f.source,
        moderatorNote: f.moderatorNote,
        createdAt: f.createdAt,
      }))}
    />
  );
}
