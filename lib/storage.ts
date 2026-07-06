import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export class UploadError extends Error {}

type SavedFile = { url: string; filename: string; mimeType: string };

/**
 * Local-disk implementation. Swap this function's body for an S3/R2 client
 * later — callers only depend on the returned { url, filename, mimeType }.
 */
async function saveToUploads(
  file: File,
  subdir: string,
  allowed: Set<string>,
  maxBytes: number
): Promise<SavedFile> {
  if (!allowed.has(file.type)) {
    throw new UploadError(`Unsupported file type: ${file.type}`);
  }
  if (file.size > maxBytes) {
    throw new UploadError(`File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)`);
  }

  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return { url: `/uploads/${subdir}/${filename}`, filename, mimeType: file.type };
}

export function saveLogo(file: File) {
  return saveToUploads(file, "logos", ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES);
}
