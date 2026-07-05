import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";

export default async function Nav() {
  const role = await getCurrentRole();
  const isModerator = role === "moderator" || role === "admin";

  return (
    <header className="bg-primary">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-white"
        >
          Israel Programs Wiki
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-white/90">
          <Link href="/programs" className="hover:text-amber-300">
            Browse
          </Link>
          <Link href="/programs/new" className="hover:text-amber-300">
            Add Program
          </Link>
          {isModerator && (
            <Link href="/admin" className="hover:text-amber-300">
              Admin
            </Link>
          )}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-full border border-white/30 px-4 py-1.5 text-white hover:bg-white/10">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-full bg-amber-500 px-4 py-1.5 font-semibold text-slate-900 hover:bg-amber-400">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
