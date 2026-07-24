import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listProgramsBestFor } from "@/lib/pollResults";
import { listAllTags } from "@/lib/programs";
import { listTagCategories } from "@/lib/tags";
import ProgramsAdminManager from "@/components/admin/ProgramsAdminManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminProgramsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [programs, allTags, categories] = await Promise.all([
    listProgramsBestFor(),
    listAllTags(),
    listTagCategories(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Programs"
        description="Every published program's live-computed &ldquo;Best for&rdquo; strip, alongside its editorial override and tags. Editing here saves immediately -- no separate publish step."
      />
      <ProgramsAdminManager
        programs={programs}
        allTags={allTags.map((t) => ({ slug: t.slug, name: t.name, category: t.category }))}
        categories={categories.map((c) => ({ slug: c.slug, label: c.label }))}
      />
    </PageContainer>
  );
}
