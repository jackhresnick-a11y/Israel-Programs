import { redirect } from "next/navigation";
import { getSiteContent } from "@/lib/siteContent";
import { getCurrentRole } from "@/lib/roles";
import MissionForm from "@/components/MissionForm";

export default async function EditMissionPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const body = await getSiteContent("mission");

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-primary dark:text-white">
        Edit Mission Statement
      </h1>
      <MissionForm initial={body ?? ""} />
    </div>
  );
}
