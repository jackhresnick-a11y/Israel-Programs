export async function register() {
  // Needs filesystem + Prisma access, so only run in the Node runtime (not edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reconcileXlsxWithDatabase } = await import("@/lib/xlsxSync");
  await reconcileXlsxWithDatabase();
}
