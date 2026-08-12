import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listFlowVideos, listFlowVideoTriggers, listFlowQuestions } from "@/lib/flow";
import FlowClipManager from "@/components/admin/FlowClipManager";

export default async function AdminFlowClipsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [videos, triggers, questions] = await Promise.all([
    listFlowVideos({ includeRetired: true }),
    listFlowVideoTriggers({ includeRetired: true }),
    listFlowQuestions({ includeRetired: true }),
  ]);

  return (
    <FlowClipManager
      videos={videos}
      triggers={triggers}
      questions={questions.map((q) => ({ id: q.id, key: q.key, prompt: q.prompt }))}
    />
  );
}
