import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { listContactRequestsForUser } from "@/lib/references";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import type { BadgeTone } from "@/components/ui/Badge";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_ALUMNUS: "Awaiting your response",
  APPROVED: "Approved",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  AWAITING_ALUMNUS: "warning",
  APPROVED: "success",
  DECLINED: "neutral",
  EXPIRED: "neutral",
};

export default async function ReferenceRequestsPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          My Reference Requests
        </h1>
        <p className="text-sm text-muted">
          Sign in to see contact requests from people interested in the
          programs you&apos;re a reference for.
        </p>
        <SignInButton mode="modal">
          <button className={buttonVariants({ variant: "primary" })}>Sign in</button>
        </SignInButton>
      </PageContainer>
    );
  }

  const requests = await listContactRequestsForUser(userId);

  return (
    <PageContainer width="narrow" className="gap-6">
      <PageHeader
        title="My Reference Requests"
        description="People who'd like to connect about a program you're a reference for. Approve or decline from the email we sent you -- this page is a read-only history."
      />

      {requests.length === 0 ? (
        <p className="text-sm text-muted">No contact requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((req) => (
            <li
              key={req.id}
              className="flex flex-col gap-2 rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/programs/${req.reference.program.slug}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {req.reference.program.name}
                </Link>
                <Badge tone={STATUS_TONE[req.status] ?? "neutral"}>
                  {STATUS_LABEL[req.status] ?? req.status}
                </Badge>
              </div>
              <p className="text-sm text-foreground/80">{req.note}</p>
              <p className="text-xs text-muted">
                {req.status === "APPROVED" ? `Contact: ${req.requesterEmail} · ` : ""}
                requested {new Date(req.createdAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
