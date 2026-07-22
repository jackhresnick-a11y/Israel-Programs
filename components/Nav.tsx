import Link from "next/link";
import { SignInButton, SignUpButton, Show } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { buttonVariants } from "@/components/ui/Button";
import ThemeToggle from "@/components/ThemeToggle";
import AccountMenu from "@/components/AccountMenu";

export default async function Nav() {
  const [role, logoUrl, logoMode, logoUrlDark] = await Promise.all([
    getCurrentRole(),
    getSiteContent("headerLogoUrl"),
    getSiteContent("headerLogoMode"),
    getSiteContent("headerLogoUrlDark"),
  ]);
  const isAdmin = role === "admin";
  const showText = !logoUrl || logoMode === "alongside";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary">
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-x-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-serif text-xl font-semibold tracking-tight text-primary-foreground"
        >
          {logoUrl && (
            <>
              {/* External Blob URL — plain img avoids next/image remotePatterns config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Israel Programs Wiki"
                className={`h-9 w-auto sm:h-12 md:h-14 ${logoUrlDark ? "dark:hidden" : ""}`}
              />
              {logoUrlDark && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrlDark}
                  alt="Israel Programs Wiki"
                  className="hidden h-9 w-auto dark:block sm:h-12 md:h-14"
                />
              )}
            </>
          )}
          {showText && "Israel Programs Wiki"}
        </Link>

        <div className="flex flex-nowrap items-center gap-x-3 sm:gap-x-5">
          {/* Public links: inline at sm+; tucked behind the mobile hamburger below
              sm, since a logo + 3 links + toggle + auth can't fit a 390px row at a
              tappable size no matter how tight the spacing gets. */}
          <nav className="hidden items-center gap-x-5 text-sm font-medium text-primary-foreground/90 sm:flex">
            <Link href="/programs" className="hover:text-accent">
              Browse
            </Link>
            <Link href="/mission" className="hover:text-accent">
              Background
            </Link>
            <Link href="/programs/new" className="hover:text-accent">
              Add Program
            </Link>
          </nav>

          {/* Desktop-only header toggle for both auth states -- on mobile it moves
              into a menu instead (the hamburger drawer below for signed-out, since
              that state has no other menu; AccountMenu's avatar menu for signed-in,
              which already includes it -- see components/AccountMenu.tsx). */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          {/* Mobile nav drawer -- native <details>/<summary>, same zero-JS disclosure
              pattern as the homepage's "About this project" section, so this stays a
              server component with no client-side open/close state. Entirely absent
              at sm+ (`sm:hidden` on the wrapper), where the links above are inline
              instead. */}
          <details className="relative sm:hidden">
            <summary
              aria-label="Menu"
              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-primary-foreground/90 hover:text-accent [&::-webkit-details-marker]:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-surface p-2 text-sm shadow-lg">
              <Link
                href="/programs"
                className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
              >
                Browse
              </Link>
              <Link
                href="/mission"
                className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
              >
                Background
              </Link>
              <Link
                href="/programs/new"
                className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
              >
                Add Program
              </Link>
              <Show when="signed-out">
                <ThemeToggle variant="menu" />
                {/* Sign in/up live here on mobile, not on the row -- neither auth
                    action is what a first-time mobile visitor is there to do; the row
                    is for search/browse, and signup belongs in context (next to Save,
                    or after search results) rather than competing with the wordmark
                    for header space. Desktop keeps both inline (below). */}
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
            </div>
          </details>

          {/* Both auth buttons are desktop-only on the row -- on mobile they move into
              the hamburger drawer above instead (a wrapping div's display toggle, not
              a class merged onto either button itself: buttonVariants' base class
              always includes a bare `inline-flex` with no responsive prefix, and clsx
              (lib/cn.ts) does no Tailwind-aware conflict resolution, so a `hidden
              sm:flex` merged into the same className as that base `inline-flex` would
              be a same-specificity cascade fight with an unpredictable winner -- this
              is what let Sign Up render and overflow on mobile before. Hiding the
              parent instead sidesteps the conflict entirely). */}
          <Show when="signed-out">
            <div className="hidden items-center gap-x-3 sm:flex">
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
            </div>
          </Show>
          <Show when="signed-in">
            <AccountMenu isAdmin={isAdmin} />
          </Show>
        </div>
      </div>
    </header>
  );
}
