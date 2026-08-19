import type { Metadata } from "next";
import { listPublishedProgramsForPicker } from "@/lib/programs";
import { listPublicPollLinks } from "@/lib/pollConfig";
import RateProgramPicker from "@/components/RateProgramPicker";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Rate your program",
  description: "Been through a program? Help the next person by picking yours and leaving a quick, anonymous rating.",
  alternates: { canonical: "/rate" },
};

// Backstop only -- program approve/reject and public-poll-link/token writes already
// call revalidatePath('/rate') on-demand (see lib/revalidate.ts's revalidateProgram
// and the polls/programs/[programId] and polls/links/[id] routes), so this page
// updates immediately on the writes that matter. 1h matches the window already used
// for "/" and "/mission" -- this page's content (which programs are published, which
// have a public poll link) changes at the same few-times-a-day cadence as those, and
// the timer only needs to catch a write path that's missed or added later, not carry
// the primary freshness guarantee itself.
export const revalidate = 3600;

export default async function RateProgramIndexPage() {
  const [programs, publicLinks] = await Promise.all([
    listPublishedProgramsForPicker(),
    listPublicPollLinks(),
  ]);

  // Shaped as Searchable & { id, href } so the picker can run the shared
  // rankBySearchTerm. goodFor/description are intentionally left empty -- not
  // shipped to the client, not searched here (see RateProgramPicker).
  const items = programs.map((program) => ({
    id: program.id,
    name: program.name,
    nameHe: program.nameHe,
    organization: program.organization,
    location: program.location,
    goodFor: null,
    description: "",
    tags: program.tags,
    href: publicLinks.get(program.id) ?? `/rate/${program.slug}`,
  }));

  return (
    <PageContainer width="base" className="gap-6">
      <PageHeader
        title="Been through a program?"
        description="Help the next person — pick yours below."
      />
      <RateProgramPicker programs={items} />
    </PageContainer>
  );
}
