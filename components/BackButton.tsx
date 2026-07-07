"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  /** Where to go if there's no in-app history to return to (e.g. a direct link/new tab). */
  fallbackHref?: string;
  className?: string;
};

export default function BackButton({ fallbackHref = "/programs", className = "" }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // history.length > 1 means there's somewhere in *this tab* to go back
        // to; on a fresh tab/direct link it's 1, so fall back to a sane default
        // instead of leaving the user stuck or bouncing them out of the app.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={`inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground ${className}`}
    >
      <span aria-hidden="true">&larr;</span> Back
    </button>
  );
}
