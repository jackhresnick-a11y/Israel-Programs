import { put } from "@vercel/blob";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// SVG intentionally excluded -- an SVG can carry <script>/event-handler payloads that
// execute in the site's origin when served back inline, unlike the raster formats here.
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class UploadError extends Error {}

type SavedFile = { url: string; filename: string; mimeType: string };

/**
 * Uploads to Vercel Blob (public access). Replaces the old local-disk writer,
 * which threw EROFS on Vercel's read-only serverless filesystem -- callers only
 * depend on the returned { url, filename, mimeType }, so the switch is transparent
 * to them. `addRandomSuffix` keeps two uploads of the same original filename from
 * colliding, same as the random UUID name the disk version used.
 */
async function saveToBlob(
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

  const blob = await put(`${subdir}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  return {
    url: blob.url,
    // Just the final path segment (the stored name, incl. the random suffix), not the subdir.
    filename: blob.pathname.split("/").pop() ?? blob.pathname,
    mimeType: file.type,
  };
}

export function saveLogo(file: File) {
  return saveToBlob(file, "logos", ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES);
}
