import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { loadActiveFlowQuestions, loadFlowClipData } from "@/lib/flowRun";
import FlowPreviewPanel from "@/components/admin/FlowPreviewPanel";

export default async function AdminFlowPreviewPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  // The same ACTIVE-only question set and clip data /match itself loads
  // (loadActiveFlowQuestions/loadFlowClipData) -- a RETIRED question or clip a real
  // respondent would never see has no business appearing in this preview either.
  const [questions, clipData] = await Promise.all([loadActiveFlowQuestions(), loadFlowClipData()]);

  return <FlowPreviewPanel questions={questions} triggers={clipData.triggers} videosById={clipData.videosById} />;
}
