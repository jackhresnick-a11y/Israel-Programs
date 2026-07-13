import PageHeader from "@/components/ui/PageHeader";
import TestEmailForm from "@/components/TestEmailForm";

export default function AdminEmailTestPage() {
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
