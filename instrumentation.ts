export async function register() {
  // Needs Prisma access, so only run in the Node runtime (not edge). No
  // filesystem access here anymore -- the export log lives in Neon, so this
  // works the same whether triggered by a local `next dev` or a Vercel
  // serverless cold start.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reconcileExportLog } = await import("@/lib/programExport");
  await reconcileExportLog();
}
