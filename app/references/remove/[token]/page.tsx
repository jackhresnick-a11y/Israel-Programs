import { getReferenceByRemovalToken } from "@/lib/references";
import ReferenceRemovalActions from "@/components/ReferenceRemovalActions";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

/**
 * The reference-giver's self-removal page. Unauthenticated by design: the opaque
 * 192-bit token IS the authentication, same posture as the contact-request approve/decline
 * pages next door. Requiring a sign-in here would make the promise we print on the poll
 * ("you can remove yourself at any time") false for every anonymous respondent, who is
 * most of them.
 *
 * Three states, each an early return in the same shell: link not found / already removed /
 * actionable. Removal itself is a click, never a bare page load with a side effect -- a
 * link scanner or prefetch would otherwise unlist people who only opened the page.
 */
export default async function RemoveReferencePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reference = await getReferenceByRemovalToken(token);

  if (!reference) {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <PageHeader
          title="Link not found"
          description="This link isn’t valid. It may have been mistyped, or it may belong to a listing that has already been deleted."
        />
      </PageContainer>
    );
  }

  if (reference.removedAt) {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <PageHeader
          title="You’ve already been removed"
          description={`You’re no longer listed as a reference for ${reference.program.name}, and no one can request to contact you through it.`}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow" className="items-start gap-4">
      <PageHeader
        title="Remove yourself as a reference?"
        description={`You offered to answer questions from students considering ${reference.program.name}.`}
      />
      <p className="text-sm text-muted">
        Removing takes you off that program’s page and stops any new requests reaching you.
        Your email is not shared with anyone from this point on. Nothing happens until you
        press the button below.
      </p>
      <ReferenceRemovalActions token={token} />
    </PageContainer>
  );
}
