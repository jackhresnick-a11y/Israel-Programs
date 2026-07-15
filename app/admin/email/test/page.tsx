import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import PageHeader from "@/components/ui/PageHeader";
import TestEmailForm from "@/components/TestEmailForm";

export default async function AdminEmailTestPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Test email sender"
        description="Send a sample of any email template to any address, on demand."
      />
      <TestEmailForm />
    </div>
  );
}
