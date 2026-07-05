import Link from "next/link";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentRole, normalizeRole } from "@/lib/roles";
import { listPendingPrograms, listPendingEdits } from "@/lib/programs";
import RoleSelect from "@/components/RoleSelect";
import QueueActions from "@/components/QueueActions";
import type { ProgramInput } from "@/lib/programs";

export default async function AdminPage() {
  const role = await getCurrentRole();
  if (role !== "moderator" && role !== "admin") redirect("/");

  const [pendingPrograms, pendingEdits] = await Promise.all([
    listPendingPrograms(),
    listPendingEdits(),
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
              return (
                <div
                  key={edit.id}
                  className="flex flex-col gap-3 rounded-xl border border-blue-100 p-4 dark:border-blue-950"
                >
                  <div className="flex items-center justify-between gap-4">
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
                    <QueueActions
                      approveUrl={`/api/admin/edits/${edit.id}/approve`}
                      rejectUrl={`/api/admin/edits/${edit.id}/reject`}
                    />
                  </div>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-black/50 dark:text-white/50">
                        Name
                      </dt>
                      <dd>{proposed.name}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black/50 dark:text-white/50">
                        Cost
                      </dt>
                      <dd>{proposed.cost || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-black/50 dark:text-white/50">
                        Description
                      </dt>
                      <dd className="line-clamp-3">{proposed.description}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
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
