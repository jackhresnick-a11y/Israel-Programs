import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentRole, normalizeRole } from "@/lib/roles";
import RoleSelect from "@/components/RoleSelect";

export default async function AdminPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ limit: 100 });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Manage moderator access for {users.length} user
          {users.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
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
    </div>
  );
}
