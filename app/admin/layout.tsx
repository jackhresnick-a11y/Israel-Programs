export const dynamic = "force-dynamic";

/**
 * No shared admin chrome -- this layout exists only to force the whole /admin
 * subtree to render dynamically. Without it, a page with no data or auth
 * dependency of its own (e.g. the legacy-URL redirect shims at
 * app/admin/emails, app/admin/outreach, app/admin/email-verification) is
 * otherwise static-eligible and gets prerendered at build time. Middleware
 * (proxy.ts's /admin/:path* matcher) still gates every request regardless of
 * static/dynamic, so this isn't a security fix -- it's belt-and-suspenders so
 * admin output is never served from a build-time cache, which is the explicit
 * bar this project holds /admin/* to.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
