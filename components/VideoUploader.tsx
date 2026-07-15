"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { parseVideoLink } from "@/lib/videoEmbed";

/** Short-link hosts the client can't resolve itself (no redirect-following in
 *  the browser) but shouldn't block on -- the server resolves these via
 *  resolveShortVideoLink before giving up. */
const SHORT_LINK_HOST_PATTERN = /^(www\.)?(fb\.watch|vm\.tiktok\.com|tiktok\.com\/t\/)/i;

function looksLikeSupportedLink(value: string): boolean {
  if (parseVideoLink(value)) return true;
  try {
    const url = new URL(value.trim());
    return SHORT_LINK_HOST_PATTERN.test(url.hostname + url.pathname);
  } catch {
    return false;
  }
}

/**
 * Adds a video to a program by link from YouTube, Vimeo, Facebook, Instagram,
 * or TikTok. Direct file upload (to Vercel Blob) was removed: video egress
 * through Blob is what suspended the store on the Hobby plan, so hosting
 * stays on the video platforms and the site only stores the canonical embed
 * URL (see lib/videoEmbed.ts).
 */
export default function VideoUploader({ programId }: { programId: string }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!looksLikeSupportedLink(link)) {
      setError("That doesn't look like a YouTube, Vimeo, Facebook, Instagram, or TikTok link.");
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
        placeholder="Video link (YouTube, Vimeo, Facebook, Instagram, or TikTok)"
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
        Paste a link to a video on YouTube (unlisted is fine), Vimeo, Facebook,
        Instagram, or TikTok. The video must be public.
      </p>
      <Button type="submit" size="sm" disabled={!link || saving} className="w-fit">
        {saving ? "Adding..." : "Add video"}
      </Button>
    </form>
  );
}
