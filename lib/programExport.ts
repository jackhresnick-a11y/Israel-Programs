import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

const SHEET_NAME = "Programs";
const HEADER = "Program Name";

/**
 * Records that a program should appear in the export log, capturing its name
 * at this moment -- the row is immutable afterward regardless of later
 * renames or deletion of the underlying Program. Never throws: a logging
 * hiccup must not break program creation, and reconcileExportLog() is the
 * safety net for anything this misses.
 */
export async function recordProgramForExport(programId: string, name: string) {
  try {
    await prisma.programExportRow.create({ data: { programId, name } });
  } catch (err) {
    // P2002 = unique constraint on programId -- already logged, not an error.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return;
    console.error("Failed to record program for export:", err);
  }
}

/**
 * Fills in any Program rows that were created outside the live hook (a
 * direct database insert, a script that bypasses createProgram) -- run on
 * every server start via instrumentation.ts. Since the state being
 * reconciled lives in Neon rather than local disk, this works identically
 * whether it's triggered by a local `next dev` or a Vercel serverless cold
 * start; no instance-local filesystem is involved.
 */
export async function reconcileExportLog() {
  try {
    const [programs, loggedRows] = await Promise.all([
      prisma.program.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.programExportRow.findMany({ select: { programId: true } }),
    ]);
    const alreadyLogged = new Set(loggedRows.map((r) => r.programId));
    const missing = programs.filter((p) => !alreadyLogged.has(p.id));

    for (const program of missing) {
      await recordProgramForExport(program.id, program.name);
    }
  } catch (err) {
    console.error("Failed to reconcile program export log:", err);
  }
}

/** Builds the xlsx fresh, in memory, from the immutable export log -- no file
 * ever touches disk, so this works the same on a serverless instance as it
 * does locally. */
export async function generateProgramsXlsxBuffer() {
  const rows = await prisma.programExportRow.findMany({
    orderBy: { createdAt: "asc" },
    select: { name: true },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.getCell("A1").value = HEADER;
  sheet.getCell("A1").font = { bold: true };
  for (const row of rows) {
    sheet.addRow([row.name]);
  }

  return workbook.xlsx.writeBuffer();
}
