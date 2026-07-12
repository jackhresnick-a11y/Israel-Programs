"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { parseVideoLink } from "@/lib/videoEmbed";

/**
 * Adds a video to a program by YouTube/Vimeo link. Direct file upload (to
 * Vercel Blob) was removed: video egress through Blob is what suspended the
 * store on the Hobby plan, so hosting stays on the video platforms and the
 * site only stores the canonical embed URL (see lib/videoEmbed.ts).
 */
export default function VideoUploader({ programId }: { programId: string }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parseVideoLink(link)) {
      setError("That doesn't look like a YouTube or Vimeo link.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/programs/${programId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, caption: caption || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add video");
      }
      setLink("");
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add video");
    } finally {
      setSaving(false);
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
        type="url"
        placeholder="YouTube or Vimeo link (e.g. https://youtu.be/...)"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <Input
        type="text"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <p className="text-xs text-muted">
        Upload your video to YouTube (unlisted is fine) or Vimeo first, then
        paste the link here.
      </p>
      <Button type="submit" size="sm" disabled={!link || saving} className="w-fit">
        {saving ? "Adding..." : "Add video"}
      </Button>
    </form>
  );
}
