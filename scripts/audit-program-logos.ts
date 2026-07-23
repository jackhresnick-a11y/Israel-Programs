/**
 * Read-only audit: reports how many programs have no usable logo after the
 * move to Vercel Blob -- either a null logoUrl, or one still pointing at a local
 * /uploads/... path (which no longer resolves, since that disk write path is gone).
 * A Blob URL (https://*.public.blob.vercel-storage.com/...) counts as OK.
 *
 * MODIFIES NOTHING. Run:
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/audit-program-logos.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isVercelBlobUrl } from "../lib/blob";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const programs = await prisma.program.findMany({
    select: { name: true, logoUrl: true, status: true, contactWebsite: true, signupUrl: true },
    orderBy: { name: "asc" },
  });

  const nullLogo: string[] = [];
  const localPath: { name: string; logoUrl: string }[] = [];
  const blobHosted: string[] = [];
  const other: { name: string; logoUrl: string }[] = [];

  for (const p of programs) {
    if (!p.logoUrl) {
      nullLogo.push(p.name);
    } else if (p.logoUrl.startsWith("/uploads/")) {
      localPath.push({ name: p.name, logoUrl: p.logoUrl });
    } else if (isVercelBlobUrl(p.logoUrl)) {
      blobHosted.push(p.name);
    } else {
      other.push({ name: p.name, logoUrl: p.logoUrl });
    }
  }

  console.log(`Total programs: ${programs.length}`);
  console.log(`  Blob-hosted logo (OK):       ${blobHosted.length}`);
  console.log(`  Null logo:                   ${nullLogo.length}`);
  console.log(`  Stale local /uploads path:   ${localPath.length}`);
  console.log(`  Other/unrecognized URL:      ${other.length}`);

  const unusable = nullLogo.length + localPath.length;
  console.log(`\nPrograms with no usable logo (null or stale local path): ${unusable}`);

  if (localPath.length > 0) {
    console.log(`\n-- Stale local /uploads paths (would 404; need re-upload) --`);
    for (const p of localPath) console.log(`  ${p.name}  ->  ${p.logoUrl}`);
  }
  if (other.length > 0) {
    console.log(`\n-- Other/unrecognized logoUrl values (review manually) --`);
    for (const p of other) console.log(`  ${p.name}  ->  ${p.logoUrl}`);
  }
  if (nullLogo.length > 0) {
    console.log(`\n-- Programs with a null logo (${nullLogo.length}) --`);
    for (const name of nullLogo) console.log(`  ${name}`);
  }

  const published = programs.filter((p) => p.status === "PUBLISHED");
  const publishedNullLogo = published.filter((p) => !p.logoUrl);
  const publishedNullLogoWithSite = publishedNullLogo.filter((p) => p.contactWebsite || p.signupUrl);

  console.log(`\n-- Part B research scope --`);
  console.log(`Published programs:                          ${published.length}`);
  console.log(`Published with null logo:                    ${publishedNullLogo.length}`);
  console.log(`Published, null logo, has contactWebsite/signupUrl: ${publishedNullLogoWithSite.length}`);
  console.log(`Published, null logo, no usable site (skipped):     ${publishedNullLogo.length - publishedNullLogoWithSite.length}`);

  console.log(`\n(Read-only audit -- no rows were modified.)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
