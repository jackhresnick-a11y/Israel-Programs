import { listPrograms, listAllTags } from "@/lib/programs";
import type { DurationType, TravelType } from "@/app/generated/prisma/client";
import ProgramCard from "@/components/ProgramCard";
import SearchBar from "@/components/SearchBar";
import { CompareProvider } from "@/components/CompareContext";
import CompareCheckbox from "@/components/CompareCheckbox";
import CompareBar from "@/components/CompareBar";

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
      duration: duration as DurationType | undefined,
      hasScholarship: hasScholarship === "true" ? true : undefined,
      hasCollegeCredit: hasCollegeCredit === "true" ? true : undefined,
      travelType: travelType as TravelType | undefined,
    }),
    listAllTags(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          Browse Programs
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {programs.length} program{programs.length === 1 ? "" : "s"} found
        </p>
      </div>

      <SearchBar tags={tags} />

      {programs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-blue-200 p-8 text-center text-sm text-black/50 dark:border-blue-900 dark:text-white/50">
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
    </div>
  );
}
