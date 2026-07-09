import { redirect } from "next/navigation";
import { getSiteContent } from "@/lib/siteContent";
import { getMissionBlocks } from "@/lib/mission";
import { getCurrentRole } from "@/lib/roles";
import MissionBlocksForm from "@/components/MissionBlocksForm";
import PageContainer from "@/components/ui/PageContainer";

export default async function EditMissionPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [blocks, legacyBody] = await Promise.all([
    getMissionBlocks(),
    getSiteContent("mission"),
  ]);

  const initial = blocks ?? [
    { icon: "compass" as const, heading: "", body: legacyBody ?? "" },
  ];

  return (
    <PageContainer width="narrow">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
        Edit Background
      </h1>
      <MissionBlocksForm initial={initial} />
    </PageContainer>
  );
}
