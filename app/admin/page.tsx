import Link from "next/link";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentRole, normalizeRole } from "@/lib/roles";
import { listPendingPrograms, listPendingEdits } from "@/lib/programs";
import { listPendingReferences } from "@/lib/references";
import { buildFieldDiffs, buildTagDiff } from "@/lib/diff";
import RoleSelect from "@/components/RoleSelect";
import QueueActions from "@/components/QueueActions";
import EditDiffView from "@/components/EditDiffView";
import type { ProgramInput } from "@/lib/programs";

export default async function AdminPage() {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") redirect("/");

  const [pendingPrograms, pendingEdits, pendingReferences] = await Promise.all([
    listPendingPrograms(),
    listPendingEdits(),
    listPendingReferences(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <div className="border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          Admin
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Review submissions before they go live.
        </p>
        {role === "admin" && (
          <a
            href="/api/admin/programs-xlsx"
            className="mt-3 inline-block w-fit rounded-lg border border-primary/20 px-3 py-1.5 text-sm text-primary hover:bg-primary/5 dark:border-white/15 dark:text-white dark:hover:bg-white/[.06]"
          >
            Download programs.xlsx
          </a>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Pending Programs ({pendingPrograms.length})
        </h2>
        {pendingPrograms.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No new program submissions waiting for review.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-blue-100 rounded-xl border border-blue-100 dark:divide-blue-950 dark:border-blue-950">
            {pendingPrograms.map((program) => (
              <div
                key={program.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/programs/${program.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {program.name}
                  </Link>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {program.organization} · submitted{" "}
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
        <h2 className="text-lg font-semibold tracking-tight">
          Pending Edits ({pendingEdits.length})
        </h2>
        {pendingEdits.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No proposed edits waiting for review.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingEdits.map((edit) => {
              const proposed = JSON.parse(edit.payload) as ProgramInput;
              const fieldDiffs = buildFieldDiffs(edit.program, proposed);
              const tagDiff = buildTagDiff(edit.program.tags, proposed.tags);
              return (
                <div
                  key={edit.id}
                  className="flex flex-col gap-3 rounded-xl border border-blue-100 p-4 dark:border-blue-950"
                >
                  <div>
                    <Link
                      href={`/programs/${edit.program.slug}`}
                      className="text-sm font-medium hover:underline"
                    >
                      Edit to {edit.program.name}
                    </Link>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      submitted {new Date(edit.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <EditDiffView fieldDiffs={fieldDiffs} tagDiff={tagDiff} />
                  <QueueActions
                    approveUrl={`/api/admin/edits/${edit.id}/approve`}
                    rejectUrl={`/api/admin/edits/${edit.id}/reject`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Pending References ({pendingReferences.length})
        </h2>
        {pendingReferences.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No alumni reference submissions waiting for review.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-blue-100 rounded-xl border border-blue-100 dark:divide-blue-950 dark:border-blue-950">
            {pendingReferences.map((reference) => (
              <div
                key={reference.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/programs/${reference.program.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {reference.displayName} — {reference.program.name}
                  </Link>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Attended {reference.attendedText} · submitted{" "}
                    {new Date(reference.createdAt).toLocaleDateString()}
                  </p>
                  {reference.note && (
                    <p className="mt-1 text-xs text-black/60 dark:text-white/60">
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
    </div>
  );
}

async function UserRoleManagement() {
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 100 });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">User Roles</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Manage moderator access for {users.length} user
          {users.length === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-blue-100 rounded-xl border border-blue-100 dark:divide-blue-950 dark:border-blue-950">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  user.username ||
                  "Unnamed user"}
              </p>
              <p className="text-xs text-black/50 dark:text-white/50">
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
