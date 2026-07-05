import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";

export default async function Nav() {
  const role = await getCurrentRole();
  const isModerator = role === "moderator" || role === "admin";

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Israel Programs Wiki
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/programs" className="hover:underline">
            Browse
          </Link>
          {isModerator && (
            <Link href="/programs/new" className="hover:underline">
              Add Program
            </Link>
          )}
          {role === "admin" && (
            <Link href="/admin" className="hover:underline">
              Admin
            </Link>
          )}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-full border border-black/10 px-4 py-1.5 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-full bg-foreground px-4 py-1.5 text-background hover:opacity-90">
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
