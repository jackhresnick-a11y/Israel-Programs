const PROD_URL = "https://israelprogramswiki.com";

export const SITE_NAME = "Israel Programs Wiki";

/** Vercel previews build with NODE_ENV=production, so they intentionally get the
 *  prod origin too -- a preview hostname is auth-gated and would be a dead link
 *  for anyone a program/folder gets shared with. */
export const SITE_URL =
  process.env.NODE_ENV === "production" ? PROD_URL : "http://localhost:3000";

export function programUrl(slug: string): string {
  return `${SITE_URL}/programs/${slug}`;
}

export function folderShareUrl(token: string): string {
  return `${SITE_URL}/s/${token}`;
}
