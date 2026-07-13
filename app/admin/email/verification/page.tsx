import Link from "next/link";
import { listEmailVerificationQueue, STALE_AFTER_MONTHS } from "@/lib/emailVerification";
import EmailVerificationActions from "@/components/EmailVerificationActions";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

export default async function AdminEmailVerificationPage() {
  const queue = await listEmailVerificationQueue();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Contact email verification"
        description={`Every program with a contact email that's never been confirmed by a human, plus any confirmed address older than ${STALE_AFTER_MONTHS} months. Ordered by when the program was added (oldest first) -- the closest available proxy, since there's no separate "email added at" timestamp.`}
        actions={
          <a href="/api/admin/email-verification-queue.csv" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Download CSV
          </a>
        }
      />

      {queue.length === 0 ? (
        <p className="text-muted">Nothing in the queue right now.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {queue.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Link href={`/programs/${row.slug}/edit`} className="font-medium text-foreground hover:underline">
                    {row.name}
                  </Link>
                  {row.contactEmailStatus === "VERIFIED" && <Badge tone="warning">Stale -- re-verify</Badge>}
                </div>
                <span className="text-sm text-muted">{row.contactEmail}</span>
                {row.contactEmailSource && (
                  <a
                    href={row.contactEmailSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-hover underline dark:text-accent"
                  >
                    {row.contactEmailSource}
                  </a>
                )}
              </div>
              <EmailVerificationActions programId={row.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
