"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { uploadSiteImage } from "@/components/uploadSiteImage";

const ALLOWED_LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";

type LogoMode = "replace" | "alongside";

export default function SiteLogoForm({
  currentLogoUrl,
  currentMode,
  currentDarkLogoUrl,
}: {
  currentLogoUrl: string | null;
  currentMode: LogoMode | null;
  currentDarkLogoUrl: string | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<LogoMode>(currentMode ?? "replace");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [darkFile, setDarkFile] = useState<File | null>(null);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [removingDark, setRemovingDark] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const url = await uploadSiteImage(file);

      const res = await fetch("/api/admin/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "header", url, mode }),
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
      const res = await fetch("/api/admin/logo?target=header", { method: "DELETE" });
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

  async function handleSubmitDark(e: React.FormEvent) {
    e.preventDefault();
    if (!darkFile) return;
    setUploadingDark(true);
    setError(null);
    try {
      const url = await uploadSiteImage(darkFile);
      const res = await fetch("/api/admin/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "header", url, variant: "dark" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save dark-mode logo");
      }
      setDarkFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dark-mode logo");
    } finally {
      setUploadingDark(false);
    }
  }

  async function handleRemoveDark() {
    setRemovingDark(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=header&variant=dark", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove dark-mode logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove dark-mode logo");
    } finally {
      setRemovingDark(false);
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

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <span className="text-sm font-medium text-foreground">Dark-mode version</span>
          <p className="text-xs text-muted">
            Optional. Shown instead of the logo above when a visitor&rsquo;s device is in
            dark mode. Falls back to the logo above if not set.
          </p>
        </div>

        {currentDarkLogoUrl && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-primary p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentDarkLogoUrl} alt="Current dark-mode logo" className="h-12 w-auto" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={removingDark}
              onClick={handleRemoveDark}
            >
              {removingDark ? "Removing..." : "Remove dark-mode logo"}
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmitDark} className="flex flex-col gap-3">
          <Input
            type="file"
            accept={ALLOWED_LOGO_TYPES}
            onChange={(e) => setDarkFile(e.target.files?.[0] ?? null)}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!darkFile || uploadingDark} className="w-fit">
            {uploadingDark ? "Uploading..." : "Upload dark-mode logo"}
          </Button>
        </form>
      </div>
    </div>
  );
}
