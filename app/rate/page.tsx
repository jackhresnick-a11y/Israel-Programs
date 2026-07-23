import type { Metadata } from "next";
import { listPublishedProgramsForPicker } from "@/lib/programs";
import { listPublicPollLinks } from "@/lib/pollConfig";
import RateProgramPicker from "@/components/RateProgramPicker";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Rate your program",
  description: "Been through a program? Help the next person by picking yours and leaving a quick, anonymous rating.",
};

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
