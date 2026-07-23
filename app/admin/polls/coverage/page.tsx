import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listRatingCoverage } from "@/lib/pollResults";
import RatingCoverageTable from "@/components/admin/polls/RatingCoverageTable";

export default async function AdminPollsCoveragePage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const rows = await listRatingCoverage();

  return <RatingCoverageTable rows={rows} />;
}
