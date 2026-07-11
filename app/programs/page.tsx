import { listPrograms, listAllTags } from "@/lib/programs";
import { listTagCategories } from "@/lib/tags";
import { listDurationOptions, durationLabelMapFromOptions } from "@/lib/duration";
import { listRegions } from "@/lib/regions";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";
import { getSiteContent } from "@/lib/siteContent";
import { trackSearch, trackFilterUse } from "@/lib/analytics";
import ProgramCard from "@/components/ProgramCard";
import SearchBar from "@/components/SearchBar";
import { CompareProvider } from "@/components/CompareContext";
import CompareCheckbox from "@/components/CompareCheckbox";
import CompareBar from "@/components/CompareBar";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

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
  const [
    programs,
    tags,
    categories,
    durationOptions,
    regions,
    backgroundUrl,
    backgroundEnabled,
    backgroundOpacity,
    backgroundSizeDesktop,
    backgroundOffsetYDesktop,
    backgroundSizeMobile,
    backgroundOffsetYMobile,
    backgroundUrlDark,
    durationFilterLabel,
    durationFilterTint,
    durationFilterShow,
    regionFilterLabel,
    regionFilterTint,
    regionFilterShow,
  ] = await Promise.all([
    listPrograms({
      q,
      tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
      duration: duration ? (duration.split(",").filter(Boolean) as DurationType[]) : undefined,
      hasScholarship: hasScholarship === "true" ? true : undefined,
      hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
      travelType: travelType as TravelType | undefined,
    }),
    listAllTags(),
    listTagCategories(),
    listDurationOptions(),
    listRegions(),
    getSiteContent("backgroundLogoUrl"),
    getSiteContent("backgroundLogoEnabled"),
    getSiteContent("backgroundLogoOpacity"),
    getSiteContent("backgroundLogoSize"),
    getSiteContent("backgroundLogoOffsetY"),
    getSiteContent("backgroundLogoSizeMobile"),
    getSiteContent("backgroundLogoOffsetYMobile"),
    getSiteContent("backgroundLogoUrlDark"),
    getSiteContent("durationFilterLabel"),
    getSiteContent("durationFilterTint"),
    getSiteContent("durationFilterShow"),
    getSiteContent("regionFilterLabel"),
    getSiteContent("regionFilterTint"),
    getSiteContent("regionFilterShow"),
  ]);
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
    tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
    duration: duration ? duration.split(",").filter(Boolean) : undefined,
    hasScholarship: hasScholarship === "true" ? true : undefined,
    hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
    travelType,
  });

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
          />
        </div>
      </div>

      {programs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          No programs match your search yet.
        </p>
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
