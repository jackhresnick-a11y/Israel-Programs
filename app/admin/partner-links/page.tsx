import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getPartnerLinksConfig } from "@/lib/partnerLinks";
import { listTagCategories } from "@/lib/tags";
import { listPublishedProgramNames } from "@/lib/programs";
import PartnerLinksManager from "@/components/admin/PartnerLinksManager";
import BackButton from "@/components/BackButton";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminPartnerLinksPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [config, categories, programs] = await Promise.all([
    getPartnerLinksConfig(),
    listTagCategories(),
    listPublishedProgramNames(),
  ]);

  return (
    <PageContainer width="wide" className="gap-6">
      <BackButton fallbackHref="/admin" />
      <PageHeader
        title="Partner Links"
        description="Optional partner CTA buttons shown in specific places on the site. Everything is off by default — a slot only appears once you enable it and give it a working link."
      />
      <PartnerLinksManager
        initialConfig={config}
        categoryOptions={categories.map((c) => ({ slug: c.slug, label: c.label }))}
        programOptions={programs.map((p) => ({ id: p.id, name: p.name }))}
      />
    </PageContainer>
  );
}
