"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function VideoUploader({ programId }: { programId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/videos/upload",
        multipart: true,
      });

      const res = await fetch(`/api/programs/${programId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: blob.url,
          filename: file.name,
          mimeType: file.type,
          caption: caption || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to upload video");
      }
      setFile(null);
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload video");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 text-sm">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-danger">
          {error}
        </p>
      )}
      <Input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Input
        type="text"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={!file || uploading} className="w-fit">
        {uploading ? "Uploading..." : "Upload video"}
      </Button>
    </form>
  );
}
