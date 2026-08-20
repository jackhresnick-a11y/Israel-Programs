/**
 * Read-only dry run for the tag-audit backfill (program-type + essence). Reads a CSV in
 * the format written by scripts/export-tag-audit.ts, matches rows to programs by id only,
 * validates proposed slugs against the live taxonomy, and reports the exact add/remove
 * diff per category -- never guessing, never writing.
 *
 * Column matching is fuzzy (not a fixed header) since the exporter's format is still
 * being finalized -- see the resolution block printed at the top of the report/output.
 *
 * MODIFIES NOTHING. Run:
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/import-tag-audit.ts <path-to-csv>
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// CSV parsing (RFC4180-ish: quoted fields, "" escape, commas/newlines inside
// quotes, CRLF, leading BOM). No CSV dependency exists in this repo.
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) endRow();

  // Drop a fully-empty trailing row (common with a trailing newline).
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Column resolution (fuzzy)
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function suffixToCategory(suffix: string): string | null {
  if (suffix === "type" || suffix === "program_type") return "program-type";
  if (suffix === "essence") return "essence";
  return null;
}

type ColumnResolution = {
  idColumn: string | null;
  idIndex: number;
  proposalColumns: { header: string; index: number; category: string }[];
  unrecognizedProposedColumns: { header: string; index: number }[];
  ignoredColumns: string[];
};

function resolveColumns(header: string[]): ColumnResolution {
  let idColumn: string | null = null;
  let idIndex = -1;
  const proposalColumns: ColumnResolution["proposalColumns"] = [];
  const unrecognizedProposedColumns: ColumnResolution["unrecognizedProposedColumns"] = [];
  const ignoredColumns: string[] = [];

  header.forEach((raw, index) => {
    const norm = normalizeHeader(raw);
    if (idColumn === null && (norm === "id" || norm === "program_id")) {
      idColumn = raw;
      idIndex = index;
      return;
    }
    if (norm.startsWith("proposed_")) {
      const suffix = norm.slice("proposed_".length);
      const category = suffixToCategory(suffix);
      if (category) {
        proposalColumns.push({ header: raw, index, category });
      } else {
        unrecognizedProposedColumns.push({ header: raw, index });
      }
      return;
    }
    ignoredColumns.push(raw);
  });

  return { idColumn, idIndex, proposalColumns, unrecognizedProposedColumns, ignoredColumns };
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

type Reject = { row: number; column: string; value: string; reason: string };
type CategoryDiff = { category: string; toAdd: string[]; toRemove: string[] };
type ProgramResult = {
  row: number;
  id: string;
  name: string;
  slug: string;
  diffs: CategoryDiff[];
};

function splitValues(cell: string): string[] {
  return cell
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--apply")) {
    console.error("--apply is not implemented. This script is dry-run only.");
    process.exit(1);
  }

  const csvPath = args.find((a) => !a.startsWith("--"));
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-tag-audit.ts <path-to-csv>");
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    console.error("CSV is empty.");
    process.exit(1);
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const resolution = resolveColumns(header);

  const out: string[] = [];
  const log = (line: string = "") => {
    console.log(line);
    out.push(line);
  };

  log("# Tag import dry run");
  log("");
  log("## Column resolution");
  log("");
  log(`- id column: ${resolution.idColumn ?? "(none found)"}`);
  for (const col of resolution.proposalColumns) {
    log(`- proposal column: "${col.header}" -> category "${col.category}"`);
  }
  for (const col of resolution.unrecognizedProposedColumns) {
    log(`- UNRECOGNIZED proposed_* column (ignored): "${col.header}"`);
  }
  if (resolution.ignoredColumns.length > 0) {
    log(`- other columns (ignored): ${resolution.ignoredColumns.join(", ")}`);
  }
  log("");

  if (!resolution.idColumn || resolution.proposalColumns.length === 0) {
    log("ERROR: could not resolve required columns from header:");
    log(`  found: ${header.join(",")}`);
    mkdirSync("exports", { recursive: true });
    writeFileSync("exports/tag-import-dryrun.md", out.join("\n") + "\n");
    process.exit(1);
  }

  // Load the live taxonomy for the two categories in play.
  const allTags = await prisma.tag.findMany({ select: { slug: true, category: true } });
  const tagCategoryBySlug = new Map<string, string | null>();
  for (const t of allTags) tagCategoryBySlug.set(t.slug, t.category);

  // Load all programs with their current tags (id + category only -- name/slug come along
  // for reporting).
  const programs = await prisma.program.findMany({
    select: { id: true, slug: true, name: true, tags: { select: { slug: true, category: true } } },
  });
  const programById = new Map(programs.map((p) => [p.id, p]));

  let totalRows = 0;
  let rowsWithProposals = 0;
  let unchangedRows = 0;
  let tagsToAdd = 0;
  let tagsToRemove = 0;
  const rejects: Reject[] = [];
  const unmatchedIds: { row: number; id: string }[] = [];
  const idFirstSeenRow = new Map<string, number>();
  const duplicateIdRows: { id: string; rows: number[] }[] = [];
  const results: ProgramResult[] = [];

  dataRows.forEach((cells, i) => {
    const rowNum = i + 2; // header is row 1
    totalRows++;

    const id = (cells[resolution.idIndex] ?? "").trim();
    if (!id) return; // no id at all -- nothing to match, not counted as a proposal row

    if (idFirstSeenRow.has(id)) {
      const existing = duplicateIdRows.find((d) => d.id === id);
      if (existing) {
        existing.rows.push(rowNum);
      } else {
        duplicateIdRows.push({ id, rows: [idFirstSeenRow.get(id)!, rowNum] });
      }
    } else {
      idFirstSeenRow.set(id, rowNum);
    }

    // Determine whether this row proposes anything at all before touching the DB match,
    // per "ignore rows where proposed_type and proposed_essence are both empty".
    const rawCells = resolution.proposalColumns.map((col) => (cells[col.index] ?? "").trim());
    const hasAnyProposal = rawCells.some((c) => c.length > 0);
    if (!hasAnyProposal) {
      unchangedRows++;
      return;
    }

    const program = programById.get(id);
    if (!program) {
      unmatchedIds.push({ row: rowNum, id });
      return;
    }

    rowsWithProposals++;

    const currentByCategory = new Map<string, Set<string>>();
    for (const t of program.tags) {
      if (!t.category) continue;
      if (!currentByCategory.has(t.category)) currentByCategory.set(t.category, new Set());
      currentByCategory.get(t.category)!.add(t.slug);
    }

    const diffs: CategoryDiff[] = [];
    let rowHasChange = false;

    for (const col of resolution.proposalColumns) {
      const cell = (cells[col.index] ?? "").trim();
      if (!cell) continue; // blank cell: no change intended for this category

      const values = splitValues(cell);
      let rowRejected = false;
      for (const v of values) {
        const cat = tagCategoryBySlug.get(v);
        if (cat === undefined) {
          rejects.push({ row: rowNum, column: col.header, value: v, reason: "unknown slug" });
          rowRejected = true;
          continue;
        }
        if (cat !== col.category) {
          rejects.push({
            row: rowNum,
            column: col.header,
            value: v,
            reason: `wrong category (belongs to "${cat ?? "uncategorized"}", expected "${col.category}")`,
          });
          rowRejected = true;
        }
      }
      if (rowRejected) continue; // this cell contributes no changes

      const proposedSet = new Set(values);
      const currentSet = currentByCategory.get(col.category) ?? new Set<string>();
      const toAdd = [...proposedSet].filter((v) => !currentSet.has(v));
      const toRemove = [...currentSet].filter((v) => !proposedSet.has(v));

      if (toAdd.length > 0 || toRemove.length > 0) {
        diffs.push({ category: col.category, toAdd, toRemove });
        tagsToAdd += toAdd.length;
        tagsToRemove += toRemove.length;
        rowHasChange = true;
      }
    }

    if (rowHasChange) {
      results.push({ row: rowNum, id: program.id, name: program.name, slug: program.slug, diffs });
    } else {
      unchangedRows++;
    }
  });

  // --- Summary ---
  log("## Summary");
  log("");
  log(`- total rows: ${totalRows}`);
  log(`- rows with proposals (matched, non-blank): ${rowsWithProposals}`);
  log(`- tags to add: ${tagsToAdd}`);
  log(`- tags to remove: ${tagsToRemove}`);
  log(`- invalid values: ${rejects.length}`);
  log(`- unmatched ids: ${unmatchedIds.length}`);
  log(`- unchanged rows: ${unchangedRows}`);
  log(`- duplicate ids: ${duplicateIdRows.length}`);
  log("");

  if (rejects.length > 0) {
    log("## Invalid values");
    log("");
    for (const r of rejects) {
      log(`- row ${r.row}, column "${r.column}": "${r.value}" -- ${r.reason}`);
    }
    log("");
  }

  if (unmatchedIds.length > 0) {
    log("## Unmatched ids");
    log("");
    for (const u of unmatchedIds) {
      log(`- row ${u.row}: "${u.id}"`);
    }
    log("");
  }

  if (duplicateIdRows.length > 0) {
    log("## Duplicate ids");
    log("");
    for (const d of duplicateIdRows) {
      log(`- "${d.id}": rows ${d.rows.join(", ")}`);
    }
    log("");
  }

  log("## Proposed changes");
  log("");
  if (results.length === 0) {
    log("(none)");
  }
  for (const r of results) {
    log(`### row ${r.row}: ${r.name} (${r.slug}, ${r.id})`);
    log("");
    for (const d of r.diffs) {
      for (const add of d.toAdd) log(`- + ${d.category}: ${add}`);
      for (const rem of d.toRemove) log(`- - ${d.category}: ${rem}`);
    }
    log("");
  }

  mkdirSync("exports", { recursive: true });
  writeFileSync("exports/tag-import-dryrun.md", out.join("\n") + "\n");
  console.log("\nFull report written to exports/tag-import-dryrun.md");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
