import Link from "next/link";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentRole, normalizeRole } from "@/lib/roles";
import { listPendingPrograms, listPendingEdits, listRecentPrograms } from "@/lib/programs";
import { listPendingReferences } from "@/lib/references";
import { listRecentReviews } from "@/lib/reviews";
import { countPendingReviews } from "@/lib/pollReviews";
import { buildFieldDiffs, buildTagDiff } from "@/lib/diff";
import { getDurationLabelMap } from "@/lib/duration";
import { getUsersByIds } from "@/lib/clerkUsers";
import RoleSelect from "@/components/RoleSelect";
import QueueActions from "@/components/QueueActions";
import EditDiffView from "@/components/EditDiffView";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import type { ProgramInput } from "@/lib/programs";

const STATUS_TONE = { PUBLISHED: "success", PENDING: "warning", REJECTED: "danger" } as const;

export default async function AdminPage() {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") redirect("/");

  const [pendingPrograms, pendingEdits, pendingReferences, recentPrograms, recentReviews, durationLabelMap, pendingPollReviews] =
    await Promise.all([
      listPendingPrograms(),
      listPendingEdits(),
      listPendingReferences(),
      role === "admin" ? listRecentPrograms(8) : Promise.resolve([]),
      role === "admin" ? listRecentReviews(8) : Promise.resolve([]),
      getDurationLabelMap(),
      role === "admin" ? countPendingReviews() : Promise.resolve(0),
    ]);

  const submitters = await getUsersByIds([
    ...pendingPrograms.map((p) => p.createdById),
    ...pendingEdits.map((e) => e.submittedById),
  ]);

  return (
    <PageContainer width="base" className="gap-10">
      <PageHeader title="Admin" description="Review submissions before they go live.">
        {role === "admin" && (
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href="/api/admin/programs-xlsx"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Download programs.xlsx
            </a>
            <Link
              href="/admin/settings"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Site settings
            </Link>
            <Link
              href="/admin/tags"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Tags & categories
            </Link>
            <Link
              href="/admin/email"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Email
            </Link>
            <Link
              href="/admin/leads"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Leads
            </Link>
            <Link
              href="/admin/references"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              References
            </Link>
            <Link
              href="/admin/analytics"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Analytics
            </Link>
            <Link
              href="/admin/polls"
              className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5" })}
            >
              Ratings
              {pendingPollReviews > 0 && (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent/20 px-1 text-[10px] font-semibold text-accent-hover dark:text-accent">
                  {pendingPollReviews}
                </span>
              )}
            </Link>
          </div>
        )}
      </PageHeader>

      {role === "admin" && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Recently added programs
            </h2>
            {recentPrograms.length === 0 ? (
              <p className="text-sm text-muted">No programs yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {recentPrograms.map((program) => (
                  <div key={program.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <Link
                        href={`/programs/${program.slug}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {program.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {new Date(program.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[program.status]}>{program.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Recently added reviews
            </h2>
            {recentReviews.length === 0 ? (
              <p className="text-sm text-muted">No reviews yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {recentReviews.map((review) => (
                  <div key={review.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <Link
                        href={`/programs/${review.program.slug}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {review.program.name}
                      </Link>
                      <span className="whitespace-nowrap text-xs text-accent">
                        {"★".repeat(review.rating)}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-foreground/70">{review.text}</p>
                    <p className="text-xs text-muted">
                      {review.reviewerName} · {new Date(review.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Pending Programs ({pendingPrograms.length})
        </h2>
        {pendingPrograms.length === 0 ? (
          <p className="text-sm text-muted">
            No new program submissions waiting for review.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {pendingPrograms.map((program) => (
              <div
                key={program.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/programs/${program.slug}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {program.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {program.organization} · submitted by{" "}
                    {submitters.get(program.createdById)?.name ?? "Unknown"} on{" "}
                    {new Date(program.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <QueueActions
                  approveUrl={`/api/admin/programs/${program.id}/approve`}
                  rejectUrl={`/api/admin/programs/${program.id}/reject`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Pending Edits ({pendingEdits.length})
        </h2>
        {pendingEdits.length === 0 ? (
          <p className="text-sm text-muted">
            No proposed edits waiting for review.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingEdits.map((edit) => {
              const proposed = JSON.parse(edit.payload) as ProgramInput;
              const fieldDiffs = buildFieldDiffs(edit.program, proposed, durationLabelMap);
              const tagDiff = buildTagDiff(edit.program.tags, proposed.tags);
              return (
                <div
                  key={edit.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4"
                >
                  <div>
                    <Link
                      href={`/programs/${edit.program.slug}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      Edit to {edit.program.name}
                    </Link>
                    <p className="text-xs text-muted">
                      submitted by {submitters.get(edit.submittedById)?.name ?? "Unknown"} on{" "}
                      {new Date(edit.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <EditDiffView fieldDiffs={fieldDiffs} tagDiff={tagDiff} />
                  <QueueActions
                    reviewUrl={`/admin/edits/${edit.id}`}
                    rejectUrl={`/api/admin/edits/${edit.id}/reject`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Pending References ({pendingReferences.length})
        </h2>
        {pendingReferences.length === 0 ? (
          <p className="text-sm text-muted">
            No alumni reference submissions waiting for review.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {pendingReferences.map((reference) => (
              <div
                key={reference.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/programs/${reference.program.slug}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {reference.displayName} — {reference.program.name}
                  </Link>
                  <p className="text-xs text-muted">
                    Attended {reference.attendedText} · submitted{" "}
                    {new Date(reference.createdAt).toLocaleDateString()}
                  </p>
                  {reference.note && (
                    <p className="mt-1 text-xs text-foreground/70">
                      &ldquo;{reference.note}&rdquo;
                    </p>
                  )}
                </div>
                <QueueActions
                  approveUrl={`/api/admin/references/${reference.id}/approve`}
                  rejectUrl={`/api/admin/references/${reference.id}/reject`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {role === "admin" && <UserRoleManagement />}
    </PageContainer>
  );
}

async function UserRoleManagement() {
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 100 });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          User Roles
        </h2>
        <p className="mt-1 text-sm text-muted">
          Manage moderator access for {users.length} user
          {users.length === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  user.username ||
                  "Unnamed user"}
              </p>
              <p className="text-xs text-muted">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
            <RoleSelect
              userId={user.id}
              role={normalizeRole(user.publicMetadata?.role)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
