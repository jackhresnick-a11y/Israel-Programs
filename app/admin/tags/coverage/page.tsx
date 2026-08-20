import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listPublishedProgramsForCoverage, getTagsGroupedByCategory } from "@/lib/tags";
import { getDurationLabelMap } from "@/lib/duration";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import TagCoverageManager from "@/components/admin/TagCoverageManager";

export default async function TagCoveragePage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [programs, { groups }, durationLabels] = await Promise.all([
    listPublishedProgramsForCoverage(),
    getTagsGroupedByCategory(),
    getDurationLabelMap(),
  ]);

  const typeOptions = (groups.find((g) => g.category.slug === "program-type")?.tags ?? []).map(
    (t) => ({ slug: t.slug, name: t.name })
  );
  const essenceOptions = (groups.find((g) => g.category.slug === "essence")?.tags ?? []).map(
    (t) => ({ slug: t.slug, name: t.name })
  );

  const rows = programs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    durationLabel: durationLabels[p.durationType],
    hasScholarship: p.hasScholarship,
    hasCollegeCredit: p.hasCollegeCredit,
    travelType: p.travelType,
    typeTags: p.tags.filter((t) => t.category === "program-type").map((t) => ({ slug: t.slug, name: t.name })),
    essenceTags: p.tags.filter((t) => t.category === "essence").map((t) => ({ slug: t.slug, name: t.name })),
    otherTags: p.tags
      .filter((t) => t.category && t.category !== "program-type" && t.category !== "essence")
      .map((t) => ({ slug: t.slug, name: t.name, category: t.category as string })),
  }));

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Tag coverage"
        description="Every published program's program-type and essence tags, editable inline. Filter to see who's still missing one or the other."
      />
      <TagCoverageManager rows={rows} typeOptions={typeOptions} essenceOptions={essenceOptions} />
    </PageContainer>
  );
}
