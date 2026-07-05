import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import ProgramForm from "@/components/ProgramForm";

export default async function NewProgramPage() {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") {
    redirect("/programs");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Add a Program
      </h1>
      <ProgramForm />
    </div>
  );
}
