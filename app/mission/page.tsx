import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";
import { getCurrentRole } from "@/lib/roles";

export default async function MissionPage() {
  const [body, role] = await Promise.all([
    getSiteContent("mission"),
    getCurrentRole(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4 border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          Mission Statement
        </h1>
        {role === "admin" && (
          <Link
            href="/mission/edit"
            className="shrink-0 rounded-lg border border-primary/20 px-3 py-1.5 text-sm text-primary hover:bg-primary/5 dark:border-white/15 dark:text-white dark:hover:bg-white/[.06]"
          >
            Edit
          </Link>
        )}
      </div>

      {body ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80 dark:text-white/80">
          {body}
        </p>
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">
          No mission statement has been set yet.
        </p>
      )}
    </div>
  );
}
