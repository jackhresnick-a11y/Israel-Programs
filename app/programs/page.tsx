import type { Metadata } from "next";
import Link from "next/link";
import { listPrograms, listAllTags, getFacetData, type ProgramFilters } from "@/lib/programs";
import { listTagCategories } from "@/lib/tags";
import { listDurationOptions, durationLabelMapFromOptions } from "@/lib/duration";
import { listRegions } from "@/lib/regions";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";
import { getSiteContentMany } from "@/lib/siteContent";
import { trackSearch, trackFilterUse } from "@/lib/analytics";
import { SITE_NAME } from "@/lib/siteUrl";
import ProgramCard from "@/components/ProgramCard";
import SearchBar from "@/components/SearchBar";
import { CompareProvider } from "@/components/CompareContext";
import CompareCheckbox from "@/components/CompareCheckbox";
import CompareBar from "@/components/CompareBar";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import {
  computeFacetCounts,
  computeRegionCounts,
  dropOneCounts,
  type ActiveDimension,
} from "@/lib/facetCounts";

const LISTING_DESCRIPTION =
  "Search and filter hundreds of Israel programs by duration, region, affiliation, and more.";

export const metadata: Metadata = {
  title: "Browse Programs",
  description: LISTING_DESCRIPTION,
  alternates: { canonical: "/programs" },
  openGraph: {
    title: "Browse Programs",
    description: LISTING_DESCRIPTION,
    url: "/programs",
    type: "website",
    siteName: SITE_NAME,
    // Nested `openGraph` objects replace the parent's wholesale (not merge),
    // so without this the root's file-convention og:image silently drops
    // off any page that sets its own openGraph -- point it at the same
    // generated image explicitly rather than relying on inheritance.
    images: "/opengraph-image",
  },
};

type SearchParams = Promise<{
  q?: string;
  tags?: string;
  duration?: string;
  hasScholarship?: string;
  hasCollegeCredit?: string;
  travelType?: string;
}>;

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, tags: tagsParam, duration, hasScholarship, hasCollegeCredit, travelType } =
    await searchParams;

  const activeTagSlugs = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const activeDurations = duration ? (duration.split(",").filter(Boolean) as DurationType[]) : [];
  const programFilters: ProgramFilters = {
    q,
    tags: activeTagSlugs.length > 0 ? activeTagSlugs : undefined,
    duration: activeDurations.length > 0 ? activeDurations : undefined,
    hasScholarship: hasScholarship === "true" ? true : undefined,
    hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
    travelType: travelType as TravelType | undefined,
  };

  const [programs, tags, categories, durationOptions, regions, facetPrograms, siteContent] =
    await Promise.all([
      listPrograms(programFilters),
      listAllTags(),
      listTagCategories(),
      listDurationOptions(),
      listRegions(),
      getFacetData(q),
      getSiteContentMany([
        "backgroundLogoUrl",
        "backgroundLogoEnabled",
        "backgroundLogoOpacity",
        "backgroundLogoSize",
        "backgroundLogoOffsetY",
        "backgroundLogoSizeMobile",
        "backgroundLogoOffsetYMobile",
        "backgroundLogoUrlDark",
        "durationFilterLabel",
        "durationFilterTint",
        "durationFilterShow",
        "regionFilterLabel",
        "regionFilterTint",
        "regionFilterShow",
      ]),
    ]);
  const {
    backgroundLogoUrl: backgroundUrl,
    backgroundLogoEnabled: backgroundEnabled,
    backgroundLogoOpacity: backgroundOpacity,
    backgroundLogoSize: backgroundSizeDesktop,
    backgroundLogoOffsetY: backgroundOffsetYDesktop,
    backgroundLogoSizeMobile: backgroundSizeMobile,
    backgroundLogoOffsetYMobile: backgroundOffsetYMobile,
    backgroundLogoUrlDark: backgroundUrlDark,
    durationFilterLabel,
    durationFilterTint,
    durationFilterShow,
    regionFilterLabel,
    regionFilterTint,
    regionFilterShow,
  } = siteContent;
  const backgroundOpacityValue = (Number(backgroundOpacity) || 5) / 100;
  const backgroundDesktopHeight = Number(backgroundSizeDesktop) || 280;
  const backgroundDesktopOffset = Number(backgroundOffsetYDesktop) || 0;
  const backgroundMobileHeight = Number(backgroundSizeMobile) || 150;
  const backgroundMobileOffset = Number(backgroundOffsetYMobile) || 0;
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
  const durationLabelMap = durationLabelMapFromOptions(durationOptions);

  trackSearch(q, programs.length);
  trackFilterUse({
    tags: activeTagSlugs.length > 0 ? activeTagSlugs : undefined,
    duration: activeDurations.length > 0 ? activeDurations : undefined,
    hasScholarship: hasScholarship === "true" ? true : undefined,
    hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
    travelType,
  });

  // Facet math (lib/facetCounts.ts): mirrors buildTagAndClauses' OR-within/AND-across
  // semantics so the counts shown next to each option -- and the empty-state's
  // remove-this-filter suggestions -- always agree with what the query above actually
  // returns.
  const tagCategoryBySlug = new Map(tags.map((t) => [t.slug, t.category]));
  const categoryLabelBySlug = new Map(categories.map((c) => [c.slug, c.label]));
  const categorySlugOptions = new Map<string, string[]>();
  for (const t of tags) {
    if (!t.category) continue;
    const bucket = categorySlugOptions.get(t.category);
    if (bucket) bucket.push(t.slug);
    else categorySlugOptions.set(t.category, [t.slug]);
  }
  const durationValues = durationOptions.map((o) => o.value);
  const facetSelections = { duration: activeDurations, tags: activeTagSlugs };
  const { duration: durationCounts, tags: tagCounts } = computeFacetCounts(
    facetPrograms,
    facetSelections,
    tagCategoryBySlug,
    durationValues,
    categorySlugOptions
  );
  const regionCounts = computeRegionCounts(facetPrograms, facetSelections, tagCategoryBySlug, regions);

  // Which dimensions are currently narrowing results, for the empty state below --
  // "location" is Region's underlying category (Region has no separate selection state
  // of its own, see lib/regions.ts), so its label comes from regionFilter, not
  // categoryLabelBySlug.
  const activeCategorySlugs = new Set(
    activeTagSlugs.map((slug) => tagCategoryBySlug.get(slug)).filter((c): c is string => Boolean(c))
  );
  const activeDimensions: ActiveDimension[] = [];
  if (activeDurations.length > 0) activeDimensions.push({ kind: "duration" });
  for (const category of activeCategorySlugs) {
    const label = category === "location" ? regionFilter.label : (categoryLabelBySlug.get(category) ?? category);
    activeDimensions.push({ kind: "category", category, label });
  }

  /** Builds the /programs URL with one active dimension cleared, everything else kept
   * -- powers each empty-state chip's "remove this filter" link. */
  function urlWithDimensionCleared(dimension: ActiveDimension): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dimension.kind === "duration") {
      if (tagsParam) params.set("tags", tagsParam);
    } else {
      if (duration) params.set("duration", duration);
      const remaining = activeTagSlugs.filter((slug) => tagCategoryBySlug.get(slug) !== dimension.category);
      if (remaining.length > 0) params.set("tags", remaining.join(","));
    }
    if (hasScholarship === "true") params.set("hasScholarship", "true");
    if (hasCollegeCredit === "true") params.set("hasCollegeCredit", "true");
    if (travelType) params.set("travelType", travelType);
    const qs = params.toString();
    return qs ? `/programs?${qs}` : "/programs";
  }

  let emptyStateChips: { dimension: ActiveDimension; count: number; href: string }[] = [];
  let closestMatches: typeof programs = [];
  let closestMatchDimension: ActiveDimension | null = null;
  if (programs.length === 0 && activeDimensions.length > 0) {
    const dropped = dropOneCounts(facetPrograms, facetSelections, tagCategoryBySlug, activeDimensions);
    emptyStateChips = dropped.map(({ dimension, count }) => ({
      dimension,
      count,
      href: urlWithDimensionCleared(dimension),
    }));
    const best = [...dropped].sort((a, b) => b.count - a.count)[0];
    if (best && best.count > 0) {
      const bestDimension = best.dimension;
      closestMatchDimension = bestDimension;
      const relaxedFilters: ProgramFilters = { ...programFilters };
      if (bestDimension.kind === "duration") {
        relaxedFilters.duration = undefined;
      } else {
        const remaining = activeTagSlugs.filter(
          (slug) => tagCategoryBySlug.get(slug) !== bestDimension.category
        );
        relaxedFilters.tags = remaining.length > 0 ? remaining : undefined;
      }
      closestMatches = await listPrograms(relaxedFilters);
    }
  }
  const clearAllHref = q ? `/programs?q=${encodeURIComponent(q)}` : "/programs";

  return (
    <PageContainer width="wide">
      <div className="relative">
        {backgroundEnabled === "true" && backgroundUrl && (
          // Clipping lives on this decorative-only layer, not on the content
          // below -- an ancestor with overflow-hidden would also clip the
          // FilterDropdown popovers in SearchBar, since their position:absolute
          // menus don't contribute to a normal-flow ancestor's height.
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundUrl}
              alt=""
              style={{
                height: `${backgroundMobileHeight}px`,
                opacity: backgroundOpacityValue,
                transform: `translate(-50%, calc(-50% + ${backgroundMobileOffset}px))`,
              }}
              className={`absolute left-1/2 top-1/2 w-auto max-w-none select-none sm:hidden ${backgroundUrlDark ? "dark:hidden" : ""}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundUrl}
              alt=""
              style={{
                height: `${backgroundDesktopHeight}px`,
                opacity: backgroundOpacityValue,
                transform: `translate(-50%, calc(-50% + ${backgroundDesktopOffset}px))`,
              }}
              className={`absolute left-1/2 top-1/2 hidden w-auto max-w-none select-none sm:block ${backgroundUrlDark ? "dark:hidden" : ""}`}
            />
            {backgroundUrlDark && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backgroundUrlDark}
                  alt=""
                  style={{
                    height: `${backgroundMobileHeight}px`,
                    opacity: backgroundOpacityValue,
                    transform: `translate(-50%, calc(-50% + ${backgroundMobileOffset}px))`,
                  }}
                  className="absolute left-1/2 top-1/2 hidden w-auto max-w-none select-none dark:block sm:dark:hidden"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backgroundUrlDark}
                  alt=""
                  style={{
                    height: `${backgroundDesktopHeight}px`,
                    opacity: backgroundOpacityValue,
                    transform: `translate(-50%, calc(-50% + ${backgroundDesktopOffset}px))`,
                  }}
                  className="absolute left-1/2 top-1/2 hidden w-auto max-w-none select-none sm:dark:block"
                />
              </>
            )}
          </div>
        )}
        <div className="relative flex flex-col gap-8">
          <PageHeader
            title="Browse Programs"
            description={`${programs.length} program${programs.length === 1 ? "" : "s"} found`}
          />

          <SearchBar
            tags={tags}
            categories={categories}
            durationOptions={durationOptions}
            regions={regions}
            durationFilter={durationFilter}
            regionFilter={regionFilter}
            durationCounts={durationCounts}
            tagCounts={tagCounts}
            regionCounts={regionCounts}
          />
        </div>
      </div>

      {programs.length === 0 ? (
        <div className="flex flex-col gap-6 rounded-lg border border-dashed border-border p-8 text-center">
          {activeDimensions.length > 0 ? (
            <>
              <p className="text-sm text-muted">
                No programs match this combination. Try removing a filter:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {emptyStateChips.map(({ dimension, count, href }) => (
                  <Link
                    key={dimension.kind === "duration" ? "duration" : dimension.category}
                    href={href}
                    prefetch={false}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm transition hover:border-accent hover:bg-accent/10"
                  >
                    Remove {dimension.kind === "duration" ? durationFilter.label : dimension.label}
                    <span className="ml-1.5 text-xs text-muted">→ {count}</span>
                  </Link>
                ))}
                <Link
                  href={clearAllHref}
                  prefetch={false}
                  className="rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:border-accent hover:bg-accent/10"
                >
                  Clear all filters
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No programs match your search yet.</p>
          )}

          {closestMatches.length > 0 && closestMatchDimension && (
            <div className="flex flex-col gap-4 pt-4 text-left">
              <p className="text-center text-sm font-medium text-foreground">
                Closest matches — ignoring{" "}
                {closestMatchDimension.kind === "duration"
                  ? durationFilter.label
                  : closestMatchDimension.label}
              </p>
              <CompareProvider>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {closestMatches.map((program) => (
                    <ProgramCard
                      key={program.slug}
                      program={program}
                      durationLabelMap={durationLabelMap}
                      action={<CompareCheckbox slug={program.slug} name={program.name} />}
                    />
                  ))}
                </div>
              </CompareProvider>
            </div>
          )}
        </div>
      ) : (
        <CompareProvider>
          <div className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <ProgramCard
                key={program.slug}
                program={program}
                durationLabelMap={durationLabelMap}
                action={<CompareCheckbox slug={program.slug} name={program.name} />}
              />
            ))}
          </div>
          <CompareBar />
        </CompareProvider>
      )}
    </PageContainer>
  );
}
