import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const NAVY = "#1a2740";
export const CREAM = "#fbf8f2";
export const GOLD = "#e0ac4a";

let lionPromise: Promise<string> | null = null;

/** Base64 data URI of the downscaled lion mark for OG image templates -- its
 *  baked-in background is the same navy as the template canvas, so no
 *  transparency is needed. Cached per module instance (one read per
 *  server/edge worker, not per request). */
export function lionDataUri(): Promise<string> {
  lionPromise ??= readFile(join(process.cwd(), "public/brand/og-lion.png")).then(
    (buf) => `data:image/png;base64,${buf.toString("base64")}`
  );
  return lionPromise;
}
