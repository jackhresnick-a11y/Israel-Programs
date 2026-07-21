import { prisma } from "@/lib/prisma";

export async function getSiteContent(key: string): Promise<string | null> {
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return row?.body ?? null;
}

/** Batched form of getSiteContent -- one round-trip for many keys instead of one per key.
 * Keys with no row (or no value) resolve to null, same as getSiteContent. */
export async function getSiteContentMany(
  keys: string[]
): Promise<Record<string, string | null>> {
  const rows = await prisma.siteContent.findMany({
    where: { key: { in: keys } },
    select: { key: true, body: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.body]));
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = byKey.get(key) ?? null;
  }
  return result;
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
