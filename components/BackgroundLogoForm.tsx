"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { uploadSiteImage } from "@/components/uploadSiteImage";

const ALLOWED_LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";

export default function BackgroundLogoForm({
  currentUrl,
  currentEnabled,
}: {
  currentUrl: string | null;
  currentEnabled: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ target: "background", url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save background logo");
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save background logo");
    } finally {
      setUploading(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setToggling(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "background", enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update background logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update background logo");
    } finally {
      setToggling(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=background", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove background logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove background logo");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      {currentUrl && (
        <div className="flex items-center gap-4 rounded-xl border border-border p-4">
          {/* External Blob URL — plain img avoids next/image remotePatterns config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt="Current background logo" className="h-12 w-auto" />
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={currentEnabled}
                disabled={toggling}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              Show behind the browse page heading
            </label>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-fit"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? "Removing..." : "Remove background logo"}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Background logo image</span>
          <Input
            type="file"
            accept={ALLOWED_LOGO_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <Button type="submit" disabled={!file || uploading} className="w-fit">
          {uploading ? "Uploading..." : "Upload background logo"}
        </Button>
      </form>
    </div>
  );
}
