"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import HomeVideoHero from "@/components/HomeVideoHero";
import { parseVideoLink } from "@/lib/videoEmbed";
import type { HomeVideoConfig } from "@/lib/homeVideoConfig";

async function patchHomeVideo(body: object): Promise<{ enabled?: boolean; config?: HomeVideoConfig }> {
  const res = await fetch("/api/admin/home-video", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Failed to save");
  return json;
}

export default function HomeVideoForm({
  initialEnabled,
  initialConfig,
}: {
  initialEnabled: boolean;
  initialConfig: HomeVideoConfig | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [savedConfig, setSavedConfig] = useState<HomeVideoConfig | null>(initialConfig);
  const [togglePending, setTogglePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState(initialConfig?.watchUrl ?? "");
  const [posterOverrideUrl, setPosterOverrideUrl] = useState(initialConfig?.posterOverrideUrl ?? "");
  const [heading, setHeading] = useState(initialConfig?.heading ?? "");
  const [description, setDescription] = useState(initialConfig?.description ?? "");
  const [ctaLabel, setCtaLabel] = useState(initialConfig?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(initialConfig?.ctaHref ?? "");

  const trimmedUrl = videoUrl.trim();
  const parsedVideo = trimmedUrl ? parseVideoLink(trimmedUrl) : null;
  const videoUrlValid =
    !trimmedUrl || (parsedVideo !== null && (parsedVideo.provider === "youtube" || parsedVideo.provider === "vimeo"));
  const ctaIncomplete = Boolean(ctaLabel.trim()) !== Boolean(ctaHref.trim());
  const visible = enabled && savedConfig !== null;

  async function handleToggle(next: boolean) {
    setTogglePending(true);
    setError(null);
    try {
      const body = await patchHomeVideo({ enabled: next });
      setEnabled(body.enabled ?? next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setTogglePending(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedUrl || !videoUrlValid || ctaIncomplete) return;
    setSaving(true);
    setError(null);
    try {
      const body = await patchHomeVideo({
        config: {
          videoUrl: trimmedUrl,
          posterOverrideUrl: posterOverrideUrl.trim() || null,
          heading: heading.trim() || null,
          description: description.trim() || null,
          ctaLabel: ctaLabel.trim() || null,
          ctaHref: ctaHref.trim() || null,
        },
      });
      if (body.config) setSavedConfig(body.config);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save video settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${visible ? "bg-accent" : "bg-muted"}`} />
        <span className="font-medium text-foreground">
          {visible ? "Currently visible on homepage" : "Hidden from homepage"}
        </span>
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={enabled ? "primary" : "secondary"}
          disabled={togglePending}
          onClick={() => handleToggle(!enabled)}
        >
          {togglePending ? "Saving..." : enabled ? "Enabled" : "Disabled"}
        </Button>
        <span className="text-xs text-muted">
          Click to {enabled ? "hide" : "show"} the video section on the homepage. Settings below are
          kept either way.
        </span>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Video URL (YouTube or Vimeo)</span>
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          {!videoUrlValid && <span className="text-xs text-danger">Enter a valid YouTube or Vimeo link.</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Poster image override (optional)</span>
          <Input
            value={posterOverrideUrl}
            onChange={(e) => setPosterOverrideUrl(e.target.value)}
            placeholder="/brand/hero-poster.png or https://..."
          />
          <span className="text-xs text-muted">
            Leave blank to use the thumbnail automatically pulled from the video.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Heading (optional)</span>
          <Input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={120} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Description (optional)</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">CTA button label (optional)</span>
            <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">CTA button link (optional)</span>
            <Input
              value={ctaHref}
              onChange={(e) => setCtaHref(e.target.value)}
              placeholder="https://... or /programs"
            />
          </label>
        </div>
        {ctaIncomplete && (
          <span className="text-xs text-danger">Provide both a CTA label and link, or leave both blank.</span>
        )}

        <Button
          type="submit"
          size="sm"
          className="w-fit"
          disabled={saving || !trimmedUrl || !videoUrlValid || ctaIncomplete}
        >
          {saving ? "Saving..." : "Save video settings"}
        </Button>
      </form>

      {savedConfig && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs text-muted">Preview (as saved)</p>
          <HomeVideoHero config={savedConfig} />
          {savedConfig.provider === "vimeo" && !savedConfig.derivedPosterUrl && !savedConfig.posterOverrideUrl && (
            <p className="text-xs text-muted">
              No thumbnail could be fetched from Vimeo — the player will show a neutral play button, or
              set a poster URL above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
