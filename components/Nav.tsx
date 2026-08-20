import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";
import { MobileAuthLinks, DesktopAuthControls } from "@/components/NavAuthControls";
import MobileNavDrawer from "@/components/MobileNavDrawer";

export default async function Nav() {
  const [logoUrl, logoMode, glossaryEnabled, findV2Enabled] = await Promise.all([
    getSiteContent("headerLogoUrl"),
    getSiteContent("headerLogoMode"),
    getSiteContent("glossaryEnabled"),
    getSiteContent("findV2Enabled"),
  ]);
  const showText = !logoUrl || logoMode === "alongside";
  // Flag-only, deliberately not role-aware -- Nav renders on every route via the root
  // layout, and a role check here (Clerk reads cookies) would force the whole site
  // dynamic. When the section is off, the link disappears for admins too; they can
  // still reach /glossary or /admin/glossary by URL.
  const showGlossaryLink = glossaryEnabled === "true";
  // Same flag-only posture as showGlossaryLink above. The Placement Quiz link only ever
  // points at /match (v1's /find no longer exists -- it permanently redirects here, see
  // next.config.ts) -- hiding the link when the flag is off avoids sending a visitor into
  // a redirect that dead-ends in notFound().
  const showPlacementQuizLink = findV2Enabled === "true";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary">
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-x-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-serif text-xl font-semibold tracking-tight text-primary-foreground"
        >
          {logoUrl && (
            // Deliberately still a raw <img>, not next/image: this box is w-auto (width
            // driven by whatever aspect ratio the admin-configured logo actually has,
            // preset asset or Blob upload alike), and next/image requires a fixed
            // width/height for a string src. Guessing a ratio risks visibly distorting
            // the logo on every page for any future upload that doesn't match the guess;
            // a correct fix needs the real image dimensions (probed server-side, cached
            // per URL) and was judged disproportionate to add in this pass. Renders on
            // every page, so still benefits from Blob's own HTTP caching even unoptimized.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Israel Programs Wiki" className="h-9 w-auto sm:h-12 md:h-14" />
          )}
          {showText && "Israel Programs Wiki"}
        </Link>

        <div className="flex flex-nowrap items-center gap-x-3 sm:gap-x-6">
          {/* Public links: inline at sm+; tucked behind the mobile hamburger below
              sm, since a logo + 4 links + toggle + auth can't fit a 390px row at a
              tappable size no matter how tight the spacing gets. */}
          <nav className="hidden items-center gap-x-6 text-sm font-medium text-primary-foreground/90 sm:flex">
            <Link href="/programs" className="hover:text-accent">
              Browse
            </Link>
            {showPlacementQuizLink && (
              <Link href="/match" className="hover:text-accent">
                Placement Quiz
              </Link>
            )}
            {showGlossaryLink && (
              <Link href="/glossary" className="hover:text-accent">
                Glossary
              </Link>
            )}
            <Link href="/mission" className="hover:text-accent">
              Background
            </Link>
            <Link href="/programs/new" className="hover:text-accent">
              Add Program
            </Link>
          </nav>

          {/* Mobile nav drawer -- native <details>/<summary>, same zero-JS disclosure
              pattern as the homepage's "About this project" section, progressively
              enhanced by MobileNavDrawer's client-side auto-close (outside
              click/Escape/inside-link-click) -- see that component. Nav.tsx itself
              stays a server component; only that one wrapper is a client boundary.
              Entirely absent at sm+ (`sm:hidden`), where the links above are inline
              instead. */}
          <MobileNavDrawer
            className="relative sm:hidden"
            trigger={
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
            }
          >
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded border border-border bg-surface p-2 text-sm">
              <Link
                href="/programs"
                className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
              >
                Browse
              </Link>
              {showPlacementQuizLink && (
                <Link
                  href="/match"
                  className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
                >
                  Placement Quiz
                </Link>
              )}
              {showGlossaryLink && (
                <Link
                  href="/glossary"
                  className="block rounded px-3 py-2 text-foreground hover:bg-surface-muted"
                >
                  Glossary
                </Link>
              )}
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
              {/* Sign in/up live here on mobile, not on the row -- neither auth
                  action is what a first-time mobile visitor is there to do; the row
                  is for search/browse, and signup belongs in context (next to Save,
                  or after search results) rather than competing with the wordmark
                  for header space. Desktop keeps both inline (below). */}
              <MobileAuthLinks />
            </div>
          </MobileNavDrawer>

          {/* Both auth buttons are desktop-only on the row -- on mobile they move into
              the hamburger drawer above instead (a wrapping div's display toggle, not
              a class merged onto either button itself: buttonVariants' base class
              always includes a bare `inline-flex` with no responsive prefix, and clsx
              (lib/cn.ts) does no Tailwind-aware conflict resolution, so a `hidden
              sm:flex` merged into the same className as that base `inline-flex` would
              be a same-specificity cascade fight with an unpredictable winner -- this
              is what let Sign Up render and overflow on mobile before. Hiding the
              parent instead sidesteps the conflict entirely). */}
          <DesktopAuthControls />
        </div>
      </div>
    </header>
  );
}
