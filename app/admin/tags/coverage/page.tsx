import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listPublishedProgramsForCoverage, getTagsGroupedByCategory } from "@/lib/tags";
import { getDurationLabelMap } from "@/lib/duration";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import TagCoverageManager from "@/components/admin/TagCoverageManager";

/** The categories this page can inline-edit, in display order. shortLabel drives the
 * compact "Missing X" badges/filters; the full admin-editable TagCategory.label is used
 * for the expanded editor's field labels. Deliberately a fixed allowlist (mirrors the
 * category-tags route's z.enum) rather than every TagCategory row -- location is
 * Region-managed and language is dormant, neither belongs in this editor. */
const EDITABLE_CATEGORIES = [
  { slug: "program-type", shortLabel: "type" },
  { slug: "essence", shortLabel: "essence" },
  { slug: "gender", shortLabel: "gender" },
  { slug: "affiliation", shortLabel: "affiliation" },
  { slug: "israeli-integration", shortLabel: "integration" },
] as const;

const EDITABLE_SLUGS: readonly string[] = EDITABLE_CATEGORIES.map((c) => c.slug);

export default async function TagCoveragePage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [programs, { groups }, durationLabels] = await Promise.all([
    listPublishedProgramsForCoverage(),
    getTagsGroupedByCategory(),
    getDurationLabelMap(),
  ]);

  const categories = EDITABLE_CATEGORIES.map((c) => {
    const group = groups.find((g) => g.category.slug === c.slug);
    return {
      slug: c.slug,
      shortLabel: c.shortLabel,
      label: group?.category.label ?? c.shortLabel,
      options: (group?.tags ?? []).map((t) => ({ slug: t.slug, name: t.name })),
    };
  });

  const rows = programs.map((p) => {
    const categoryTags: Record<string, { slug: string; name: string }[]> = {};
    for (const c of EDITABLE_CATEGORIES) {
      categoryTags[c.slug] = p.tags
        .filter((t) => t.category === c.slug)
        .map((t) => ({ slug: t.slug, name: t.name }));
    }
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      durationLabel: durationLabels[p.durationType],
      hasScholarship: p.hasScholarship,
      hasCollegeCredit: p.hasCollegeCredit,
      travelType: p.travelType,
      categoryTags,
      otherTags: p.tags
        .filter((t) => t.category && !EDITABLE_SLUGS.includes(t.category))
        .map((t) => ({ slug: t.slug, name: t.name, category: t.category as string })),
    };
  });

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Tag coverage"
        description="Every published program's program type, essence, gender, religious affiliation, and Israeli integration tags, editable inline. Filter to see who's still missing one."
      />
      <TagCoverageManager rows={rows} categories={categories} />
    </PageContainer>
  );
}
