import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listReferrerTokens } from "@/lib/pollTokens";
import { listPublishedProgramNames } from "@/lib/programs";
import PollLinkManager from "@/components/admin/polls/PollLinkManager";

export default async function AdminPollsLinksPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [tokens, programs] = await Promise.all([listReferrerTokens(), listPublishedProgramNames()]);

  return <PollLinkManager tokens={tokens} programs={programs} />;
}
