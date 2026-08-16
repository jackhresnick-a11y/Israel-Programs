import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listProgramTranscripts } from "@/lib/transcripts";
import { listPublishedProgramNames } from "@/lib/programs";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import TranscriptsManager from "@/components/admin/TranscriptsManager";

export default async function AdminTranscriptsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [transcripts, slugOptions] = await Promise.all([
    listProgramTranscripts(),
    listPublishedProgramNames(),
  ]);

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Transcripts"
        description="Bulk-ingest Whisper transcripts produced locally by scripts/transcribe/, or edit one directly. The raw transcript text is admin-only -- it is never shown on any public page."
      />
      <TranscriptsManager initialTranscripts={transcripts} slugOptions={slugOptions} />
    </PageContainer>
  );
}
