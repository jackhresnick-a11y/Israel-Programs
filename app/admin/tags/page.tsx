import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listTagCategories } from "@/lib/tags";
import { listAllTags } from "@/lib/programs";
import { listDurationOptions } from "@/lib/duration";
import { listRegions } from "@/lib/regions";
import { getSiteContent } from "@/lib/siteContent";
import TagCategoryManager from "@/components/TagCategoryManager";
import TagManager from "@/components/TagManager";
import DurationManager from "@/components/DurationManager";
import RegionManager from "@/components/RegionManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminTagsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [
    categories,
    tags,
    durationOptions,
    regions,
    durationFilterLabel,
    durationFilterTint,
    durationFilterShow,
    regionFilterLabel,
    regionFilterTint,
    regionFilterShow,
  ] = await Promise.all([
    listTagCategories(),
    listAllTags(),
    listDurationOptions(),
    listRegions(),
    getSiteContent("durationFilterLabel"),
    getSiteContent("durationFilterTint"),
    getSiteContent("durationFilterShow"),
    getSiteContent("regionFilterLabel"),
    getSiteContent("regionFilterTint"),
    getSiteContent("regionFilterShow"),
  ]);

  const durationFilter = {
    label: durationFilterLabel ?? "Duration",
    tint: durationFilterTint ?? "accent",
    show: durationFilterShow !== "false",
  };
  const regionFilter = {
    label: regionFilterLabel ?? "Region",
    tint: regionFilterTint ?? "danger",
    show: regionFilterShow !== "false",
  };
  const locationTags = tags
    .filter((t) => t.category === "location")
    .map((t) => ({ slug: t.slug, name: t.name }));

  return (
    <PageContainer width="base">
      <PageHeader
        title="Tags & Categories"
        description="Manage the category headers and tags shown in the browse-page filter bar and the program tag picker — no code changes needed."
      />

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Categories
        </h2>
        <p className="text-sm text-muted">
          Each category becomes a filter dropdown (when &ldquo;Show in filter bar&rdquo; is
          checked) and a section header in the program tag picker.
        </p>
        <TagCategoryManager categories={categories} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Tags ({tags.length})
        </h2>
        <p className="text-sm text-muted">
          Rename a tag, move it to a different category, or add a brand-new one. Tags with
          no category still work as freeform hashtags but won&rsquo;t appear in the filter bar.
        </p>
        <TagManager
          tags={tags}
          categories={categories.map((c) => ({ slug: c.slug, label: c.label }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Duration
        </h2>
        <p className="text-sm text-muted">
          Duration comes from a fixed set of program lengths, not a tag category — rename,
          reorder, or hide individual options from the filter bar below.
        </p>
        <DurationManager options={durationOptions} header={durationFilter} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Regions
        </h2>
        <p className="text-sm text-muted">
          A region is a named group of location tags — selecting it in the browse filter
          bar toggles all of its member tags at once. Add, rename, reorder, or delete
          regions, and choose which location tags belong to each.
        </p>
        <RegionManager regions={regions} locationTags={locationTags} header={regionFilter} />
      </section>
    </PageContainer>
  );
}
