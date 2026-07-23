"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";
import type { DurationType } from "@/app/generated/prisma/enums";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import TagPicker, { type TagOption, type TagCategoryOption } from "@/components/ui/TagPicker";
import { useToast } from "@/components/ui/Toast";

export type ProgramFormValues = {
  id?: string;
  slug?: string;
  name: string;
  nameHe: string;
  description: string;
  goodFor: string;
  organization: string;
  location: string;
  durationType: DurationType;
  durationText: string;
  cost: string;
  signupInstructions: string;
  signupUrl: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  hasScholarship: boolean;
  hasCollegeCredit: boolean;
  travelType: string;
  tags: string;
  logoUrl?: string | null;
};

const EMPTY: ProgramFormValues = {
  name: "",
  nameHe: "",
  description: "",
  goodFor: "",
  organization: "",
  location: "",
  durationType: "TEN_DAY",
  durationText: "",
  cost: "",
  signupInstructions: "",
  signupUrl: "",
  contactEmail: "",
  contactPhone: "",
  contactWebsite: "",
  hasScholarship: false,
  hasCollegeCredit: false,
  travelType: "",
  tags: "",
  logoUrl: null,
};

// Mirrors MAX_IMAGE_BYTES in lib/storage.ts (kept under Vercel's 4.5MB Function
// request-body limit). Enforced here so an oversize logo is caught before upload
// with an actionable message, rather than dying at the platform layer as an
// opaque 413. The server re-validates -- this is a UX guard, not the source of truth.
const MAX_LOGO_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_LOGO_MB = Math.round(MAX_LOGO_BYTES / (1024 * 1024));

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {error && <span className="text-sm text-danger">{error}</span>}
    </label>
  );
}

export default function ProgramForm({
  initial,
  allTags,
  categories,
  durationOptions,
}: {
  initial?: ProgramFormValues;
  allTags: TagOption[];
  categories: TagCategoryOption[];
  /** Ordered, admin-editable duration options (see lib/duration.ts's listDurationOptions)
   * -- rendered in this order so an admin's reordering in app/admin/tags applies here too. */
  durationOptions: { value: DurationType; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<ProgramFormValues>(initial ?? EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onLogoChange(file: File | null) {
    if (file && file.size > MAX_LOGO_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setFieldErrors((e) => ({
        ...e,
        logo: `That logo is ${mb}MB. Please choose an image under ${MAX_LOGO_MB}MB.`,
      }));
      setLogoFile(null);
      return;
    }
    setFieldErrors((e) => {
      if (!e.logo) return e;
      const rest = { ...e };
      delete rest.logo;
      return rest;
    });
    setLogoFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Defense-in-depth: onLogoChange already rejects oversize files, but guard
    // here too so a too-large logo can never reach the platform 413 boundary.
    if (logoFile && logoFile.size > MAX_LOGO_BYTES) {
      const mb = (logoFile.size / (1024 * 1024)).toFixed(1);
      setFieldErrors({ logo: `That logo is ${mb}MB. Please choose an image under ${MAX_LOGO_MB}MB.` });
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key === "id" || key === "slug" || value == null) continue;
      formData.set(key, String(value));
    }
    if (logoFile) formData.set("logo", logoFile);

    try {
      const res = await fetch(
        isEdit ? `/api/programs/${initial!.id}` : "/api/programs",
        { method: isEdit ? "PATCH" : "POST", body: formData }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.field) setFieldErrors({ [body.field]: body.error });
        throw new Error(body.error ?? "Something went wrong");
      }
      const body = await res.json();
      if (body.warning) toast(body.warning);

      // Videos are added after creation from the program page, via the
      // URL-based VideoUploader (YouTube/Vimeo/Facebook/Instagram/TikTok
      // links) — there is deliberately no video upload on this form.

      if (isEdit) {
        // PATCH returns { pending, program } (moderator, applied immediately)
        // or { pending, slug } (queued for review — nothing changed yet).
        if (body.pending) {
          toast("Your edits have been sent for review and will show up after moderator approval");
        }
        router.push(`/programs/${initial!.slug}`);
      } else {
        // POST returns the created program directly (status PENDING or PUBLISHED).
        const suffix = body.status === "PENDING" ? "?created=pending" : "";
        router.push(`/programs/${body.slug}${suffix}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Field label="Program name" error={fieldErrors.name}>
        <Input
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="Hebrew name (optional)" error={fieldErrors.nameHe}>
        <Input
          dir="rtl"
          value={values.nameHe}
          onChange={(e) => set("nameHe", e.target.value)}
        />
      </Field>

      <Field label="Description" error={fieldErrors.description}>
        <Textarea
          required
          rows={4}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="Who is this program good for?" error={fieldErrors.goodFor}>
        <Textarea
          rows={3}
          placeholder={
            'e.g. "Ideal for first-time visitors who want a broad overview; less suited to those seeking intensive text study." Describe the ideal participant — background, goals, learning style — rather than repeating cost, dates, or affiliation.'
          }
          value={values.goodFor}
          onChange={(e) => set("goodFor", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Organization" error={fieldErrors.organization}>
          <Input
            value={values.organization}
            onChange={(e) => set("organization", e.target.value)}
          />
        </Field>
        <Field label="Location" error={fieldErrors.location}>
          <Input
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Duration type" error={fieldErrors.durationType}>
          <Select
            value={values.durationType}
            onChange={(e) =>
              set("durationType", e.target.value as DurationType)
            }
          >
            {durationOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duration details" error={fieldErrors.durationText}>
          <Input
            placeholder="e.g. 10 days"
            value={values.durationText}
            onChange={(e) => set("durationText", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.hasScholarship}
            onChange={(e) => set("hasScholarship", e.target.checked)}
            className="accent-accent"
          />
          Scholarships / financial aid available
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.hasCollegeCredit}
            onChange={(e) => set("hasCollegeCredit", e.target.checked)}
            className="accent-accent"
          />
          College credit available
        </label>
        <Field label="Travel">
          <Select
            value={values.travelType}
            onChange={(e) => set("travelType", e.target.value)}
          >
            <option value="">Not specified</option>
            {Object.entries(TRAVEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="How to sign up" error={fieldErrors.signupInstructions}>
        <Textarea
          rows={2}
          value={values.signupInstructions}
          onChange={(e) => set("signupInstructions", e.target.value)}
        />
      </Field>
      <Field label="Signup URL" error={fieldErrors.signupUrl}>
        <Input
          type="url"
          placeholder="https://..."
          value={values.signupUrl}
          onChange={(e) => set("signupUrl", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Contact email" error={fieldErrors.contactEmail}>
          <Input
            type="email"
            value={values.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </Field>
        <Field label="Contact phone" error={fieldErrors.contactPhone}>
          <Input
            value={values.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
        </Field>
        <Field label="Contact website" error={fieldErrors.contactWebsite}>
          <Input
            type="url"
            placeholder="https://..."
            value={values.contactWebsite}
            onChange={(e) => set("contactWebsite", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Tags">
        <TagPicker
          value={values.tags}
          onChange={(next) => set("tags", next)}
          allTags={allTags}
          categories={categories}
        />
      </Field>

      <Field label="Logo" error={fieldErrors.logo}>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
        />
        {values.logoUrl && !logoFile && (
          <span className="text-xs text-muted">
            Current logo will be kept unless you choose a new file.
          </span>
        )}
      </Field>

      <p className="text-xs text-muted">
        Want to add a video? {isEdit ? "Open" : "After creating the program, open"} its
        page and paste a YouTube, Vimeo, Facebook, Instagram, or TikTok link.
      </p>

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create program"}
      </Button>
    </form>
  );
}
