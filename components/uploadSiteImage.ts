import { upload } from "@vercel/blob/client";

export async function uploadSiteImage(file: File): Promise<string> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/site-logo/upload",
  });
  return blob.url;
}
