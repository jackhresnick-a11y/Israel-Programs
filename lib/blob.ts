/** Guards against arbitrary URLs being recorded as a Vercel Blob-backed resource. */
export function isVercelBlobUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
