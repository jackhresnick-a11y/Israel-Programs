import { prisma } from "@/lib/prisma";

export async function getSiteContent(key: string): Promise<string | null> {
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return row?.body ?? null;
}

export async function upsertSiteContent(key: string, body: string) {
  return prisma.siteContent.upsert({
    where: { key },
    update: { body },
    create: { key, body },
  });
}

export async function deleteSiteContent(key: string) {
  await prisma.siteContent.deleteMany({ where: { key } });
}
