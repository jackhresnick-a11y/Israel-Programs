"use client";

import { SignInButton, Show } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Wraps content behind Clerk's client-side signed-in check, showing a "Sign in to
 * {action}" modal trigger otherwise. Client-only so importing it from a Server
 * Component page doesn't pull in <Show>'s server-side variant, which calls auth()
 * during render and forces the whole page into dynamic rendering (see
 * components/NavAuthControls.tsx's doc comment for the full why).
 */
export default function SignedInGate({
  action,
  children,
}: {
  action: string;
  children: React.ReactNode;
}) {
  return (
    <Show
      when="signed-in"
      fallback={
        <SignInButton mode="modal">
          <button className={buttonVariants({ variant: "secondary" })}>Sign in to {action}</button>
        </SignInButton>
      }
    >
      {children}
    </Show>
  );
}
