"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import EmblemDefault from "@/components/EmblemDefault";
import { uploadSiteImage } from "@/components/uploadSiteImage";

const ALLOWED_LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";

export default function EmblemLogoForm({
  currentEmblemUrl,
  currentDarkEmblemUrl,
}: {
  currentEmblemUrl: string | null;
  currentDarkEmblemUrl: string | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
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
        body: JSON.stringify({ target: "emblem", url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save emblem");
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emblem");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=emblem", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove emblem");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove emblem");
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
        body: JSON.stringify({ target: "emblem", url, variant: "dark" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save dark-mode emblem");
      }
      setDarkFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dark-mode emblem");
    } finally {
      setUploadingDark(false);
    }
  }

  async function handleRemoveDark() {
    setRemovingDark(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=emblem&variant=dark", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove dark-mode emblem");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove dark-mode emblem");
    } finally {
      setRemovingDark(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex items-center gap-4 rounded-xl border border-border p-4">
        {currentEmblemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentEmblemUrl} alt="Current emblem" className="h-24 w-24" />
        ) : (
          <EmblemDefault className="h-24 w-24" />
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-foreground">
            {currentEmblemUrl ? "Current emblem" : "Default emblem (used when nothing is uploaded)"}
          </span>
          {currentEmblemUrl && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-fit"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? "Removing..." : "Remove emblem"}
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Emblem image</span>
          <Input
            type="file"
            accept={ALLOWED_LOGO_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" disabled={!file || uploading} className="w-fit">
          {uploading ? "Uploading..." : "Upload emblem"}
        </Button>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <span className="text-sm font-medium text-foreground">Dark-mode version</span>
          <p className="text-xs text-muted">
            Optional. Shown instead of the emblem above when the site is in dark
            mode. Falls back to the emblem above (or the default) if not set.
          </p>
        </div>

        {currentDarkEmblemUrl && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-primary p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentDarkEmblemUrl} alt="Current dark-mode emblem" className="h-24 w-24" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={removingDark}
              onClick={handleRemoveDark}
            >
              {removingDark ? "Removing..." : "Remove dark-mode emblem"}
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
            {uploadingDark ? "Uploading..." : "Upload dark-mode emblem"}
          </Button>
        </form>
      </div>
    </div>
  );
}
