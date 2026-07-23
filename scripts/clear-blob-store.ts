/**
 * One-off: enumerate (and optionally delete) blobs in the connected Vercel
 * Blob store. DRY-RUN BY DEFAULT -- prints pathname, size, and a running total,
 * and does nothing destructive unless `--delete` is passed.
 *
 * `--delete` requires one or more pathname-substring filters and deletes ONLY
 * the matching blobs -- there is deliberately no "delete everything" mode, since
 * this store turned out to hold branding assets (see the task notes), not the
 * leftover video it was expected to. Targeting by substring keeps every run
 * auditable against the dry-run listing.
 *
 * Usage (loads BLOB_READ_WRITE_TOKEN from .env / .env.local first):
 *   set -a && source .env && source .env.local && set +a
 *   npx tsx scripts/clear-blob-store.ts                       # dry run: list all
 *   npx tsx scripts/clear-blob-store.ts --delete 1g98ob lae4xg  # delete only matches
 *
 * Deletes are irreversible. Only run with --delete after eyeballing the dry-run
 * output and confirming nothing matched is still referenced anywhere.
 */
import { list, del } from "@vercel/blob";

const args = process.argv.slice(2);
const DELETE = args.includes("--delete");
// Everything after --delete (that isn't another flag) is a pathname-substring filter.
const filters = args.filter((a) => a !== "--delete" && !a.startsWith("--"));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Load it first:");
    console.error("  set -a && source .env && source .env.local && set +a");
    process.exit(1);
  }

  if (DELETE && filters.length === 0) {
    console.error("--delete requires one or more pathname-substring filters.");
    console.error("Refusing to delete the entire store. Example:");
    console.error("  npx tsx scripts/clear-blob-store.ts --delete 1g98ob lae4xg");
    process.exit(1);
  }

  console.log(
    DELETE
      ? `=== MODE: DELETE (irreversible) -- targeting blobs matching: ${filters.join(", ")} ===\n`
      : "=== MODE: dry run (no changes) ===\n"
  );

  const blobs: { pathname: string; url: string; size: number }[] = [];
  let cursor: string | undefined;
  // Paginate: list() returns at most ~1000 per page.
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const b of page.blobs) {
      blobs.push({ pathname: b.pathname, url: b.url, size: b.size });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (blobs.length === 0) {
    console.log("Store is empty. Nothing to list or delete.");
    return;
  }

  let total = 0;
  console.log(`#     ${"SIZE".padStart(12)}  PATHNAME`);
  console.log("-".repeat(72));
  blobs.forEach((b, i) => {
    total += b.size;
    console.log(`${String(i + 1).padStart(4)}  ${formatBytes(b.size).padStart(12)}  ${b.pathname}`);
  });
  console.log("-".repeat(72));
  console.log(`Total: ${blobs.length} blob(s), ${formatBytes(total)} (${total} bytes)\n`);

  if (!DELETE) {
    console.log("Dry run only. Re-run with --delete <substring>... to remove specific blobs.");
    return;
  }

  const targets = blobs.filter((b) => filters.some((f) => b.pathname.includes(f)));
  if (targets.length === 0) {
    console.log(`No blobs matched the filter(s): ${filters.join(", ")}. Nothing to delete.`);
    return;
  }

  const targetBytes = targets.reduce((sum, b) => sum + b.size, 0);
  console.log(`Matched ${targets.length} blob(s) for deletion (${formatBytes(targetBytes)}):`);
  for (const t of targets) console.log(`  - ${t.pathname}`);
  console.log();

  // del() accepts an array of URLs; chunk to stay well within request limits.
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK).map((b) => b.url);
    await del(chunk);
    deleted += chunk.length;
    console.log(`  deleted ${deleted}/${targets.length}`);
  }
  console.log(`Done. Freed ${formatBytes(targetBytes)} (${targetBytes} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
