import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { loadActiveFlowQuestions, loadFlowClipData } from "@/lib/flowRun";
import FlowPreviewPanel from "@/components/admin/FlowPreviewPanel";
import FindV2SettingsForm from "@/components/FindV2SettingsForm";

export default async function AdminFlowPreviewPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  // The same ACTIVE-only question set and clip data /match itself loads
  // (loadActiveFlowQuestions/loadFlowClipData) -- a RETIRED question or clip a real
  // respondent would never see has no business appearing in this preview either.
  const [questions, clipData, findV2Enabled] = await Promise.all([
    loadActiveFlowQuestions(),
    loadFlowClipData(),
    getSiteContent("findV2Enabled"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Pinned at the top: the same FindV2SettingsForm /admin/settings renders, reading
       * and writing the same findV2Enabled SiteContent key through the same component --
       * one mechanism, so the two pages can never disagree about /match's visibility. See
       * app/match/page.tsx's matching `flag !== "true" && role !== "admin"` gate; nothing
       * about that logic changes here. */}
      <FindV2SettingsForm initialEnabled={findV2Enabled === "true"} />
      <FlowPreviewPanel questions={questions} triggers={clipData.triggers} videosById={clipData.videosById} />
    </div>
  );
}
