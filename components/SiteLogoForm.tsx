"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const ALLOWED_LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";

type LogoMode = "replace" | "alongside";

export default function SiteLogoForm({
  currentLogoUrl,
  currentMode,
}: {
  currentLogoUrl: string | null;
  currentMode: LogoMode | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<LogoMode>(currentMode ?? "replace");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/site-logo/upload",
      });

      const res = await fetch("/api/admin/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, mode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save site logo");
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save site logo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove site logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove site logo");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      {currentLogoUrl && (
        <div className="flex items-center gap-4 rounded-xl border border-border p-4">
          {/* External Blob URL — plain img avoids next/image remotePatterns config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentLogoUrl} alt="Current site logo" className="h-12 w-auto" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-foreground">
              Current logo ({currentMode === "alongside" ? "shown alongside text" : "replaces text"})
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-fit"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? "Removing..." : "Remove logo"}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Logo image</span>
          <Input
            type="file"
            accept={ALLOWED_LOGO_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="font-medium text-foreground">Header display</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="replace"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            Replace the site name text
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="alongside"
              checked={mode === "alongside"}
              onChange={() => setMode("alongside")}
            />
            Show alongside the site name text
          </label>
        </fieldset>

        <Button type="submit" disabled={!file || uploading} className="w-fit">
          {uploading ? "Uploading..." : "Upload logo"}
        </Button>
      </form>
    </div>
  );
}
