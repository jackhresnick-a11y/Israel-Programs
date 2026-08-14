import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getGlossaryEntries } from "@/lib/glossary";
import { getSiteContent } from "@/lib/siteContent";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import GlossarySettingsForm from "@/components/GlossarySettingsForm";
import GlossaryEntriesManager from "@/components/GlossaryEntriesManager";

export default async function AdminGlossaryPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [entries, flag] = await Promise.all([
    getGlossaryEntries(),
    getSiteContent("glossaryEnabled"),
  ]);

  return (
    <PageContainer width="base" className="gap-8">
      <PageHeader
        title="Glossary"
        description="Edit definitions, add new terms, reorder, and control who can see them."
      />
      <GlossarySettingsForm initialEnabled={flag === "true"} />
      <GlossaryEntriesManager initial={entries} />
    </PageContainer>
  );
}
