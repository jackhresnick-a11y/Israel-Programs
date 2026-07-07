import { redirect } from "next/navigation";
import { getSiteContent } from "@/lib/siteContent";
import { getCurrentRole } from "@/lib/roles";
import MissionForm from "@/components/MissionForm";
import PageContainer from "@/components/ui/PageContainer";

export default async function EditMissionPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const body = await getSiteContent("mission");

  return (
    <PageContainer width="narrow">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
        Edit Mission Statement
      </h1>
      <MissionForm initial={body ?? ""} />
    </PageContainer>
  );
}
