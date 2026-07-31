import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getFunnelSummary } from "@/lib/pollFunnel";
import PollFunnelSummary from "@/components/admin/polls/PollFunnelSummary";

export default async function AdminPollsFunnelPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const summary = await getFunnelSummary();

  return <PollFunnelSummary summary={summary} />;
}
