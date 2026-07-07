import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getCurrentRole } from "@/lib/roles";
import { buttonVariants } from "@/components/ui/Button";

export default async function Nav() {
  const [role, { userId }] = await Promise.all([getCurrentRole(), auth()]);
  const isModerator = role === "moderator" || role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <Link
          href="/"
          className="font-serif text-xl font-semibold tracking-tight text-primary-foreground"
        >
          Israel Programs Wiki
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-primary-foreground/90">
          <Link href="/programs" className="hover:text-accent">
            Browse
          </Link>
          <Link href="/mission" className="hover:text-accent">
            Mission
          </Link>
          <Link href="/programs/new" className="hover:text-accent">
            Add Program
          </Link>
          {userId && (
            <Link href="/references/requests" className="hover:text-accent">
              My Reference Requests
            </Link>
          )}
          {isModerator && (
            <Link href="/admin" className="hover:text-accent">
              Admin
            </Link>
          )}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className={buttonVariants({ variant: "onDark", size: "sm" })}>
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className={buttonVariants({ variant: "primary", size: "sm" })}>
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
