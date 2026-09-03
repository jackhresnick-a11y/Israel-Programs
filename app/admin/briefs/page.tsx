import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listPublishedProgramNames } from "@/lib/programs";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import BriefsManager from "@/components/admin/BriefsManager";

export default async function AdminBriefsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const programs = await listPublishedProgramNames();

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Briefs"
        description="Pick a program to see its transcripts and briefs side by side. Copy the prompt + transcripts into an external Claude conversation (or press Generate), paste the result back, save as a draft, then Publish as a separate explicit action — nothing publishes automatically. Manage the brief types themselves at /admin/briefs/types."
      />
      <BriefsManager programs={programs} />
    </PageContainer>
  );
}
