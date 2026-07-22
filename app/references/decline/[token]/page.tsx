import { getContactRequestPreviewByToken } from "@/lib/references";
import ReferenceApprovalActions from "@/components/ReferenceApprovalActions";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

const RESOLVED_COPY: Record<string, string> = {
  APPROVED: "You already approved this request — you and the requester should each have an email with the other's contact info.",
  DECLINED: "You already declined this request. No contact info was shared.",
  EXPIRED: "This request has expired — it's no longer awaiting a response.",
};

export default async function DeclineReferenceRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getContactRequestPreviewByToken(token);

  if (!preview) {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <PageHeader title="Link not found" description="This link isn't valid. It may have been mistyped or already used." />
      </PageContainer>
    );
  }

  if (preview.status !== "AWAITING_ALUMNUS") {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <PageHeader
          title="Already handled"
          description={RESOLVED_COPY[preview.status] ?? "This request has already been resolved."}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow" className="items-start gap-4">
      <PageHeader
        title={`Decline ${preview.requesterName}'s request?`}
        description={`${preview.requesterName} would like to connect with you about ${preview.programName}. If you're not able to, you can decline below.`}
      />
      <p className="text-sm text-muted">
        Declining shares nothing — we&apos;ll just let them know gently that you weren&apos;t
        able to connect this time.
      </p>
      <ReferenceApprovalActions token={token} action="decline" />
    </PageContainer>
  );
}
