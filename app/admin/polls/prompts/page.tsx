import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getElaborationPromptsConfig } from "@/lib/pollElaborationPrompts";
import ElaborationPromptManager from "@/components/admin/polls/ElaborationPromptManager";

export default async function AdminPollsPromptsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const config = await getElaborationPromptsConfig();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        The open-ended prompts shown as the last, optional block on the rating form. Answers are moderated alongside
        per-question reviews on the Reviews tab.
      </p>
      <ElaborationPromptManager initialConfig={config} />
    </div>
  );
}
