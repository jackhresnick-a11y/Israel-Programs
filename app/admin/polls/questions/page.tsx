import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listQuestions } from "@/lib/pollQuestions";
import QuestionManager from "@/components/admin/polls/QuestionManager";

export default async function AdminPollsQuestionsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const questions = await listQuestions();

  return <QuestionManager questions={questions} />;
}
