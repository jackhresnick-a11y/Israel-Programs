import { listPrograms, listAllTags } from "@/lib/programs";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";
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
  const [programs, tags] = await Promise.all([
    listPrograms({
      q,
      tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
      duration: duration ? (duration.split(",").filter(Boolean) as DurationType[]) : undefined,
      hasScholarship: hasScholarship === "true" ? true : undefined,
      hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
      travelType: travelType as TravelType | undefined,
    }),
    listAllTags(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Browse Programs"
        description={`${programs.length} program${programs.length === 1 ? "" : "s"} found`}
      />

      <SearchBar tags={tags} />

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
