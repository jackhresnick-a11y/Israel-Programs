import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listPollResponses } from "@/lib/pollResponses";
import { listPublishedProgramNames } from "@/lib/programs";
import { isPollKillSwitchOn } from "@/lib/pollResults";
import PollModerationManager from "@/components/admin/polls/PollModerationManager";
import type { PollResponseStatus } from "@/app/generated/prisma/enums";

const VALID_STATUSES: PollResponseStatus[] = ["PENDING", "COUNTED", "FLAGGED", "VOIDED"];

export default async function AdminPollsModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ programId?: string; status?: string; verified?: string; flagged?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const sp = await searchParams;
  const status = VALID_STATUSES.includes(sp.status as PollResponseStatus) ? (sp.status as PollResponseStatus) : undefined;
  const verified = sp.verified === "true" ? true : sp.verified === "false" ? false : undefined;

  const [responses, programs, killSwitchOn] = await Promise.all([
    listPollResponses({
      programId: sp.programId || undefined,
      status,
      verified,
      flaggedOnly: sp.flagged === "true",
    }),
    listPublishedProgramNames(),
    isPollKillSwitchOn(),
  ]);

  return (
    <PollModerationManager
      responses={responses}
      programs={programs}
      killSwitchOn={killSwitchOn}
      filters={{
        programId: sp.programId ?? "",
        status: sp.status ?? "",
        verified: sp.verified ?? "",
        flagged: sp.flagged ?? "",
      }}
    />
  );
}
