import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listTagCategories } from "@/lib/tags";
import { listAllTags } from "@/lib/programs";
import TagCategoryManager from "@/components/TagCategoryManager";
import TagManager from "@/components/TagManager";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminTagsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [categories, tags] = await Promise.all([listTagCategories(), listAllTags()]);

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
          checked) and a section header in the program tag picker. Duration and Region are
          built in and not shown here.
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
    </PageContainer>
  );
}
