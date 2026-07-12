import { prisma } from "@/lib/prisma";
import { upsertSiteContent } from "@/lib/siteContent";

/**
 * One-time seed for the outreach feature's editable SiteContent keys. Safe to re-run
 * (upsert) but won't be needed again once the admin has customized these via the
 * /admin/outreach page -- this only sets initial defaults if the keys don't exist yet.
 */
async function main() {
  await upsertSiteContent("outreachSubjectTemplate", "Your {programName} listing on Israel Programs Wiki");
  await upsertSiteContent(
    "outreachBodyTemplate",
    `Hi {contactName|"there"},

We wanted to let you know that {programDescriptor} is listed on Israel Programs Wiki, a directory of Israel programs for Jewish young adults:

{listingUrl}

Could you take a moment to confirm this listing is accurate and that this is still the right email address to reach you at? Just reply to this email either way.

Thanks,
Israel Programs Wiki`
  );
  await upsertSiteContent("outreachBatchSize", "30");

  console.log("Seeded outreachSubjectTemplate, outreachBodyTemplate, outreachBatchSize.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
