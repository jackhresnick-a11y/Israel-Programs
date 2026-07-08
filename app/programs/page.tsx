import { listPrograms, listAllTags } from "@/lib/programs";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";
import { getSiteContent } from "@/lib/siteContent";
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
    backgroundUrl,
    backgroundEnabled,
    backgroundOpacity,
    backgroundSizeDesktop,
    backgroundOffsetYDesktop,
    backgroundSizeMobile,
    backgroundOffsetYMobile,
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
    getSiteContent("backgroundLogoUrl"),
    getSiteContent("backgroundLogoEnabled"),
    getSiteContent("backgroundLogoOpacity"),
    getSiteContent("backgroundLogoSize"),
    getSiteContent("backgroundLogoOffsetY"),
    getSiteContent("backgroundLogoSizeMobile"),
    getSiteContent("backgroundLogoOffsetYMobile"),
  ]);
  const backgroundOpacityValue = (Number(backgroundOpacity) || 5) / 100;
  const backgroundDesktopHeight = Number(backgroundSizeDesktop) || 280;
  const backgroundDesktopOffset = Number(backgroundOffsetYDesktop) || 0;
  const backgroundMobileHeight = Number(backgroundSizeMobile) || 150;
  const backgroundMobileOffset = Number(backgroundOffsetYMobile) || 0;

  return (
    <PageContainer width="wide">
      <div className="relative overflow-hidden">
        {backgroundEnabled === "true" && backgroundUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundUrl}
              alt=""
              aria-hidden
              style={{
                height: `${backgroundMobileHeight}px`,
                opacity: backgroundOpacityValue,
                transform: `translate(-50%, calc(-50% + ${backgroundMobileOffset}px))`,
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 w-auto max-w-none select-none sm:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundUrl}
              alt=""
              aria-hidden
              style={{
                height: `${backgroundDesktopHeight}px`,
                opacity: backgroundOpacityValue,
                transform: `translate(-50%, calc(-50% + ${backgroundDesktopOffset}px))`,
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 hidden w-auto max-w-none select-none sm:block"
            />
          </>
        )}
        <div className="relative flex flex-col gap-8">
          <PageHeader
            title="Browse Programs"
            description={`${programs.length} program${programs.length === 1 ? "" : "s"} found`}
          />

          <SearchBar tags={tags} />
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
              <div key={program.slug} className="relative">
                <CompareCheckbox slug={program.slug} name={program.name} />
                <ProgramCard program={program} />
              </div>
            ))}
          </div>
          <CompareBar />
        </CompareProvider>
      )}
    </PageContainer>
  );
}
