import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listBriefTypes } from "@/lib/briefs";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import BriefTypesManager from "@/components/admin/BriefTypesManager";

export default async function AdminBriefTypesPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const briefTypes = await listBriefTypes();

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Brief types"
        description="Each type has one stored prompt, pasted alongside a program's transcripts into an external Claude conversation (or used as-is by the Generate button at /admin/briefs). sendToAssistant controls whether a PUBLISHED brief of this type reaches the assistant; supersedesAiBrief makes a PUBLISHED brief of this type take the legacy AI brief field's place there and in the public JSON API."
      />
      <BriefTypesManager briefTypes={briefTypes} />
    </PageContainer>
  );
}
