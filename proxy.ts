import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/admin(.*)"]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// Scoped to routes that actually call auth()/auth.protect() or a
// requireRole()/requireSignedIn() check (lib/roles.ts) on the server, so a
// bare visit to the public read surface (/, /programs, /programs/[slug],
// /mission, /methodology, /compare, /s/[token], sitemap.xml, robots.txt,
// llms.txt, static assets) never pays a middleware invocation. The
// sign-in/sign-up-protected pages that read auth client-side only
// (SignInButton, <Show>, UserButton) don't need middleware either -- Clerk
// resolves those in the browser.
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
    "/programs/new",
    "/programs/:slug/edit",
    "/mission/edit",
    "/rate/:path*",
    "/saved/:path*",
    "/references/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
  ],
};
