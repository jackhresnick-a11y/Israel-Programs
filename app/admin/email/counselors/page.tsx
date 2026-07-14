import { listCounselorContacts } from "@/lib/counselorContacts";
import CounselorContactManager from "@/components/admin/CounselorContactManager";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";

export default async function AdminCounselorContactsPage() {
  const contacts = await listCounselorContacts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Guidance counselor contacts"
        description="Outreach contacts for Israel-guidance counselors at Jewish schools abroad -- separate from program listings. Every email requires a source URL."
        actions={
          <a href="/api/admin/counselor-contacts.csv" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Download CSV
          </a>
        }
      />
      <CounselorContactManager contacts={contacts} />
    </div>
  );
}
