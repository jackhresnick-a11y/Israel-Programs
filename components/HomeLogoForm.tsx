"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { uploadSiteImage } from "@/components/uploadSiteImage";

const ALLOWED_LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
const SIZE_MIN = 20;
const SIZE_MAX = 800;
const OFFSET_MIN = -1200;
const OFFSET_MAX = 1200;

type BreakpointFields = {
  size: number;
  offsetX: number;
  offsetY: number;
  layer: "front" | "back";
};

function BreakpointControls({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BreakpointFields;
  onChange: (next: BreakpointFields) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex justify-between text-foreground">
          <span>Size</span>
          <span className="text-muted">{value.size}px</span>
        </span>
        <input
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={10}
          value={value.size}
          onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
          className="accent-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex justify-between text-foreground">
          <span>Horizontal position</span>
          <span className="text-muted">
            {value.offsetX === 0 ? "centered" : value.offsetX > 0 ? `${value.offsetX}px right` : `${-value.offsetX}px left`}
          </span>
        </span>
        <input
          type="range"
          min={OFFSET_MIN}
          max={OFFSET_MAX}
          step={10}
          value={value.offsetX}
          onChange={(e) => onChange({ ...value, offsetX: Number(e.target.value) })}
          className="accent-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex justify-between text-foreground">
          <span>Vertical position</span>
          <span className="text-muted">
            {value.offsetY === 0
              ? "centered"
              : value.offsetY > 0
                ? `${value.offsetY}px down`
                : `${-value.offsetY}px up`}
          </span>
        </span>
        <input
          type="range"
          min={OFFSET_MIN}
          max={OFFSET_MAX}
          step={10}
          value={value.offsetY}
          onChange={(e) => onChange({ ...value, offsetY: Number(e.target.value) })}
          className="accent-accent"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.layer === "front"}
          onChange={(e) => onChange({ ...value, layer: e.target.checked ? "front" : "back" })}
        />
        Show in front of the text
      </label>
    </div>
  );
}

export default function HomeLogoForm({
  currentUrl,
  currentEnabled,
  currentDesktop,
  currentMobile,
  currentDarkUrl,
}: {
  currentUrl: string | null;
  currentEnabled: boolean;
  currentDesktop: BreakpointFields;
  currentMobile: BreakpointFields;
  currentDarkUrl: string | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [desktop, setDesktop] = useState(currentDesktop);
  const [mobile, setMobile] = useState(currentMobile);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [darkFile, setDarkFile] = useState<File | null>(null);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [removingDark, setRemovingDark] = useState(false);

  const appearanceDirty =
    desktop.size !== currentDesktop.size ||
    desktop.offsetX !== currentDesktop.offsetX ||
    desktop.offsetY !== currentDesktop.offsetY ||
    desktop.layer !== currentDesktop.layer ||
    mobile.size !== currentMobile.size ||
    mobile.offsetX !== currentMobile.offsetX ||
    mobile.offsetY !== currentMobile.offsetY ||
    mobile.layer !== currentMobile.layer;

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
        body: JSON.stringify({ target: "home", url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save homepage logo");
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save homepage logo");
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
        body: JSON.stringify({ target: "home", enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update homepage logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update homepage logo");
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveAppearance() {
    setSavingAppearance(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "home",
          sizeDesktop: desktop.size,
          offsetXDesktop: desktop.offsetX,
          offsetYDesktop: desktop.offsetY,
          layerDesktop: desktop.layer,
          sizeMobile: mobile.size,
          offsetXMobile: mobile.offsetX,
          offsetYMobile: mobile.offsetY,
          layerMobile: mobile.layer,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update homepage logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update homepage logo");
    } finally {
      setSavingAppearance(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=home", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove homepage logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove homepage logo");
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
        body: JSON.stringify({ target: "home", url, variant: "dark" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save dark-mode homepage logo");
      }
      setDarkFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dark-mode homepage logo");
    } finally {
      setUploadingDark(false);
    }
  }

  async function handleRemoveDark() {
    setRemovingDark(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logo?target=home&variant=dark", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to remove dark-mode homepage logo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove dark-mode homepage logo");
    } finally {
      setRemovingDark(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      {currentUrl && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-4">
            {/* External Blob URL — plain img avoids next/image remotePatterns config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="Current homepage logo" className="h-12 w-auto" />
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={currentEnabled}
                  disabled={toggling}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
                Show on the homepage next to the welcome heading
              </label>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-fit"
                disabled={removing}
                onClick={handleRemove}
              >
                {removing ? "Removing..." : "Remove homepage logo"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BreakpointControls label="Desktop" value={desktop} onChange={setDesktop} />
              <BreakpointControls label="Mobile" value={mobile} onChange={setMobile} />
            </div>
            <span className="text-xs text-muted">
              Size and position are set independently for desktop and mobile screens (below
              640px wide counts as mobile). Not reflected in the preview below.
            </span>

            <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted">
              <span className="text-xs text-muted">Preview</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt=""
                aria-hidden
                style={{ height: `${Math.min(desktop.size, 128)}px` }}
                className="pointer-events-none absolute left-1/2 top-1/2 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
              />
            </div>

            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={!appearanceDirty || savingAppearance}
              onClick={handleSaveAppearance}
            >
              {savingAppearance ? "Saving..." : "Save appearance"}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Homepage logo image</span>
          <Input
            type="file"
            accept={ALLOWED_LOGO_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <Button type="submit" disabled={!file || uploading} className="w-fit">
          {uploading ? "Uploading..." : "Upload homepage logo"}
        </Button>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <span className="text-sm font-medium text-foreground">Dark-mode version</span>
          <p className="text-xs text-muted">
            Optional. Shown instead of the homepage logo above when a visitor&rsquo;s
            device is in dark mode (same size/position settings as above). Falls back to
            the logo above if not set.
          </p>
        </div>

        {currentDarkUrl && (
          <div className="flex items-center gap-4 rounded-xl border border-border p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentDarkUrl} alt="Current dark-mode homepage logo" className="h-12 w-auto" />
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
