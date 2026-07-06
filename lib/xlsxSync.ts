import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

const XLSX_PATH = path.join(process.cwd(), "data", "programs.xlsx");
const SYNC_STATE_PATH = path.join(process.cwd(), "data", ".programs-xlsx-sync-state.json");
const SHEET_NAME = "Programs";
const HEADER = "Program Name";

type SyncState = { syncedProgramIds: string[] };

async function readSyncState(): Promise<SyncState> {
  if (!existsSync(SYNC_STATE_PATH)) return { syncedProgramIds: [] };
  try {
    return JSON.parse(await readFile(SYNC_STATE_PATH, "utf-8"));
  } catch {
    return { syncedProgramIds: [] };
  }
}

async function writeSyncState(state: SyncState) {
  await writeFile(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

async function loadOrCreateWorkbook(): Promise<{ workbook: ExcelJS.Workbook; sheet: ExcelJS.Worksheet }> {
  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet;

  if (existsSync(XLSX_PATH)) {
    await workbook.xlsx.readFile(XLSX_PATH);
    sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.addWorksheet(SHEET_NAME);
  } else {
    sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.getCell("A1").value = HEADER;
    sheet.getCell("A1").font = { bold: true };
  }

  return { workbook, sheet };
}

/**
 * All writes to the xlsx file are serialized through this queue. exceljs has
 * no concurrent-write safety of its own, and two programs created in close
 * succession (e.g. a form submission overlapping a reconciliation sweep)
 * would otherwise race on read-modify-write and silently drop one append.
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function appendNamesUnqueued(entries: { id: string; name: string }[]) {
  if (entries.length === 0) return;

  const state = await readSyncState();
  const alreadySynced = new Set(state.syncedProgramIds);
  const toAppend = entries.filter((e) => !alreadySynced.has(e.id));
  if (toAppend.length === 0) return;

  const { workbook, sheet } = await loadOrCreateWorkbook();
  for (const entry of toAppend) {
    // addRow appends after the last existing row -- it never touches or
    // reorders rows already present, including any notes in columns B/C+.
    sheet.addRow([entry.name]);
    alreadySynced.add(entry.id);
  }
  await workbook.xlsx.writeFile(XLSX_PATH);
  await writeSyncState({ syncedProgramIds: Array.from(alreadySynced) });
}

/** Appends a single newly-created program's name. Never throws -- a spreadsheet
 * hiccup must not break program creation; the next reconciliation sweep will
 * pick up anything this call fails to write. */
export async function appendProgramNameToXlsx(programId: string, name: string) {
  try {
    await enqueue(() => appendNamesUnqueued([{ id: programId, name }]));
  } catch (err) {
    console.error("Failed to append program to xlsx sync:", err);
  }
}

/** Appends every DB program not yet marked synced, oldest first. Safe to call
 * repeatedly -- already-synced ids are always skipped. */
export async function reconcileXlsxWithDatabase() {
  try {
    const programs = await prisma.program.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    await enqueue(() => appendNamesUnqueued(programs));
  } catch (err) {
    console.error("Failed to reconcile xlsx sync with database:", err);
  }
}

export function getXlsxPath() {
  return XLSX_PATH;
}

export function xlsxExists() {
  return existsSync(XLSX_PATH);
}
