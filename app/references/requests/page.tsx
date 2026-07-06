import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { listContactRequestsForUser } from "@/lib/references";
import ContactRequestActions from "@/components/ContactRequestActions";

export default async function ReferenceRequestsPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          My Reference Requests
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Sign in to see contact requests from people interested in the
          programs you&apos;re a reference for.
        </p>
        <SignInButton mode="modal">
          <button className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400">
            Sign in
          </button>
        </SignInButton>
      </div>
    );
  }

  const requests = await listContactRequestsForUser(userId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="border-l-4 border-amber-500 pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-primary dark:text-white">
          My Reference Requests
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          People who&apos;d like to hear about your experience. Reply to them
          directly using the email shown, then mark it as replied here.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          No contact requests yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((req) => (
            <li
              key={req.id}
              className="flex flex-col gap-2 rounded-xl border border-blue-100 p-4 dark:border-blue-950"
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/programs/${req.reference.program.slug}`}
                  className="text-sm font-medium hover:underline"
                >
                  {req.reference.program.name}
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    req.status === "REPLIED"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {req.status === "REPLIED" ? "Replied" : "Open"}
                </span>
              </div>
              <p className="text-sm text-black/80 dark:text-white/80">
                {req.note}
              </p>
              <p className="text-xs text-black/50 dark:text-white/50">
                Reply to: {req.requesterEmail} · requested{" "}
                {new Date(req.createdAt).toLocaleDateString()}
              </p>
              {req.status === "OPEN" && <ContactRequestActions id={req.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
