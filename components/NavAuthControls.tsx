"use client";

import { SignInButton, SignUpButton, Show } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/Button";
import AccountMenu from "@/components/AccountMenu";

/**
 * Nav's sign-in/sign-up/account-menu controls, split out of Nav.tsx (a Server
 * Component) into a client component. Clerk's <Show> resolves to a different
 * implementation depending on the importing module: from a Server Component it
 * calls auth() itself during render (which forces the whole page -- and every
 * page sharing this layout -- into dynamic rendering); from a Client Component
 * it reads reactive client-side auth state instead, with no server-side cost.
 * Importing Show only here (never in Nav.tsx itself) is what keeps Nav, and the
 * pages it wraps, eligible for static rendering.
 */

export function MobileAuthLinks() {
  return (
    <Show when="signed-out">
      <SignInButton mode="modal">
        <button className="block w-full rounded px-3 py-2 text-left text-foreground hover:bg-surface-muted">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="block w-full rounded px-3 py-2 text-left text-foreground hover:bg-surface-muted">
          Sign up
        </button>
      </SignUpButton>
    </Show>
  );
}

export function DesktopAuthControls() {
  return (
    <>
      <Show when="signed-out">
        <div className="hidden items-center gap-x-3 sm:flex">
          <SignInButton mode="modal">
            <button className={buttonVariants({ variant: "onDark", size: "sm" })}>Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className={buttonVariants({ variant: "primary", size: "sm" })}>Sign up</button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <AccountMenu />
      </Show>
    </>
  );
}
